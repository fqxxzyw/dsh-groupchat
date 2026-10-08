import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { apply, version } from '../lib/index.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn) { for (let i = 0; i < 200; i++) { if (await fn()) return; await wait(10); } throw Error('Timed out'); }
async function harness(config = {}, stream, { implicitFinish = true } = {}) {
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
      let finished = false;
      if (stream) for await (const chunk of stream(options, calls.length)) {
        if (chunk.type === 'finish') finished = true;
        yield chunk;
      }
      else { yield { type: 'text-delta', text: calls.length % 2 === 1 ? '@B 接力' : '@A 继续' }; }
      if (implicitFinish && !finished) yield { type: 'finish', reason: { kind: 'stop' } };
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
  return { base, state, command, group, member, calls, close, routes, llm };
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
    const g=(await h.state())[0];assert.equal(g.members.length,1);assert.equal(g.members[0].name,'大肥鱼');assert.equal(g.members[0].avatar,'https://raw.githubusercontent.com/Neko3000/deepseek-whalechan/0917fd14bb96ced343145b5c9574f5714d57c0c6/skills/whalechan-image-comic/assets/character-references/chibi/0057_patting_full_belly_rendered_isolated.webp');assert.match(g.members[0].persona,/鲸鱼娘/);
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
  const h = await harness({ replyRetryCount: 0 }, async function* (o) {
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
  const missing=await fetch(h.base+'/groupchat/diagnostics');assert.equal(missing.status,200);
  const initial=await missing.json();assert.equal(initial.host.version,version);assert.deepEqual(initial.modelCalls,[]);
  const posted=await fetch(h.base+'/groupchat/diagnostics',{method:'POST',body:JSON.stringify({version:'beta.9',bootLog:[{event:'native-layout-change',inputs:[{top:170,height:100}],text:'PRIVATE_CHAT',apiKey:'PRIVATE_KEY'}],history:[],content:'PRIVATE_CONTENT'})});
  assert.equal(posted.status,200);
  const saved=await fetch(h.base+'/groupchat/diagnostics');const data=await saved.json();
  assert.equal(data.bootLog[0].inputs[0].top,170);assert.match(saved.headers.get('content-disposition'),/beta10-diagnostics/);
  assert.ok(!JSON.stringify(data).includes('PRIVATE_'));
  const invalid=await fetch(h.base+'/groupchat/diagnostics',{method:'POST',body:'{}'});assert.equal(invalid.status,400);
 }finally{await h.close();}
});

const fastCalls = { autoDiscussionRounds: 0, retryDelayMs: 5 };
const settled = async h => { await until(async () => !(await h.state())[0].runtime.running); return (await h.state())[0]; };

test('loaded host identity is supplied by the engine and rejects a mismatched client before model work', async () => {
  const h = await harness(fastCalls);
  try {
    await h.member('A');
    const state = await (await fetch(h.base + '/groupchat/state')).json();
    assert.equal(state.host.version, version);
    assert.match(state.host.sourceFile, /lib[/\\]index\.js$/);
    assert.match(state.host.sourceHash, /^[a-f0-9]{64}$/);
    assert.ok(Number.isFinite(Date.parse(state.host.startedAt)));
    const result = await h.command({ op: 'sendMessage', groupId: h.group.id, text: 'hi', clientVersion: '1.1.0-beta.9' });
    assert.equal(result.ok, false); assert.match(result.error, /不一致/);
    assert.equal(result.host.instanceId, state.host.instanceId);
    assert.equal(h.calls.length, 0); assert.equal((await h.state())[0].messages.length, 0);
  } finally { await h.close(); }
});

