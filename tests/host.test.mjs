import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { apply } from '../lib/index.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn) { for (let i = 0; i < 200; i++) { if (await fn()) return; await wait(10); } throw Error('Timed out'); }
async function harness(config = {}, stream) {
  const home = mkdtempSync(join(tmpdir(), 'groupchat-test-'));
  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  const routes = [], disposers = [], calls = [];
  const llm = {
    listProviders: () => [{ id: 'test', name: 'Test API' }],
    listModels: async () => [{ id: 'model', name: 'Test model' }],
    resolveModelInfo: async () => ({}),
    stream: async function* (options) {
      calls.push(options);
      if (stream) yield* stream(options, calls.length);
      else { yield { type: 'text-delta', text: calls.length % 2 === 1 ? '@B 接力' : '@A 继续' }; }
    },
  };
  apply({ llm, webServer: { register: (route) => { routes.push(route); return () => {}; } }, effect: (fn) => { disposers.push(fn()); } }, config);
  const server = createServer((req, res) => {
    const route = routes.find((r) => req.url.split('?')[0] === r.path);
    if (route) route.handler(req, res); else { res.statusCode = 404; res.end(); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const state = async () => (await (await fetch(base + '/groupchat/state')).json()).groups;
  const command = async (body) => (await (await fetch(base + '/groupchat/command', { method: 'POST', body: JSON.stringify(body) })).json());
  const group = (await command({ op: 'createGroup', name: 'test' })).group;
  const member = async (name, extra = {}) => (await command({ op: 'addMember', groupId: group.id, member: { name, provider: 'test', model: 'model', ...extra } })).member;
  const close = async () => {
    for (const d of disposers.reverse()) if (typeof d === 'function') d();
    server.closeAllConnections(); await new Promise((r) => server.close(r));
    if (previousHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previousHome;
    rmSync(home, { recursive: true, force: true });
  };
  return { base, state, command, group, member, calls, close, routes };
}

test('independent groups, personas, memory, tasks, model sources and bounded mutual @ rounds', async () => {
  const h = await harness({ autoDiscussionRounds: 2 });
  try {
    const A = await h.member('A', { persona: '审稿人', avatar: 'data:image/png;base64,YQ==' });
    await h.member('B', { provider: 'test', model: 'model' });
    await h.command({ op: 'setMemory', groupId: h.group.id, memory: 'GCr15 轴承钢' });
    const task = (await h.command({ op: 'addTask', groupId: h.group.id, title: '组织分析', assigneeId: A.id })).task;
    await h.command({ op: 'updateTask', groupId: h.group.id, taskId: task.id, patch: { status: 'in_progress' } });
    await h.command({ op: 'sendMessage', groupId: h.group.id, text: '@A 分析' });
    await until(async () => !(await h.state())[0].runtime.running);
    assert.equal(h.calls.length, 3); // A -> B -> A (two extra rounds)
    assert.ok(h.calls[0].system.includes('GCr15 轴承钢'));
    assert.ok(h.calls[0].system.includes('组织分析'));
    assert.ok(h.calls[0].system.includes('审稿人'));
    assert.equal(h.calls[0].temperature, 1);
    assert.ok(h.calls[2].messages.some((m) => m.role === 'assistant' && m.source?.provider === 'test'));
    assert.ok(h.calls.every((o) => o.messages.every((m) => m.content[0].text !== '')));
    assert.equal((await h.state())[0].messages.length, 4);
    const second = (await h.command({ op: 'createGroup', name: 'other' })).group;
    assert.equal((await h.state()).find((g) => g.id === second.id).messages.length, 0);
    assert.equal((await h.command({ op: 'sendMessage', groupId: second.id, text: 'hi' })).ok, false);
    assert.equal((await h.state()).find((g) => g.id === second.id).messages.length, 0);
  } finally { await h.close(); }
});

test('reconnect baseline has live partial text and busy/typing state; stop prevents queued calls', async () => {
  const h = await harness({}, async function* (o) {
    yield { type: 'text-delta', text: 'partial' };
    await new Promise((resolve) => {
      if (o.signal.aborted) resolve(); else o.signal.addEventListener('abort', resolve, { once: true });
    });
    o.signal.throwIfAborted();
  });
  try {
    const A = await h.member('A'); await h.member('B');
    await h.command({ op: 'sendMessage', groupId: h.group.id, text: '@所有人 start' });
    await until(async () => (await h.state())[0].messages.some((m) => m.text === 'partial'));
    const baseline = (await h.state())[0];
    assert.equal(baseline.runtime.running, true); assert.deepEqual(baseline.runtime.typing, [A.id]);
    assert.equal(baseline.messages.at(-1).status, 'streaming');
    const abort = new AbortController();
    const response = await fetch(h.base + '/groupchat/events?groupId=' + h.group.id, { signal: abort.signal });
    const reader = response.body.getReader();
    const frame = JSON.parse(new TextDecoder().decode((await reader.read()).value).split('\n')[0].slice(6));
    assert.equal(frame.group.messages.at(-1).text, 'partial'); assert.equal(frame.group.runtime.running, true);
    abort.abort(); await reader.cancel().catch(() => {});
    assert.equal((await h.command({ op: 'sendMessage', groupId: h.group.id, text: 'double' })).ok, false);
    await h.command({ op: 'stopTurn', groupId: h.group.id });
    await until(async () => !(await h.state())[0].runtime.running);
    assert.equal(h.calls.length, 1); assert.match((await h.state())[0].messages.at(-1).text, /已停止/);
  } finally { await h.close(); }
});

test('clear/delete during generation cannot resurrect history; member/task validation', async () => {
  const h = await harness({}, async function* (o) { yield { type: 'text-delta', text: 'pending' }; await wait(40); yield { type: 'text-delta', text: 'late' }; });
  try {
    const A = await h.member('A');
    assert.equal((await h.command({ op: 'addMember', groupId: h.group.id, member: { name: 'all', provider: 'p', model: 'm' } })).ok, false);
    const updated = await h.command({ op: 'updateMember', groupId: h.group.id, member: { id: A.id, name: 'A', persona: 'changed' } });
    assert.equal(updated.member.id, A.id);
    assert.equal((await h.command({ op: 'addTask', groupId: h.group.id, title: 'task', assigneeId: 'missing' })).ok, false);
    await h.command({ op: 'sendMessage', groupId: h.group.id, text: 'start' });
    await h.command({ op: 'clearMessages', groupId: h.group.id });
    await until(async () => !(await h.state())[0].runtime.running);
    assert.equal((await h.state())[0].messages.length, 0);
    await h.command({ op: 'sendMessage', groupId: h.group.id, text: 'start' });
    await h.command({ op: 'deleteGroup', groupId: h.group.id }); await wait(60);
    assert.deepEqual(await h.state(), []);
  } finally { await h.close(); }
});

test('default main-dialogue member is atomic, retains existing history and never overwrites configured members', async () => {
  const h=await harness();
  try{
    const selection={provider:'main-api',model:'main-model',reasoningEffort:'high'};
    const input={op:'ensureDefaultMember',groupId:h.group.id,selection};
    const results=await Promise.all([h.command(input),h.command(input)]);
    assert.ok(results.every(r=>r.ok));
    const g=(await h.state())[0];assert.equal(g.members.length,1);
    assert.equal(g.members[0].provider,'main-api');assert.equal(g.members[0].model,'main-model');assert.equal(g.members[0].reasoningEffort,'high');
    await h.command({op:'sendMessage',groupId:g.id,text:'reply please'});
    await until(async()=>!(await h.state())[0].runtime.running);
    assert.equal(h.calls[0].provider,'main-api');
    const saved=(await h.state())[0].messages;
    await h.command({...input,selection:{provider:'different',model:'different'}});
    assert.equal((await h.state())[0].members[0].provider,'main-api');
    assert.equal((await h.state())[0].messages.length,saved.length);
  }finally{await h.close();}
});

test('parallel tasks retain member ownership, error causes, outcomes and coordinator summary', async () => {
  let active = 0, maxActive = 0;
  const h = await harness({}, async function* (o) {
    active++; maxActive = Math.max(maxActive, active);
    try {
      await wait(30);
      if (o.messages.at(-1).content[0].text.includes('故障任务')) throw { status: 429, code: 'rate_limit', message: 'quota exhausted', cause: { message: 'daily limit' } };
      yield { type: 'text-delta', text: '交付成果' };
    } finally { active--; }
  });
  try {
    const A = await h.member('A'), B = await h.member('B');
    await h.command({ op: 'setHostContext', groupId: h.group.id, context: '主对话背景' });
    await h.command({ op: 'addTask', groupId: h.group.id, title: '正常任务', assigneeId: A.id });
    await h.command({ op: 'addTask', groupId: h.group.id, title: '故障任务', assigneeId: B.id });
    assert.equal((await h.command({ op: 'executeTasks', groupId: h.group.id })).ok, true);
    await until(async () => !(await h.state())[0].runtime.running);
    const g = (await h.state())[0];
    assert.equal(maxActive, 2); assert.equal(g.tasks[0].status, 'completed'); assert.equal(g.tasks[0].result, '交付成果');
    assert.equal(g.tasks[1].status, 'failed'); assert.match(g.tasks[1].error, /429.*rate_limit.*quota exhausted.*daily limit/);
    assert.equal(g.messages.length, 3); assert.equal(h.calls.length, 3);
    assert.ok(h.calls[0].system.includes('主对话背景'));
    assert.equal(g.hostContext, '主对话背景');
  } finally { await h.close(); }
});

test('generated memory persists separately and is injected into subsequent dialogue', async () => {
  const h = await harness({}, async function* () { yield { type: 'text-delta', text: '用户喜欢简洁回答；待办：核实方案' }; });
  try {
    await h.member('A');
    await h.command({ op: 'setMemory', groupId: h.group.id, memory: '人工指定事实' });
    await h.command({ op: 'summarizeMemory', groupId: h.group.id });
    await until(async () => !(await h.state())[0].runtime.running);
    assert.match((await h.state())[0].summary, /用户喜欢简洁回答/);
    assert.equal((await h.state())[0].memory, '人工指定事实');
    await h.command({ op: 'sendMessage', groupId: h.group.id, text: '继续' });
    await until(async () => !(await h.state())[0].runtime.running);
    assert.match(h.calls[1].system, /用户喜欢简洁回答/);
  } finally { await h.close(); }
});

test('goal decomposition assigns independent tasks and then produces visible deliverables', async () => {
  const h = await harness({}, async function* (o) {
    yield { type: 'text-delta', text: o.messages.at(-1).content[0].text.includes('只返回 JSON') ? '[{"title":"分析需求","assignee":"B"},{"title":"整理方案","assignee":"A"}]' : '成果' };
  });
  try {
    const A = await h.member('A'), B = await h.member('B');
    await h.command({ op: 'planTasks', groupId: h.group.id, text: '共同拟定方案' });
    await until(async () => !(await h.state())[0].runtime.running);
    const g = (await h.state())[0];
    assert.deepEqual(g.tasks.map((t) => t.assigneeId), [B.id, A.id]);
    assert.ok(g.tasks.every((t) => t.status === 'completed' && t.result === '成果'));
    assert.equal(g.messages[0].text, '共同拟定方案'); assert.equal(g.messages.length, 5);
    assert.equal(h.calls.length, 4);
  } finally { await h.close(); }
});

test('stop cancels concurrent work and prevents coordinator summary', async () => {
  const h = await harness({}, async function* (o) {
    yield { type: 'text-delta', text: 'partial' };
    await new Promise((r) => o.signal.aborted ? r() : o.signal.addEventListener('abort', r, { once: true }));
    o.signal.throwIfAborted();
  });
  try {
    await h.member('A'); await h.member('B');
    await h.command({ op: 'addTask', groupId: h.group.id, title: '任务一' });
    await h.command({ op: 'addTask', groupId: h.group.id, title: '任务二' });
    await h.command({ op: 'executeTasks', groupId: h.group.id });
    await until(async () => h.calls.length === 2);
    await h.command({ op: 'stopTurn', groupId: h.group.id });
    await until(async () => !(await h.state())[0].runtime.running);
    assert.equal(h.calls.length, 2); assert.ok((await h.state())[0].tasks.every((t) => t.status === 'cancelled'));
  } finally { await h.close(); }
});

test('explicit owners override planner guesses; dependent work waits and receives upstream result', async () => {
  const h = await harness({}, async function* (o) {
    const note=o.messages.at(-1).content[0].text;
    if(note.includes('只返回 JSON')) yield {type:'text-delta',text:JSON.stringify([
      {title:'调查材料',assignee:'B',source:'让 A 负责调查材料',reason:'guess',dependsOn:[]},
      {title:'汇总报告',assignee:'A',source:'B负责汇总报告',reason:'guess',dependsOn:[0]},
    ])};
    else yield {type:'text-delta',text:note.includes('调查材料')&&!note.includes('前置成果：调查材料')?'调查结果':'最终报告'};
  });
  try {
    const A=await h.member('A',{persona:'研究员，擅长调查材料'}),B=await h.member('B',{persona:'编辑，擅长汇总报告'});
    await h.command({op:'planTasks',groupId:h.group.id,text:'让 A 负责调查材料；B负责汇总报告'});
    await until(async()=>!(await h.state())[0].runtime.running);
    const g=(await h.state())[0];
    assert.deepEqual(g.tasks.map(t=>t.assigneeId),[A.id,B.id]);
    assert.ok(g.tasks.every(t=>t.assignmentReason==='用户明确指定'&&t.status==='completed'));
    assert.deepEqual(g.tasks[1].dependsOn,[g.tasks[0].id]);
    assert.match(h.calls[2].messages.at(-1).content[0].text,/前置成果：调查材料: 调查结果/);
    assert.ok(h.calls[0].messages.at(-1).content[0].text.includes('擅长汇总报告'));
    assert.ok(g.messages.find(m=>m.kind==='system'&&m.text.includes('已完成分工')));
  }finally{await h.close();}
});

test('live memory is categorized by member identity, preserves pinned notes and can be disabled', async () => {
  const h=await harness({autoDiscussionRounds:0},async function*(){yield {type:'text-delta',text:'本成员的结论'};});
  try{
    const A=await h.member('A');await h.member('B');
    await h.command({op:'setMemberMemory',groupId:h.group.id,memberId:A.id,manual:'固定偏好'});
    await h.command({op:'sendMessage',groupId:h.group.id,text:'@A 测试背景'});
    await until(async()=>!(await h.state())[0].runtime.running);
    let g=(await h.state())[0];assert.equal(g.memberMemories[A.id].notes.length,1);assert.match(g.memberMemories[A.id].notes[0].text,/测试背景.*\n.*本成员的结论/);
    assert.equal(g.memberMemories[A.id].manual,'固定偏好');
    await h.command({op:'setGroupOptions',groupId:h.group.id,autoMemory:false});
    await h.command({op:'sendMessage',groupId:h.group.id,text:'@A 后续消息'});
    await until(async()=>!(await h.state())[0].runtime.running);
    g=(await h.state())[0];assert.equal(g.memberMemories[A.id].notes.length,1);assert.match(h.calls[1].system,/固定偏好/);
    await h.command({op:'setMemberMemory',groupId:h.group.id,memberId:A.id,clearNotes:true});
    assert.equal((await h.state())[0].memberMemories[A.id].notes.length,0);
  }finally{await h.close();}
});

test('responsibility keywords route unassigned work before execution and explicit owners win', async()=>{
  const h=await harness({},async function*(o){
    yield{type:'text-delta',text:o.messages.at(-1).content[0].text.includes('只返回 JSON')?'[{"title":"热处理分析","assignee":"B"}]':'成果'};
  });
  try{
    const A=await h.member('A',{routingKeywords:'热处理,材料'}), B=await h.member('B',{routingKeywords:'写作,报告'});
    await h.command({op:'planTasks',groupId:h.group.id,text:'请做热处理分析'});
    await until(async()=>!(await h.state())[0].runtime.running);
    let g=(await h.state())[0];assert.equal(g.tasks[0].assigneeId,A.id);assert.match(g.tasks[0].assignmentReason,/关键词/);
    await h.command({op:'planTasks',groupId:h.group.id,text:'@B 热处理分析'});
    await until(async()=>!(await h.state())[0].runtime.running);
    g=(await h.state())[0];const explicit=g.tasks.find(t=>t.assignmentReason==='用户明确指定');assert.equal(explicit.assigneeId,B.id);assert.equal(g.tasks.length,2);
  }finally{await h.close();}
});

test('one session maps atomically to one group; history imports once without calling any model',async()=>{
 const h=await harness();try{
  const requests=await Promise.all([h.command({op:'ensureSessionGroup',sessionId:'old',legacyGroupId:h.group.id}),h.command({op:'ensureSessionGroup',sessionId:'old',legacyGroupId:h.group.id})]);
  assert.equal(requests[0].group.id,requests[1].group.id);assert.equal(requests[0].group.id,h.group.id);
  const second=(await h.command({op:'ensureSessionGroup',sessionId:'new'})).group;assert.notEqual(second.id,h.group.id);
  const body={op:'importHostHistory',groupId:h.group.id,sessionId:'old',messages:[{role:'user',text:'历史背景',sourceKey:'old:1'},{role:'assistant',text:'历史结论',sourceKey:'old:2'}]};
  assert.equal((await h.command(body)).imported,2);assert.equal((await h.command(body)).imported,0);assert.equal(h.calls.length,0);
  assert.equal((await h.state()).find(g=>g.id===second.id).messages.length,0);
  assert.equal((await h.command({...body,groupId:second.id})).ok,false);
 }finally{await h.close();}
});

test('connection test records success/failure without inventing chat history and changing models clears badge',async()=>{
 const h=await harness({},async function*(o){if(o.model==='bad')throw{status:401,message:'invalid_api_key'};yield{type:'text-delta',text:'OK'};});try{
  const A=await h.member('A');const result=await h.command({op:'testConnection',groupId:h.group.id,member:A});assert.equal(result.connection.state,'connected');
  assert.equal((await h.state())[0].members[0].connection.state,'connected');assert.equal((await h.state())[0].messages.length,0);
  await h.command({op:'updateMember',groupId:h.group.id,member:{...A,model:'bad'}});assert.equal((await h.state())[0].members[0].connection,undefined);
  const failed=await h.command({op:'testConnection',groupId:h.group.id,member:{...A,model:'bad'}});assert.match(failed.error,/401.*invalid_api_key/);assert.equal((await h.state())[0].members[0].connection.state,'error');
 }finally{await h.close();}
});

test('same external actor can run concurrently in two groups with independent cancellation and memories',async()=>{
 const h=await harness({autoDiscussionRounds:0},async function*(o){yield{type:'text-delta',text:'partial'};await new Promise(r=>o.signal.aborted?r():o.signal.addEventListener('abort',r,{once:true}));o.signal.throwIfAborted();});try{
  const A=await h.member('共享角色');const g2=(await h.command({op:'createGroup',name:'第二群'})).group;
  const g3=(await h.command({op:'createGroup',name:'第三群'})).group;
  const imported=[];for(const group of[g2,g3])imported.push((await h.command({op:'importMember',groupId:group.id,sourceGroupId:h.group.id,sourceMemberId:A.id})).member);
  assert.notEqual(imported[0].id,imported[1].id);
  await h.command({op:'sendMessage',groupId:g2.id,text:'独立任务二'});await h.command({op:'sendMessage',groupId:g3.id,text:'独立任务三'});
  await until(()=>h.calls.length===2);await h.command({op:'stopTurn',groupId:g2.id});
  await until(async()=>!(await h.state()).find(g=>g.id===g2.id).runtime.running);
  assert.equal(h.calls[1].signal.aborted,false);assert.equal((await h.state()).find(g=>g.id===g3.id).runtime.running,true);
  assert.equal((await h.state()).find(g=>g.id===h.group.id).messages.length,0);
  await h.command({op:'stopTurn',groupId:g3.id});await until(async()=>!(await h.state()).find(g=>g.id===g3.id).runtime.running);
 }finally{await h.close();}
});

test('hierarchy rejects cycles, readonly blocks relay, approval queues calls while independent work finishes',async()=>{
 const h=await harness({autoDiscussionRounds:1},async function*(o){yield{type:'text-delta',text:o.messages.at(-1).content[0].text.includes('轮到')?'@B 协作':'成果'};});try{
  const A=await h.member('A',{permission:'read_only'}),B=await h.member('B',{parentId:A.id});
  assert.equal((await h.command({op:'updateMember',groupId:h.group.id,member:{...A,parentId:B.id}})).ok,false);
  await h.command({op:'sendMessage',groupId:h.group.id,text:'@A 分析'});await until(async()=>!(await h.state())[0].runtime.running);assert.equal(h.calls.length,1);
  await h.command({op:'updateMember',groupId:h.group.id,member:{...A,permission:'approval'}});
  await h.command({op:'sendMessage',groupId:h.group.id,text:'@A 分析'});await until(async()=>!(await h.state())[0].runtime.running);assert.equal(h.calls.length,2);
  let g=(await h.state())[0],call=g.pendingCalls.find(c=>c.status==='pending');assert.ok(call);
  await h.command({op:'approveCall',groupId:g.id,callId:call.id});await until(async()=>!(await h.state())[0].runtime.running);assert.equal(h.calls.length,3);
  await h.command({op:'addTask',groupId:g.id,title:'需审批任务',assigneeId:A.id});await h.command({op:'addTask',groupId:g.id,title:'独立任务',assigneeId:B.id});
  await h.command({op:'executeTasks',groupId:g.id});await until(async()=>!(await h.state())[0].runtime.running);
  g=(await h.state())[0];assert.equal(g.tasks[0].status,'awaiting_approval');assert.equal(g.tasks[1].status,'completed');
  await h.command({op:'approveTask',groupId:g.id,taskId:g.tasks[0].id});await until(async()=>!(await h.state())[0].runtime.running);assert.equal((await h.state())[0].tasks[0].status,'completed');
 }finally{await h.close();}
});

test('approval of a prerequisite resumes its dependent task without interrupting another member',async()=>{
 const h=await harness({},async function*(o){yield{type:'text-delta',text:o.messages.at(-1).content[0].text.includes('只返回 JSON')?'[{"title":"资料","assignee":"A","dependsOn":[]},{"title":"报告","assignee":"B","dependsOn":[0]}]':'成果'};});try{
  await h.member('A',{permission:'approval'});await h.member('B');
  await h.command({op:'planTasks',groupId:h.group.id,text:'制定报告'});await until(async()=>!(await h.state())[0].runtime.running);
  let g=(await h.state())[0];assert.equal(g.tasks[0].status,'awaiting_approval');assert.equal(g.tasks[1].status,'pending');
  await h.command({op:'approveTask',groupId:g.id,taskId:g.tasks[0].id});
  await until(async()=>{const current=(await h.state())[0];return !current.runtime.running&&current.tasks.every(t=>t.status==='completed');});
  assert.ok((await h.state())[0].tasks.every(t=>t.result==='成果'));
 }finally{await h.close();}
});

test('working members can delegate bounded follow-up tasks with upstream output',async()=>{
 const h=await harness({autoDiscussionRounds:1},async function*(o){yield{type:'text-delta',text:o.messages.at(-1).content[0].text.includes('你负责完成任务：原始任务')?'@B 请复核我的结果':'复核成果'};});try{
  const A=await h.member('A'),B=await h.member('B');await h.command({op:'addTask',groupId:h.group.id,title:'原始任务',assigneeId:A.id});
  await h.command({op:'executeTasks',groupId:h.group.id});await until(async()=>!(await h.state())[0].runtime.running);
  const g=(await h.state())[0];assert.equal(g.tasks.length,2);assert.equal(g.tasks[1].assigneeId,B.id);assert.equal(g.tasks[1].status,'completed');assert.deepEqual(g.tasks[1].dependsOn,[g.tasks[0].id]);assert.equal(g.tasks[1].delegationDepth,1);
 }finally{await h.close();}
});

test('numeric @ targets only that member; unknown and disabled @ do not fall back to every member',async()=>{
 const h=await harness({},async function*(){yield {type:'text-delta',text:'收到，仅该成员回复。'};});
 try{
  await h.member('主对话助手',{model:'main'});await h.member('1',{model:'one'});await h.member('停用',{enabled:false});
  assert.equal((await h.command({op:'sendMessage',groupId:h.group.id,text:'@1 测试'})).ok,true);
  await until(async()=>!(await h.state())[0].runtime.running);
  assert.equal(h.calls.length,1);assert.equal(h.calls[0].model,'one');
  const count=(await h.state())[0].messages.length;
  for(const text of ['@不存在 测试','@停用 测试','@1的时候']){
   const r=await h.command({op:'sendMessage',groupId:h.group.id,text});assert.equal(r.ok,false);assert.match(r.error,/未找到启用成员/);
  }
  assert.equal(h.calls.length,1);assert.equal((await h.state())[0].messages.length,count);
 }finally{await h.close();}
});

test('opt-in full access management creates a child and calls it through bounded relay', async () => {
  const h = await harness({autoDiscussionRounds:1}, async function* (_options,n) {
    yield {type:'text-delta',text:n===1?'```groupchat-actions\n{"actions":[{"op":"create_member","name":"提示词专家","persona":"负责优化提示词","task":"给出提示词"}]}\n```':'完成提示词'};
  });
  try {
    const a=await h.member('协调者',{permission:'full'});
    await h.command({op:'setGroupOptions',groupId:h.group.id,allowAgentManagement:true});
    await h.command({op:'sendMessage',groupId:h.group.id,text:'@协调者 分配工作'});
    await until(async()=> (await h.state())[0].messages.some(m=>m.text==='完成提示词'));
    const g=(await h.state())[0];const child=g.members.find(m=>m.name==='提示词专家');
    assert.equal(child.parentId,a.id);assert.equal(child.provider,'test');assert.equal(child.model,'model');assert.equal(h.calls.length,2);
    assert.match(h.calls[1].system,/首次任务：给出提示词/);
  } finally {await h.close();}
});

test('management blocks default-off and non-full callers without losing their reply', async () => {
  for(const permission of ['full','read_only','approval']) {
    const h=await harness({autoDiscussionRounds:0},async function*(){yield {type:'text-delta',text:'```groupchat-actions\n{"actions":[{"op":"create_member","name":"越权","persona":"职责"}]}\n```'};});
    try {
      await h.member('A',{permission});if(permission!=='full')await h.command({op:'setGroupOptions',groupId:h.group.id,allowAgentManagement:true});
      await h.command({op:'sendMessage',groupId:h.group.id,text:'@A test'});
      await until(async()=> (await h.state())[0].messages.some(m=>m.kind==='member'&&m.status==='done'));
      const g=(await h.state())[0];assert.equal(g.members.length,1);assert.ok(g.messages.some(m=>m.kind==='system'&&m.status==='error'));
    } finally {await h.close();}
  }
});

test('new session defaults apply once; existing group options are retained',async()=>{
 const h=await harness();try {
  const first=await h.command({op:'ensureSessionGroup',sessionId:'fresh',workMode:true,allowAgentManagement:true});
  assert.equal(first.group.workMode,true);assert.equal(first.group.allowAgentManagement,true);
  const second=await h.command({op:'ensureSessionGroup',sessionId:'fresh',workMode:false,allowAgentManagement:false});
  assert.equal(second.group.workMode,true);assert.equal(second.group.allowAgentManagement,true);
 }finally{await h.close();}
});

test('manual import appends new main records after imported or skipped decisions and deduplicates',async()=>{
 const h=await harness();try{
  const g=(await h.command({op:'ensureSessionGroup',sessionId:'import-session'})).group;
  const input={op:'importHostHistory',groupId:g.id,sessionId:'import-session',messages:[{role:'user',text:'第一条',sourceKey:'one'}]};
  assert.equal((await h.command(input)).imported,1);
  assert.equal((await h.command({...input,append:true,messages:[...input.messages,{role:'assistant',text:'新回复',sourceKey:'two'}]})).imported,1);
  assert.equal((await h.command({...input,append:true})).imported,0);
  const second=(await h.command({op:'ensureSessionGroup',sessionId:'skip-session'})).group;
  await h.command({op:'importHostHistory',groupId:second.id,sessionId:'skip-session',skip:true});
  assert.equal((await h.command({...input,groupId:second.id,sessionId:'skip-session',append:true})).imported,1);
 }finally{await h.close();}
});

test('diagnostics persist independently of chat view and strip chat/credential fields',async()=>{
 const h=await harness();try{
  const missing=await fetch(h.base+'/groupchat/diagnostics');assert.equal(missing.status,404);
  const posted=await fetch(h.base+'/groupchat/diagnostics',{method:'POST',body:JSON.stringify({version:'beta.8',bootLog:[{event:'native-layout-change',inputs:[{top:170,height:100}],text:'PRIVATE_CHAT',apiKey:'PRIVATE_KEY'}],history:[],content:'PRIVATE_CONTENT'})});
  assert.equal(posted.status,200);
  const saved=await fetch(h.base+'/groupchat/diagnostics');const data=await saved.json();
  assert.equal(data.bootLog[0].inputs[0].top,170);assert.match(saved.headers.get('content-disposition'),/beta8-diagnostics/);
  assert.ok(!JSON.stringify(data).includes('PRIVATE_'));
  const invalid=await fetch(h.base+'/groupchat/diagnostics',{method:'POST',body:'{}'});assert.equal(invalid.status,400);
 }finally{await h.close();}
});
