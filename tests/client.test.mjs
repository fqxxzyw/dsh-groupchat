import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8').replace('exports.apply = apply;', 'exports.__test = { store, createApi, applyFrame, mergeCommandGroup, activeGroup, mainSelectionOf, hostContextOf, markdownBlocks, safeLink, bootLog, hostCompatibility, receiveHost, normalizePreferences, uiScale, taskPresentation }; exports.apply = apply;');
const host = { version: '1.1.0-beta.11', instanceId: 'test-host', sourceFile: 'C:/plugins/dsh-groupchat/lib/index.js', config: { replyRetryCount: 2 } };
function load(fetcher, clock = { setTimeout, clearTimeout }) {
  let exports;
  const copy = (x) => typeof x !== 'object' || x === null ? x : Array.isArray(x) ? x.map(copy) : Object.fromEntries(Object.entries(x).map(([k, v]) => [k, copy(v)]));
  const createSnapshotStore = (state) => {
    const listeners = new Set();
    return { getSnapshot: () => state, subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); }, update: (fn) => { const draft = copy(state); fn(draft); state = draft; for (const fn of [...listeners]) fn(); } };
  };
  vm.runInNewContext(source, {
    window: { __ModuleLoader__: { load: (bundle) => { exports = bundle.factory((name) => name === 'react' ? { Component: class {} } : { createSnapshotStore }); } } },
    fetch: fetcher, ...clock, AbortController, TextDecoder, Date, console, crypto: { randomUUID: () => 'test-id' },
  });
  exports.__test.store.update(s => { s.host = host; s.hostChecked = true; });
  return exports;
}
const json = (value) => new Response(JSON.stringify({ host, ...value }), { headers: { 'content-type': 'application/json' } });
const group = { id: 'g', seq: 0, name: 'G', members: [], messages: [], tasks: [], memory: '' };

test('old or corrupted appearance preferences produce a finite, bounded UI scale', () => {
  const { normalizePreferences, uiScale } = load(async () => json({ok:true})).__test;
  for (const fontSize of [undefined, null, '', 'bad', 0, -1, Infinity, NaN]) {
    const prefs = normalizePreferences({fontSize, importMode:'skip'});
    assert.equal(prefs.fontSize,13); assert.equal(uiScale(prefs),1); assert.equal(prefs.importMode,'skip');
  }
  assert.equal(normalizePreferences({fontSize:7}).fontSize,11);
  assert.equal(normalizePreferences({fontSize:999}).fontSize,20);
  assert.equal(normalizePreferences({fontSize:'16'}).fontSize,16);
  assert.equal(uiScale({fontSize:20}),20/13);
});

test('task presentation resolves owners and preserves completion and exceptional states', () => {
  const {taskPresentation}=load(async()=>json({ok:true})).__test;
  const members=[{id:'a',name:'Alice'}];
  assert.equal(taskPresentation({assigneeId:'a',status:'completed'},members).owner,'Alice');
  assert.equal(taskPresentation({assigneeId:'a',status:'completed'},members).status,'已完成');
  for(const assigneeId of [null,'','removed-member']) assert.equal(taskPresentation({assigneeId,status:'pending'},members).owner,'未分配');
  for(const [status,label] of [['in_progress','进行中'],['failed','失败（可重试）'],['cancelled','已停止'],['awaiting_approval','待审批'],['unexpected','状态未知']]) assert.equal(taskPresentation({status},members).status,label);
});

for (const legacyHost of [null, { version: '1.1.0-beta.9', instanceId: 'old-host' }]) {
  test(`legacy host ${legacyHost?.version ?? 'without metadata'} is readable but cannot start new model work`, async () => {
    let posts = 0;
    const x = load(async (_route, options) => { if (options?.method === 'POST') posts++; return json({ ok: true, groups: [group], host: legacyHost }); });
    const { store, createApi, hostCompatibility } = x.__test;
    store.update(s => { s.host = null; s.hostChecked = false; });
    const api = createApi(store);
    try {
      await assert.rejects(api.command({ op: 'sendMessage', groupId: 'g', text: 'hi' }), /旧版|不一致/);
      assert.equal(posts, 0); assert.equal(store.getSnapshot().groups[0].id, 'g');
      assert.ok(hostCompatibility(store.getSnapshot().host));
      for (const op of ['planTasks', 'executeTasks', 'testConnection', 'summarizeMemory']) {
        await assert.rejects(api.command({ op, groupId: 'g' }), /旧版|不一致/);
      }
      assert.equal(posts, 0);
    } finally { api.dispose(); }
  });
}