test('reasoning-only evidence retains actual usage and the legacy global budget independently of the client', async () => {
  const h = await harness({ ...fastCalls, replyRetryCount: 0, replyMaxTokens: 1024 }, async function* () {
    yield { type: 'reasoning-delta', index: 0, text: 'PRIVATE_THINKING' };
    yield { type: 'PRIVATE_UNKNOWN_TYPE', text: 'PRIVATE_PAYLOAD' };
    yield { type: 'usage', usage: { inputTokens: 80, outputTokens: 2048, reasoningTokens: 2048, text: 'PRIVATE_USAGE', apiKey: 'PRIVATE_KEY' } };
    yield { type: 'finish', reason: { kind: 'stop' } };
  });
  try {
    await h.member('A'); await h.command({ op: 'sendMessage', groupId: h.group.id, text: 'hi' });
    const g = await settled(h), d = g.messages.at(-1).diagnostics;
    assert.equal(d.hostVersion, version); assert.equal(d.budgetSource, 'global'); assert.equal(d.requestedMaxTokens, 1024);
    assert.equal(d.maxTokens, 1024); assert.equal(d.eventCount, 4); assert.equal(d.unknownChunkCount, 1);
    assert.deepEqual(d.usage, { inputTokens: 80, outputTokens: 2048, reasoningTokens: 2048 });
    assert.match(g.messages.at(-1).text, /提供商报告输出 2048 token/);
    const server = await (await fetch(h.base + '/groupchat/diagnostics')).json();
    assert.equal(server.host.config.replyMaxTokens, 1024); assert.equal(server.modelCalls.length, 1);
    assert.equal(server.modelCalls[0].operation, 'reply'); assert.equal(server.modelCalls[0].diagnostics.failureCode, 'EMPTY_RESPONSE');
    assert.ok(!JSON.stringify(server).includes('PRIVATE_'));
  } finally { await h.close(); }
});

test('missing token usage is left unknown rather than described as zero output tokens', async () => {
  const h = await harness({ ...fastCalls, replyRetryCount: 0 }, async function* () { yield { type: 'finish', reason: { kind: 'stop' } }; });
  try {
    await h.member('A'); await h.command({ op: 'sendMessage', groupId: h.group.id, text: 'hi' });
    const m = (await settled(h)).messages.at(-1);
    assert.equal(m.diagnostics.usage, undefined); assert.match(m.text, /未报告 token 用量/);
    assert.match(m.text, /不能判断为 0 token/);
  } finally { await h.close(); }
});

test('prepared calls materialize exact adapter defaults with a fresh one-shot handle on SERVER retry', async () => {
  const h = await harness(fastCalls, async function* (_options, n) {
    if (n === 1) { yield { type: 'finish', reason: { kind: 'error', failure: { code: 'SERVER', message: 'temporary server failure' } } }; return; }
    yield { type: 'text-delta', index: 0, text: 'HTML reply' };
    yield { type: 'usage', usage: { inputTokens: 100, outputTokens: 10 } };
  });
  let handles = 0;
  h.llm.prepareCall = async (seed, signal) => {
    assert.equal('maxTokens' in seed, false); assert.equal('reasoningEffort' in seed, false); assert.ok(signal instanceof AbortSignal);
    handles++; let used = false;
    return { config: Object.freeze({ ...seed, maxTokens: 16384, reasoningEffort: 'low' }), adapterDefaults: { maxTokens: true, reasoningEffort: true },
      stream(options) { assert.equal(used, false); used = true; return h.llm.stream(options); } };
  };
  try {
    await h.member('A'); await h.command({ op: 'sendMessage', groupId: h.group.id, text: 'hi' });
    const m = (await settled(h)).messages.at(-1), d = m.diagnostics;
    assert.equal(handles, 2); assert.equal(h.calls.length, 2); assert.equal(m.status, 'done');
    assert.equal(d.maxTokens, 16384); assert.equal(d.requestedMaxTokens, undefined); assert.equal(d.budgetSource, 'adapter');
    assert.equal(d.reasoningEffort, 'low'); assert.equal(d.requestMode, 'prepared'); assert.equal(d.history[0].failureCode, 'SERVER');
    assert.ok(h.calls.every(o => o.maxTokens === 16384 && o.reasoningEffort === 'low'));
    const log = await (await fetch(h.base + '/groupchat/diagnostics')).json();
    assert.deepEqual(log.modelCalls.map(entry => entry.diagnostics.phase), ['retrying', 'done']);
    assert.equal(log.modelCalls[0].callId, log.modelCalls[1].callId);
  } finally { await h.close(); }
});

test('invalid prepared configuration never falls back to an unchecked direct request', async () => {
  const h = await harness(fastCalls);
  h.llm.prepareCall = async () => { const error = new Error('unsupported effort'); error.code = 'INVALID_REASONING_EFFORT'; throw error; };
  try {
    await h.member('A'); await h.command({ op: 'sendMessage', groupId: h.group.id, text: 'hi' });
    const m = (await settled(h)).messages.at(-1);
    assert.equal(h.calls.length, 0); assert.equal(m.status, 'error'); assert.equal(m.diagnostics.attempt, 1);
    assert.equal(m.diagnostics.failureCode, 'INVALID_REASONING_EFFORT');
  } finally { await h.close(); }
});

test('cancellation releases an unresponsive prepared-call lookup without dispatching later', async () => {
  const h = await harness(fastCalls); let resolve;
  h.llm.prepareCall = () => new Promise(r => { resolve = r; });
  try {
    await h.member('A'); await h.command({ op: 'sendMessage', groupId: h.group.id, text: 'hi' });
    await until(() => Boolean(resolve)); await h.command({ op: 'stopTurn', groupId: h.group.id });
    const m = (await settled(h)).messages.at(-1);
    assert.match(m.text, /已停止/); assert.equal(h.calls.length, 0);
    resolve({ config: { provider: 'test', model: 'model' }, stream: o => h.llm.stream(o) });
    await wait(10); assert.equal(h.calls.length, 0);
  } finally { await h.close(); }
});

test('model budgets are omitted by default in dialogue, planning and connection tests', async () => {
  const h = await harness(fastCalls, async function* (o) {
    yield { type: 'text-delta', text: o.messages.at(-1).content[0].text.includes('只返回 JSON')
      ? '[{"title":"交付文字方案","assignee":"A","dependsOn":[]}]' : 'OK' };
  });
  try {
    const A = await h.member('A');
    await h.command({ op:'sendMessage', groupId:h.group.id, text:'@A hello' }); await settled(h);
    assert.equal((await h.command({op:'testConnection',groupId:h.group.id,member:A})).ok,true);
    await h.command({op:'planTasks',groupId:h.group.id,text:'写一份方案'}); await settled(h);
    assert.ok(h.calls.length >= 5);
    assert.ok(h.calls.every(o => !Object.hasOwn(o,'maxTokens')));
  } finally { await h.close(); }
});

test('explicit member budgets override global budgets; clearing sampling settings removes stale values', async () => {
  const h = await harness({...fastCalls,replyMaxTokens:4096},async function*(){yield{type:'text-delta',text:'OK'};});
  try {
    const A = await h.member('A',{maxTokens:8192,temperature:0.3,reasoningEffort:'max'});
    await h.command({op:'sendMessage',groupId:h.group.id,text:'hi'}); await settled(h);
    assert.equal(h.calls[0].maxTokens,8192);
    const changed = await h.command({op:'updateMember',groupId:h.group.id,member:{...A,maxTokens:null,temperature:null,reasoningEffort:''}});
    assert.equal(changed.member.maxTokens,undefined); assert.equal(changed.member.temperature,undefined); assert.equal(changed.member.reasoningEffort,undefined);
    await h.command({op:'sendMessage',groupId:h.group.id,text:'hi again'}); await settled(h);
    assert.equal(h.calls[1].maxTokens,4096); assert.equal(h.calls[1].temperature,1); assert.ok(!Object.hasOwn(h.calls[1],'reasoningEffort'));
  } finally { await h.close(); }
});

test('reasoning-only max-tokens preserves diagnosis without showing thinking or retrying a budget failure',async()=>{
  const secret='PRIVATE_REASONING';
  const h=await harness(fastCalls,async function*(){yield{type:'reasoning-delta',index:0,text:secret};yield{type:'finish',reason:{kind:'max-tokens'}};});
  try {
    await h.member('A',{maxTokens:1024}); await h.command({op:'sendMessage',groupId:h.group.id,text:'代码'});
    const g=await settled(h),m=g.messages.at(-1);
    assert.equal(h.calls.length,1);assert.equal(m.status,'error');assert.match(m.text,/MAX_TOKENS.*输出上限/);
    assert.equal(m.diagnostics.reasoningChars,secret.length);assert.equal(m.diagnostics.finishReason,'max-tokens');assert.ok(!JSON.stringify(g).includes(secret));
    assert.equal(g.memberMemories.A,undefined);
  }finally{await h.close();}
});

test('truncated visible output remains an error and cannot create agents, relay or become memory',async()=>{
  const h=await harness(fastCalls,async function*(){yield{type:'text-delta',text:'@B partial\n```groupchat-actions\n{"actions":[{"op":"create_member","name":"C"}]}\n```'};yield{type:'finish',reason:{kind:'max-tokens'}};});
  try{
    const A=await h.member('A');await h.member('B');await h.command({op:'setGroupOptions',groupId:h.group.id,allowAgentManagement:true});
    await h.command({op:'sendMessage',groupId:h.group.id,text:'@A 写代码'});const g=await settled(h);
    assert.equal(h.calls.length,1);assert.equal(g.members.length,2);assert.equal(g.messages.at(-1).status,'error');assert.match(g.messages.at(-1).text,/partial.*[\s\S]*MAX_TOKENS/);assert.equal(g.memberMemories[A.id]?.notes.length??0,0);
  }finally{await h.close();}
});