test('matching host sends the client version and a stale SSE host identity blocks further model work', async () => {
  const bodies = [];
  const x = load(async (_route, options) => {
    if (options?.body) bodies.push(JSON.parse(options.body));
    return json({ ok: true, groups: [group], connection: { state: 'connected' } });
  });
  const { store, createApi, applyFrame } = x.__test, api = createApi(store);
  try {
    await api.refresh(); await api.command({ op: 'testConnection', groupId: 'g' });
    assert.equal(bodies[0].clientVersion, host.version);
    applyFrame({ type: 'snapshot', groupId: 'g', host: { version: '1.1.0-beta.8', instanceId: 'stale' }, group });
    await assert.rejects(api.command({ op: 'sendMessage', groupId: 'g', text: 'hi' }), /beta\.8/);
    assert.equal(bodies.length, 1);
    await api.refresh(); await api.command({ op: 'sendMessage', groupId: 'g', text: 'hi' });
    assert.equal(bodies.length, 2);
    const records = x.__test.bootLog.filter(entry => entry.event === 'host-identity');
    assert.ok(records.some(entry => entry.host.version === '1.1.0-beta.8' && entry.compatible === false));
    assert.equal(store.getSnapshot().host.version, host.version);
  } finally { api.dispose(); }
});

test('a command rejected by a different host updates the visible host identity before the error is raised', async () => {
  const x=load(async()=>new Response(JSON.stringify({ok:false,error:'version mismatch',host:{version:'1.1.0-beta.9',instanceId:'unexpected-host'}}),{status:400}));
  const api=x.__test.createApi(x.__test.store);
  try{
    await assert.rejects(api.command({op:'sendMessage',groupId:'g',text:'hi'}),/version mismatch/);
    assert.equal(x.__test.store.getSnapshot().host.version,'1.1.0-beta.9');
    assert.match(x.__test.hostCompatibility(x.__test.store.getSnapshot().host),/不一致/);
  }finally{api.dispose();}
});

test('model progress survives stale command snapshots and cannot overwrite a finished message', () => {
  const x = load(async () => json({ok:true}));
  const {store,applyFrame,mergeCommandGroup}=x.__test;
  store.update(s=>{s.groups=[{...group,messages:[{id:'m',seq:1,status:'streaming',text:''}]}];s.activeGroupId='g';});
  applyFrame({type:'message-progress',groupId:'g',messageId:'m',diagnostics:{phase:'reasoning',attempt:2,durationMs:100,reasoningChars:20}});
  assert.equal(store.getSnapshot().groups[0].messages[0].diagnostics.phase,'reasoning');
  const merged=mergeCommandGroup(store.getSnapshot().groups[0],{...group,seq:1,messages:[{id:'m',seq:1,status:'streaming',text:'',diagnostics:{phase:'waiting',attempt:1,durationMs:0}}]});
  assert.equal(merged.messages[0].diagnostics.attempt,2);
  const sameTime=mergeCommandGroup({...group,messages:[{id:'m',seq:1,status:'streaming',text:'',diagnostics:{phase:'reasoning',attempt:1,durationMs:0,progressSeq:2}}]}, {...group,messages:[{id:'m',seq:1,status:'streaming',text:'',diagnostics:{phase:'waiting',attempt:1,durationMs:0,progressSeq:1}}]});
  assert.equal(sameTime.messages[0].diagnostics.phase,'reasoning');
  applyFrame({type:'message',groupId:'g',message:{id:'m',seq:1,status:'done',text:'OK',diagnostics:{phase:'done'}}});
  applyFrame({type:'message-progress',groupId:'g',messageId:'m',diagnostics:{phase:'retrying'}});
  applyFrame({type:'delta',groupId:'g',messageId:'m',text:'late'});
  assert.equal(store.getSnapshot().groups[0].messages[0].text,'OK');assert.equal(store.getSnapshot().groups[0].messages[0].diagnostics.phase,'done');
  const snapshot={type:'snapshot',groupId:'g',group:{...group,messages:[{id:'restored',status:'done',text:'PRIVATE_REPLY_TEXT',diagnostics:{phase:'done',attempt:1,progressSeq:3,reasoningChars:20}}]}};
  applyFrame(snapshot);applyFrame(snapshot);
  const recovered=x.__test.bootLog.filter(entry=>entry.event==='model-call'&&entry.messageId==='restored');assert.equal(recovered.length,1);assert.equal(recovered[0].diagnostics.reasoningChars,20);assert.ok(!JSON.stringify(recovered).includes('PRIVATE_REPLY_TEXT'));
});