test('transport and reasoning-only empty response retry within one bubble, then record one successful result',async()=>{
  const h=await harness(fastCalls,async function*(o,n){
    if(n===1){yield{type:'finish',reason:{kind:'error',failure:{code:'TRANSPORT',message:'channel failed',status:503,requestId:'request-one'}}};return;}
    if(n===2){yield{type:'reasoning-delta',text:'PRIVATE_REASONING'};yield{type:'finish',reason:{kind:'stop'}};return;}
    yield{type:'text-delta',text:'正文已恢复'};
  });
  try{
    const A=await h.member('A');await h.command({op:'sendMessage',groupId:h.group.id,text:'@A 你好'});const g=await settled(h),m=g.messages.at(-1);
    assert.equal(h.calls.length,3);assert.equal(g.messages.length,2);assert.equal(m.text,'正文已恢复');assert.equal(m.status,'done');assert.equal(m.diagnostics.attempt,3);
    assert.deepEqual(m.diagnostics.history.map(d=>d.failureCode),['TRANSPORT','EMPTY_RESPONSE']);assert.equal(m.diagnostics.history[0].requestId,'request-one');assert.equal(g.memberMemories[A.id].notes.length,1);assert.ok(!JSON.stringify(g).includes('PRIVATE_REASONING'));
  }finally{await h.close();}
});

test('empty completions exhaust exactly two retries and retain their actual finish reason',async()=>{
  const h=await harness(fastCalls,async function*(){yield{type:'finish',reason:{kind:'stop'}};});try{
    await h.member('A');await h.command({op:'sendMessage',groupId:h.group.id,text:'hi'});const g=await settled(h);
    assert.equal(h.calls.length,3);assert.equal(g.messages.length,2);assert.match(g.messages.at(-1).text,/EMPTY_RESPONSE.*已尝试 3 次/);assert.equal(g.messages.at(-1).diagnostics.finishReason,'stop');
  }finally{await h.close();}
});

for(const failure of [{code:'QUOTA',message:'out of quota',status:429},{code:'AUTHENTICATION',message:'invalid key',status:401},{code:'CONTEXT_WINDOW_EXCEEDED',message:'context too long',status:400}]){
  test(`structured ${failure.code} is preserved and never retried`,async()=>{
    const h=await harness(fastCalls,async function*(){const e=Error('adapter wrapper');e.failure={...failure,requestId:'request-fatal'};throw e;});try{
      await h.member('A');await h.command({op:'sendMessage',groupId:h.group.id,text:'hi'});const g=await settled(h),m=g.messages.at(-1);
      assert.equal(h.calls.length,1);assert.ok(m.text.includes(failure.code));assert.ok(m.text.includes(`HTTP ${failure.status}`));assert.ok(m.text.includes('request-fatal'));assert.equal(m.diagnostics.failureCode,failure.code);
    }finally{await h.close();}
  });
}

test('visible partial transport failures never replay text or pollute subsequent successful history',async()=>{
  const h=await harness(fastCalls,async function*(o,n){yield{type:'text-delta',text:n===1?'PARTIAL_FAILED':'OK'};if(n===1)yield{type:'finish',reason:{kind:'error',failure:{code:'TRANSPORT',message:'lost midstream'}}};});try{
    await h.member('A');await h.command({op:'sendMessage',groupId:h.group.id,text:'first'});const g=await settled(h);
    assert.equal(h.calls.length,1);assert.match(g.messages.at(-1).text,/PARTIAL_FAILED[\s\S]*TRANSPORT/);
    await h.command({op:'sendMessage',groupId:h.group.id,text:'second'});await settled(h);
    assert.equal(h.calls.length,2);assert.ok(!JSON.stringify(h.calls[1].messages).includes('PARTIAL_FAILED'));
  }finally{await h.close();}
});

test('assembled block-end fallback deduplicates text and counts reasoning without exposing it',async()=>{
  const h=await harness(fastCalls,async function*(){
    yield{type:'reasoning-delta',index:0,text:'secret'};yield{type:'block-end',index:0,block:{type:'reasoning',text:'secret extra'}};
    yield{type:'text-delta',index:1,text:'你'};yield{type:'block-end',index:1,block:{type:'text',text:'你好'}};yield{type:'block-end',index:2,block:{type:'text',text:'，世界'}};
  });try{
    await h.member('A');await h.command({op:'sendMessage',groupId:h.group.id,text:'hi'});const g=await settled(h);
    assert.equal(g.messages.at(-1).text,'你好，世界');assert.equal(g.messages.at(-1).diagnostics.reasoningChars,12);assert.ok(!JSON.stringify(g).includes('secret'));
  }finally{await h.close();}
});

test('missing finish is classified as incomplete transport, preserving partial text without retry',async()=>{
  const h=await harness(fastCalls,async function*(){yield{type:'text-delta',text:'partial'};},{implicitFinish:false});try{
    await h.member('A');await h.command({op:'sendMessage',groupId:h.group.id,text:'hi'});const g=await settled(h);
    assert.equal(h.calls.length,1);assert.equal(g.messages.at(-1).status,'error');assert.match(g.messages.at(-1).text,/INCOMPLETE_RESPONSE/);
  }finally{await h.close();}
});

test('stop releases a group even when adapter next ignores abort, allowing a fresh conversation',async()=>{
  const h=await harness({...fastCalls,replyIdleTimeoutMs:5000},async function*(o,n){if(n===1)await new Promise(()=>{});else yield{type:'text-delta',text:'new reply'};});try{
    await h.member('A');await h.command({op:'sendMessage',groupId:h.group.id,text:'first'});await until(()=>h.calls.length===1);
    await h.command({op:'stopTurn',groupId:h.group.id});const stopped=await settled(h);assert.equal(stopped.messages.at(-1).text,'[已停止]');assert.ok(h.calls[0].signal.aborted);
    assert.equal((await h.command({op:'sendMessage',groupId:h.group.id,text:'second'})).ok,true);assert.equal((await settled(h)).messages.at(-1).text,'new reply');assert.equal(h.calls.length,2);
  }finally{await h.close();}
});

test('idle timeout bounds a nonresponsive adapter, retries at most twice, and clears typing/busy',async()=>{
  const h=await harness({...fastCalls,replyIdleTimeoutMs:25,replyTimeoutMs:1000},async function*(){await new Promise(()=>{});});try{
    await h.member('A');await h.command({op:'sendMessage',groupId:h.group.id,text:'hi'});const g=await settled(h);
    assert.equal(h.calls.length,3);assert.match(g.messages.at(-1).text,/TIMEOUT/);assert.equal(g.runtime.running,false);assert.deepEqual(g.runtime.typing,[]);assert.ok(h.calls.every(o=>o.signal.aborted));
  }finally{await h.close();}
});

test('active reasoning refreshes the idle watchdog while the total deadline still bounds a call',async()=>{
  const h=await harness({...fastCalls,replyIdleTimeoutMs:80,replyTimeoutMs:1000},async function*(){for(let n=0;n<6;n++){await wait(25);yield{type:'reasoning-delta',text:'x'};}yield{type:'text-delta',text:'OK'};});try{
    await h.member('A');await h.command({op:'sendMessage',groupId:h.group.id,text:'hi'});const g=await settled(h);
    assert.equal(h.calls.length,1);assert.equal(g.messages.at(-1).text,'OK');assert.equal(g.messages.at(-1).diagnostics.reasoningChars,6);
  }finally{await h.close();}
});

test('stop during retry backoff prevents another model call',async()=>{
  const h=await harness({...fastCalls,retryDelayMs:500},async function*(){yield{type:'finish',reason:{kind:'error',failure:{code:'TRANSPORT',message:'failed'}}};});try{
    await h.member('A');await h.command({op:'sendMessage',groupId:h.group.id,text:'hi'});await until(async()=> (await h.state())[0].messages.at(-1)?.diagnostics?.phase==='retrying');
    await h.command({op:'stopTurn',groupId:h.group.id});const g=await settled(h);assert.equal(h.calls.length,1);assert.equal(g.messages.at(-1).text,'[已停止]');assert.equal(g.messages.at(-1).diagnostics.phase,'stopped');
  }finally{await h.close();}
});