test('connection checks allow the host deadline while ordinary commands keep the short HTTP timeout', async () => {
  const delays=[];
  const x=load(async()=>json({ok:true}),{setTimeout:(fn,ms)=>{delays.push(ms);return delays.length;},clearTimeout:()=>{}});
  const api=x.__test.createApi(x.__test.store);
  try{await api.command({op:'testConnection',groupId:'g'});await api.command({op:'stopTurn',groupId:'g'});assert.deepEqual(delays,[75000,15000]);}
  finally{api.dispose();}
});

test('failed refresh preserves history, ends loading, and never creates a default group', async () => {
  const x = load(async () => { throw Error('offline'); });
  const { store, createApi } = x.__test;
  store.update((s) => { s.groups = [{ ...group, messages: [{ id: 'old', text: 'history' }] }]; s.activeGroupId = 'g'; });
  const api = createApi(store);
  await assert.rejects(api.refresh(), /offline/);
  assert.equal(store.getSnapshot().loadStatus, 'error');
  assert.equal(store.getSnapshot().groups[0].messages[0].text, 'history');
  await api.ensureDefaultGroup(); assert.equal(store.getSnapshot().groups.length, 1); api.dispose();
});

test('concurrent refresh is deduplicated and stale active selection is repaired', async () => {
  let count = 0;
  const x = load(async () => { count++; return json({ ok: true, groups: [group] }); });
  const api = x.__test.createApi(x.__test.store);
  await Promise.all([api.refresh(), api.refresh()]);
  assert.equal(count, 1); assert.equal(x.__test.store.getSnapshot().activeGroupId, 'g');
  assert.equal(x.__test.store.getSnapshot().loadStatus, 'ready'); api.dispose();
});

test('state renders before stalled catalog; default creation is single-flight', async () => {
  let creates = 0;
  const x = load(async (route, options) => {
    if (route.endsWith('/state')) return json({ ok: true, groups: [] });
    if (route.endsWith('/catalog')) return new Promise((resolve, reject) => { options.signal.addEventListener('abort', () => reject(Error('aborted')), { once: true }); });
    creates++; return json({ ok: true, group });
  });
  const api = x.__test.createApi(x.__test.store);
  await api.refresh();
  const a = api.ensureDefaultGroup(), b = api.ensureDefaultGroup();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(creates, 1); assert.equal(x.__test.store.getSnapshot().groups.length, 1);
  assert.equal(x.__test.store.getSnapshot().loadStatus, 'ready');
  api.dispose(); await Promise.allSettled([a, b]);
});

test('failed send adds no phantom message; successful group creation inserts once', async () => {
  const x = load(async (route, options) => {
    const body = JSON.parse(options.body);
    if (body.op === 'sendMessage') return json({ ok: false, error: 'bad provider' });
    return json({ ok: true, group: { ...group, members: [{id:'a',enabled:true}] } });
  });
  const api = x.__test.createApi(x.__test.store);
  await api.command({ op: 'createGroup' }); await assert.rejects(api.sendMessage('g', 'hi'), /bad provider/);
  assert.equal(x.__test.store.getSnapshot().groups.length, 1);
  assert.equal(x.__test.store.getSnapshot().groups[0].messages.length, 0); api.dispose();
});