test('terminal finish closes plugin wait without waiting for a broken iterator to end',async()=>{
  const h=await harness(fastCalls,async function*(){yield{type:'text-delta',text:'OK'};yield{type:'finish',reason:{kind:'stop'}};await new Promise(()=>{});});try{
    await h.member('A');await h.command({op:'sendMessage',groupId:h.group.id,text:'hi'});assert.equal((await settled(h)).messages.at(-1).text,'OK');
  }finally{await h.close();}
});

test('connection tests reject finish-only false positives and bound ignored abort',async()=>{
  for(const stalled of [false,true]){
    const h=await harness({...fastCalls,replyRetryCount:0,connectionTestTimeoutMs:40,replyIdleTimeoutMs:1000},async function*(){if(stalled)await new Promise(()=>{});else yield{type:'finish',reason:{kind:'stop'}};});try{
      const A=await h.member('A');const result=await h.command({op:'testConnection',groupId:h.group.id,member:A});
      assert.equal(result.ok,false);assert.match(result.error,stalled?/TIMEOUT/:/EMPTY_RESPONSE/);const g=(await h.state())[0];assert.equal(g.members[0].connection.state,'error');assert.equal(g.messages.length,0);assert.ok(!Object.hasOwn(h.calls[0],'maxTokens'));
    }finally{await h.close();}
  }
});

test('planning shares transient retries and budget diagnostics with dialogue',async()=>{
  const h=await harness(fastCalls,async function*(o,n){if(n===1){yield{type:'finish',reason:{kind:'error',failure:{code:'TRANSPORT',message:'failed'}}};return;}yield{type:'text-delta',text:o.messages.at(-1).content[0].text.includes('只返回 JSON')?'[{"title":"交付方案","assignee":"A"}]':'完成'};});try{
    await h.member('A');await h.command({op:'planTasks',groupId:h.group.id,text:'写方案'});const g=await settled(h);assert.equal(h.calls.length,4);assert.equal(g.tasks[0].status,'completed');assert.ok(g.messages.every(m=>m.status==='done'));
  }finally{await h.close();}
});

test('planning max-tokens does not become a misleading JSON parse error or schedule tasks',async()=>{
  const h=await harness(fastCalls,async function*(){yield{type:'reasoning-delta',text:'hidden'};yield{type:'finish',reason:{kind:'max-tokens'}};});try{
    await h.member('A');await h.command({op:'planTasks',groupId:h.group.id,text:'写方案'});const g=await settled(h);assert.equal(g.tasks.length,0);assert.equal(h.calls.length,1);assert.match(g.messages.at(-1).text,/MAX_TOKENS/);assert.equal(g.messages.at(-1).diagnostics.reasoningChars,6);
  }finally{await h.close();}
});

test('chat stays chat with pending tasks; explicit empty-board execution infers grounded tasks from dialogue',async()=>{
  const source='@A 写一个 CNN 演示 HTML';
  const h=await harness(fastCalls,async function*(o){yield{type:'text-delta',text:o.messages.at(-1).content[0].text.includes('只返回 JSON')?JSON.stringify([{title:'写一个 CNN 演示 HTML',assignee:'B',source,dependsOn:[]}]):'等待协作指令'};});try{
    const A=await h.member('A');await h.member('B');await h.command({op:'sendMessage',groupId:h.group.id,text:source});const chat=await settled(h);assert.equal(chat.tasks.length,0);assert.equal(h.calls.length,1);
    assert.equal((await h.command({op:'executeTasks',groupId:h.group.id})).ok,true);const g=await settled(h);assert.equal(g.tasks.length,1);assert.equal(g.tasks[0].assigneeId,A.id);assert.equal(g.tasks[0].status,'completed');assert.equal(g.messages.filter(m=>m.kind==='user').length,1);
    const task=(await h.command({op:'addTask',groupId:h.group.id,title:'以后再执行'})).task;
    const count=h.calls.length;await h.command({op:'sendMessage',groupId:h.group.id,text:'@A 你好'});const end=await settled(h);assert.equal(h.calls.length,count+1);assert.equal(end.tasks.find(t=>t.id===task.id).status,'pending');
  }finally{await h.close();}
});