test('SSE EOF reconnects, fragmented CRLF frames restore busy state, disposal cancels retry', async () => {
  const timers = new Map(); let seq = 0, connections = 0;
  const x = load(async () => {
    connections++;
    const frame = 'data: ' + JSON.stringify({ type: 'snapshot', groupId: 'g', group: { ...group, runtime: { running: true, responders: ['a'], typing: ['a'] } } }) + '\r\n\r\n';
    return new Response(new ReadableStream({ start(c) { const bytes = new TextEncoder().encode(frame); c.enqueue(bytes.slice(0, 17)); c.enqueue(bytes.slice(17)); c.close(); } }));
  }, { setTimeout: (fn, ms) => { const id = ++seq; timers.set(id, { fn, ms }); return id; }, clearTimeout: (id) => timers.delete(id) });
  x.__test.store.update((s) => { s.activeGroupId = 'g'; s.groups = [group]; });
  const api = x.__test.createApi(x.__test.store); const close = api.openEvents('g');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(x.__test.store.getSnapshot().busy, true);
  const retry = [...timers.values()].find((t) => t.ms === 1000); assert.ok(retry); retry.fn();
  await new Promise((r) => setTimeout(r, 10)); assert.equal(connections, 2);
  close(); api.dispose();
});

test('old command response cannot erase newer streamed/final messages', () => {
  const x = load();
  const previous = { ...group, seq: 2, messages: [{ id: 'live', seq: 1, text: 'finished', status: 'done' }, { id: 'new', seq: 2, text: 'new' }] };
  const incoming = { ...group, seq: 1, messages: [{ id: 'live', seq: 1, text: '', status: 'streaming' }] };
  const merged = x.__test.mergeCommandGroup(previous, incoming);
  assert.equal(merged.messages[0].text, 'finished'); assert.equal(merged.messages.length, 2);
});

test('empty existing groups inherit the exact main route (including reasoning effort); creation is deduplicated', async () => {
  const selected = { provider: 'account-api', model: 'selected-model', reasoningEffort: 'high' };
  const commands = [];
  const x = load(async (route, options) => {
    const body = JSON.parse(options.body); commands.push(body);
    if (body.op === 'ensureDefaultMember') {
      await new Promise(r => setTimeout(r, 5));
      return json({ ok: true, group: { ...group, members: [{ id: 'default', name: '主对话助手', enabled: true, ...body.selection }] } });
    }
    return json({ok:true,group:{...group,members:[{id:'default',enabled:true,...selected}]}});
  });
  const { store, createApi, mainSelectionOf } = x.__test;
  store.update(s=>{s.groups=[group];s.activeGroupId='g';s.loadStatus='ready';});
  const api = createApi(store);
  const route=mainSelectionOf({next:selected});
  assert.equal(route.provider,'account-api');assert.equal(route.reasoningEffort,'high');
  await Promise.all([api.ensureGroupMember('g',route),api.ensureGroupMember('g',route)]);
  assert.equal(commands.length,1);assert.equal(commands[0].selection.model,'selected-model');
  await api.sendMessage('g','hello',route);assert.equal(commands[1].op,'sendMessage');
  api.dispose();
});

test('missing main route does not silently choose the first catalog provider or save a fake message', async () => {
  let calls=0;const x=load(async()=>{calls++;return json({ok:true});});
  x.__test.store.update(s=>{s.groups=[group];s.activeGroupId='g';s.catalog={groups:[{id:'wrong-api',models:[{id:'wrong-model'}]}],failures:[]};});
  const api=x.__test.createApi(x.__test.store);
  await assert.rejects(api.sendMessage('g','hello',null),/主对话/);
  assert.equal(calls,0);assert.equal(x.__test.store.getSnapshot().groups[0].messages.length,0);api.dispose();
});


test('host context imports visible text and todos without reasoning or tool payloads', () => {
  const { hostContextOf } = load(async () => json({})).__test;
  const context = hostContextOf({ sessionId: 'old', eventSource: { getSnapshot: () => ({ entries: [
    { type: 'event', event: { type: 'user/message', data: { content: [{ type: 'text', text: '背景事实' }] } } },
    { type: 'event', event: { type: 'assistant/message', data: { message: { content: [{ type: 'reasoning', text: 'private' }, { type: 'text', text: '结论' }] } } } },
    { type: 'event', event: { type: 'tool/result', data: { text: 'secret' } } },
  ] }) }, session: { projections: { faceOf: () => ({ getSnapshot: () => [{ content: '待办', status: 'pending' }] }) } } });
  assert.match(context, /背景事实/); assert.match(context, /结论/); assert.match(context, /待办/);
  assert.ok(!context.includes('private')); assert.ok(!context.includes('secret'));
});