test('work-mode greeting falls back to targeted chat without creating or executing tasks',async()=>{
  const h=await harness(fastCalls,async function*(o){yield{type:'text-delta',text:o.messages.at(-1).content[0].text.includes('只返回 JSON')?'[]':'你好'};});try{
    const A=await h.member('A');await h.member('B');await h.command({op:'setGroupOptions',groupId:h.group.id,workMode:true});
    await h.command({op:'planTasks',groupId:h.group.id,text:'@A 你好',allowChatFallback:true});const g=await settled(h);
    assert.equal(g.tasks.length,0);assert.equal(g.messages.length,2);assert.equal(g.messages.at(-1).speakerId,A.id);assert.equal(g.messages.at(-1).text,'你好');assert.equal(g.runtime.running,false);
  }finally{await h.close();}
});

test('empty-board inference does not invent tasks from greetings or create phantom user messages',async()=>{
  const h=await harness(fastCalls,async function*(o){yield{type:'text-delta',text:o.messages.at(-1).content[0].text.includes('只返回 JSON')?'[]':'你好'};});try{
    await h.member('A');await h.command({op:'executeTasks',groupId:h.group.id});let g=await settled(h);assert.equal(h.calls.length,0);assert.equal(g.tasks.length,0);
    await h.command({op:'sendMessage',groupId:h.group.id,text:'你好'});await settled(h);await h.command({op:'planTasks',groupId:h.group.id,text:''});g=await settled(h);
    assert.equal(g.tasks.length,0);assert.equal(g.messages.filter(m=>m.kind==='user').length,1);assert.match(g.messages.at(-1).text,/未识别到/);
  }finally{await h.close();}
});

test('inferred task sources must be actual user text, not a model invention',async()=>{
  const h=await harness(fastCalls,async function*(o){yield{type:'text-delta',text:o.messages.at(-1).content[0].text.includes('只返回 JSON')?'[{"title":"删除文件","assignee":"A","source":"用户从未说过"}]':'你好'};});try{
    await h.member('A');await h.command({op:'sendMessage',groupId:h.group.id,text:'你好'});await settled(h);await h.command({op:'executeTasks',groupId:h.group.id});const g=await settled(h);assert.equal(g.tasks.length,0);assert.match(g.messages.at(-1).text,/缺少对应的用户原句/);
  }finally{await h.close();}
});

test('mention routing supports fullwidth @, punctuation and case-insensitive all, ignoring email addresses',async()=>{
  const h=await harness(fastCalls,async function*(){yield{type:'text-delta',text:'OK'};});try{
    const A=await h.member('前端工程'),B=await h.member('前端工程师');
    await h.command({op:'sendMessage',groupId:h.group.id,text:'请＠前端工程师；写示例，邮箱 test@example.com'});let g=await settled(h);assert.equal(h.calls.length,1);assert.equal(g.messages.at(-1).speakerId,B.id);
    await h.command({op:'sendMessage',groupId:h.group.id,text:'@ALL 你好'});g=await settled(h);assert.equal(h.calls.length,3);assert.deepEqual(g.messages.filter(m=>m.kind==='member').slice(-2).map(m=>m.speakerId),[A.id,B.id]);
    const before=h.calls.length;assert.equal((await h.command({op:'planTasks',groupId:h.group.id,text:'@前端 写代码'})).ok,false);assert.equal(h.calls.length,before);
  }finally{await h.close();}
});

test('provider retry delay is respected before a successful second attempt',async()=>{
  const starts=[];
  const h=await harness(fastCalls,async function*(o,n){starts.push(Date.now());if(n===1)yield{type:'finish',reason:{kind:'error',failure:{code:'RATE_LIMIT',status:429,message:'try later',providerRetryAfterMs:50}}};else yield{type:'text-delta',text:'OK'};});try{
    await h.member('A');await h.command({op:'sendMessage',groupId:h.group.id,text:'hi'});const g=await settled(h);assert.equal(h.calls.length,2);assert.ok(starts[1]-starts[0]>=45);assert.equal(g.messages.at(-1).text,'OK');
  }finally{await h.close();}
});

test('total deadline ends continuously active reasoning without retrying the expired call',async()=>{
  const h=await harness({...fastCalls,replyTimeoutMs:100,replyIdleTimeoutMs:1000},async function*(){for(let i=0;i<20;i++){await wait(20);yield{type:'reasoning-delta',text:'x'};}});try{
    await h.member('A');await h.command({op:'sendMessage',groupId:h.group.id,text:'hi'});const g=await settled(h);assert.equal(h.calls.length,1);assert.match(g.messages.at(-1).text,/TIMEOUT.*超过/);assert.equal(g.messages.at(-1).diagnostics.failureCode,'TIMEOUT');assert.equal(g.runtime.running,false);
  }finally{await h.close();}
});