test('HTTP errors preserve non-JSON gateway reasons', async () => {
  const x = load(async () => new Response('upstream connection refused', { status: 502 }));
  const api = x.__test.createApi(x.__test.store);
  await assert.rejects(api.refresh(), /HTTP 502: upstream connection refused/); api.dispose();
});


test('Markdown handles unfinished streaming fences, tables, headings and safe links', () => {
  const { markdownBlocks, safeLink }=load(async()=>json({})).__test;
  const blocks=markdownBlocks('# 标题\n**加粗**\n```python\nprint("x")');
  assert.equal(blocks[0].type,'heading');assert.equal(blocks.at(-1).type,'code');
  assert.equal(blocks.at(-1).text,'print("x")');assert.equal(blocks.at(-1).incomplete,true);
  const table=markdownBlocks('| A | B |\n| --- | --- |\n| 1 | 2 |');
  assert.equal(table[0].type,'table');assert.equal(table[0].rows[0][1],'2');
  assert.equal(safeLink('javascript:alert(1)'),null);assert.equal(safeLink('data:text/html,x'),null);
  assert.equal(safeLink('https://example.org'),'https://example.org');
});

for (const failure of ['lookup', 'registration']) {
  test(`optional conversation ${failure} failure does not abort client activation`, async () => {
    const x = load(async route => json(route.endsWith('/state') ? {ok:true,groups:[]} : {ok:true,providers:[]}));
    const disposers=[];const slots=[];
    const ctx={
      get:()=>{if(failure==='lookup')throw Error('optional service unavailable');return {views:{register:()=>{throw Error('duplicate target');}}};},
      effect:fn=>{const d=fn();if(typeof d==='function')disposers.push(d);},
      sessions:{},locale:{register:()=>()=>{},bind:()=>key=>key},
      slots:{inject:(_name,fn)=>fn(),register:(options)=>{slots.push(options);return()=>{};}},
    };
    assert.doesNotThrow(()=>x.apply(ctx));
    assert.ok(slots.some(s=>s.name==='conversation.view'));
    await new Promise(resolve=>setTimeout(resolve,0));
    for(const dispose of disposers.reverse())dispose();
  });
}

test('different service proxies do not duplicate conversation target registration', async()=>{
 const x=load(async route=>json(route.endsWith('/state')?{ok:true,groups:[]}:{ok:true,providers:[]}));
 let calls=0;const definitions=[];const disposers=[];
 const owner=()=>({get:()=>({views:{entries:()=>definitions,register:definition=>{calls++;definitions.push(definition);return()=>definitions.splice(0);}}}),effect:fn=>{const d=fn();if(typeof d==='function')disposers.push(d);}});
 const ctx={...owner(),inject:(names,fn)=>{if(names.includes('uiConversation')){fn(owner());fn(owner());}},sessions:{},locale:{register:()=>()=>{},bind:()=>key=>key},slots:{inject:(_name,fn)=>fn(),register:()=>()=>{}}};
 x.apply(ctx);assert.equal(calls,1);await new Promise(r=>setTimeout(r,0));for(const d of disposers.reverse())d();
});


test('visiting group target cannot promote a blank native conversation after replay',async()=>{
 const x=load(async route=>json(route.endsWith('/state')?{ok:true,groups:[]}:{ok:true,providers:[]}));
 let definition;const disposers=[];const ctx={get:()=>({views:{register:d=>{definition=d;return()=>{};}}}),effect:fn=>{const d=fn();if(typeof d==='function')disposers.push(d);},sessions:{},locale:{register:()=>()=>{},bind:()=>key=>key},slots:{inject:(_name,fn)=>fn(),register:()=>()=>{}}};
 x.apply(ctx);const builder=definition.create();
 assert.equal(definition.isActive(builder.empty),false);
 assert.equal(definition.isActive(builder.replace({nodes:[],timeline:[]})),false);
 assert.equal(definition.isActive(builder.apply({upserts:[],timeline:[]})),false);
 await new Promise(r=>setTimeout(r,0));for(const d of disposers.reverse())d();
});
