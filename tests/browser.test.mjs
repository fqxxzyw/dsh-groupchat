import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const client=readFileSync(process.env.GROUPCHAT_CLIENT_PATH ?? root+'lib/client.js','utf8');
const fixture=readFileSync(root+'tests/browser-fixture.mjs','utf8');
// Reduced host CSS reproduces the official resident scrollport + overlay seat contract.
const hostCSS=`html,body,#app{height:100%;margin:0} .root,.body,.scrollBody{display:flex;flex-direction:column;flex:1;min-height:0}.root{height:100%;--dsh-scrollbar-width:0px}header{height:40px;flex:none}.scrollBody{overflow-y:auto}.viewArea{display:flex;flex-direction:column;flex:1 0 auto;min-height:auto}.composerSeat{display:flex;flex-direction:column;flex:none}.scrollBody:has([data-conversation-composer-overlay]){position:relative;overflow-x:hidden;overflow-y:auto}.scrollBody:has([data-conversation-composer-overlay])>[data-slot='conversation.session']>.viewArea{flex:1 1 0;min-height:0;overflow:hidden}.scrollBody:has([data-conversation-composer-overlay])>.composerSeat{position:absolute;right:0;bottom:0;left:0}`;

test('Chromium: repeated session/view switches preserve geometry, history, drafts, single composer, @ input and failed send recovery', async () => {
  const bundle=await build({stdin:{contents:fixture+'\n'+client+'\nwindow.start();',resolveDir:root+'tests',loader:'js'},bundle:true,write:false,format:'iife'});
  let failSend=false;
  const group={id:'g1',hostSessionId:'session-1',hostImportDecision:'skipped',seq:1,name:'测试群',members:[{id:'a',name:'Alice',enabled:true,provider:'test',model:'model',avatar:'🤖'}],messages:[{id:'old',seq:1,kind:'member',speakerId:'a',speakerName:'Alice',text:'历史消息保留',status:'done',createdAt:Date.now()}],memory:'',tasks:[]};
  const markdownText='# 渲染标题\n**加粗内容** 和 `inline`\n```python\nprint("hello")\n```\n| 项目 | 结果 |\n| --- | --- |\n| A | 成功 |\n<script>window.injected=true</script>\n[危险链接](javascript:alert(1))';
  group.messages.push({id:'markdown',seq:2,kind:'member',speakerId:'a',speakerName:'Alice',text:markdownText,status:'done',createdAt:Date.now()});group.seq=2;
  group.memberMemories={a:{manual:'固定偏好',notes:[{sourceId:'memory-one',createdAt:Date.now(),text:'成员观点摘录'}]}};
  const other={...group,id:'g2',hostSessionId:'session-2' ,name:'第二群',messages:[],memory:'第二群记忆'};
  other.members=[{...group.members[0],id:'b',name:'Bob',persona:'编辑和报告写作'}];const groups=[group,other];
  const json=(res,value)=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(value));};
  const server=createServer((req,res)=>{
    if(req.url==='/'){res.end(`<html><head><meta charset="utf-8"><style>${hostCSS}</style></head><body><div id="app"></div><script src="/bundle.js"></script></body></html>`);return;}
    if(req.url==='/bundle.js'){res.setHeader('content-type','text/javascript');res.end(bundle.outputFiles[0].text);return;}
    if(req.url==='/groupchat/state'){json(res,{ok:true,groups});return;}
    if(req.url==='/groupchat/catalog'){json(res,{ok:true,groups:[{id:'test',name:'Test',models:[{id:'model',name:'Model'}]}],failures:[]});return;}
    if(req.url.startsWith('/groupchat/events')){
      const g=groups.find(item=>item.id===new URL(req.url,'http://localhost').searchParams.get('groupId'))??group;
      res.writeHead(200,{'content-type':'text/event-stream'});res.write('data: '+JSON.stringify({type:'snapshot',groupId:g.id,group:{...g,runtime:{running:false,typing:[],responders:[]}}})+'\n\n');return;
    }
    if(req.url==='/groupchat/command'){
      let raw=''; req.on('data',b=>raw+=b);req.on('end',()=>{
        const body=JSON.parse(raw),g=groups.find(item=>item.id===body.groupId)??group;
        if(body.op==='ensureSessionGroup'){let selected=groups.find(item=>item.hostSessionId===body.sessionId);if(!selected){selected={...other,id:'group-'+body.sessionId,hostSessionId:body.sessionId,messages:[]};groups.push(selected);}json(res,{ok:true,group:selected});return;}
        if(body.op==='setGroupOptions'){if(typeof body.workMode==='boolean')g.workMode=body.workMode;json(res,{ok:true,group:g});return;}
        if(body.op==='importMember'){const source=groups.find(item=>item.id===body.sourceGroupId),member=source.members.find(m=>m.id===body.sourceMemberId);const imported={...member,id:'import-'+member.id,origin:{groupId:source.id,memberId:member.id,groupName:source.name,name:member.name}};g.members.push(imported);json(res,{ok:true,group:g,member:imported});return;}
        if(body.op==='ensureDefaultMember'){if(g.members.length===0)g.members.push({id:'main',name:'主对话助手',avatar:'🤖',enabled:true,...body.selection});json(res,{ok:true,group:g});return;}
        if(body.op==='sendMessage'){
          if(failSend){json(res,{ok:false,error:'测试发送失败'});return;}
          const message={id:'sent-'+Date.now(),seq:++g.seq,kind:'user',speakerName:'我',text:body.text,status:'done',createdAt:Date.now()};g.messages.push(message);json(res,{ok:true,group:g,message});
        }else json(res,{ok:true,group:g});
      });return;
    }
    res.statusCode=404;res.end();
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  let browser; try { browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.GROUPCHAT_CHROMIUM_PATH ? {executablePath:process.env.GROUPCHAT_CHROMIUM_PATH} : {})}); } catch(error) { server.closeAllConnections(); await new Promise(r=>server.close(r)); throw error; }
  const page=await browser.newPage({viewport:{width:1200,height:800}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text)=>{window.copiedText=text;}}});});
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.locator('.gc-composer-input').waitFor();
    await page.getByRole('heading',{name:'渲染标题',exact:true}).waitFor();
    assert.equal(await page.locator('.gc-markdown strong').textContent(),'加粗内容');
    assert.equal(await page.locator('.gc-markdown table tbody td').last().textContent(),'成功');
    assert.equal(await page.locator('.gc-markdown script').count(),0);
    assert.equal(await page.locator('.gc-markdown a[href^="javascript:"]').count(),0);
    await page.getByRole('button',{name:'复制代码',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.copiedText),'print("hello")');
    await page.locator('.gc-msg-row').filter({has:page.getByRole('heading',{name:'渲染标题'})}).getByRole('button',{name:'复制消息',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.copiedText),markdownText);
    await page.screenshot({path:'/tmp/gc-beta4-md-preview.png'});
    await page.getByRole('button',{name:'记忆',exact:true}).click();
    assert.equal(await page.locator('.gc-member-memory summary').textContent(),'Alice · 1 条记录');
    await page.getByRole('button',{name:'记忆',exact:true}).click();
    await page.locator('.gc-composer-input').fill('未发送草稿');
    for(let i=0;i<12;i++){
      await page.locator('#switch').click();
      await page.waitForFunction(()=>window.entryCount()===1);
      assert.equal(await page.locator('.gc-composer-input').inputValue(),i%2===0?'':'未发送草稿');
      assert.equal(await page.getByText('历史消息保留',{exact:true}).count(),i%2===0?0:1);
      const view=await page.locator('.gc-view').boundingBox(), input=await page.locator('.gc-composer').boundingBox();
      assert.ok(view.height>500,JSON.stringify(view));assert.ok(Math.abs(input.y+input.height-800)<2,JSON.stringify(input));
    }
    // Explicitly retire the Session binding by navigating to no Session, then recreate it.
    assert.equal(await page.evaluate(()=>window.targetRegistered()),true);
    for(let i=0;i<5;i++){
      await page.locator('#new').click();await page.locator('#default-input').waitFor();
      await page.locator('#return-old').click();await page.locator('.gc-composer-input').waitFor();
      assert.equal(await page.locator('.gc-composer-input').inputValue(),'未发送草稿');
      assert.ok(await page.locator('.gc-composer').evaluate(el=>Math.abs(el.getBoundingClientRect().bottom-window.innerHeight)<2));
    }
    // Host styles arriving after restoration must not recreate a containing block.
    await page.addStyleTag({content:'[data-phase] .restoredWrapper{position:relative!important;contain:layout!important}'});
    assert.ok(await page.locator('.gc-composer').evaluate(el=>Math.abs(el.getBoundingClientRect().bottom-window.innerHeight)<2));
    // A late native transcript scroll restore must not lift the plugin composer.
    await page.evaluate(()=>{const host=document.querySelector('[data-conversation-scroll]');const spacer=document.createElement('div');spacer.id='native-restore-spacer';spacer.style.cssText='height:2000px;min-height:2000px;flex:none;width:1px';host.appendChild(spacer);host.scrollTop=350;});
    await page.waitForFunction(()=>document.querySelector('[data-conversation-scroll]').scrollTop===0);
    assert.ok(await page.locator('.gc-composer').evaluate(el=>Math.abs(el.getBoundingClientRect().bottom-window.innerHeight)<2));
    await page.evaluate(()=>document.getElementById('native-restore-spacer').remove());
    await page.locator('.gc-composer-input').fill('@Al');
    await page.locator('.gc-mention-pop').waitFor();
    assert.equal(await page.locator('.gc-mention-pop').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');
    await page.locator('.gc-composer-input').fill('未发送草稿');
    await page.getByRole('button',{name:'成员',exact:true}).click();
    await page.getByRole('button',{name:'member.add',exact:true}).click();
    assert.equal(await page.locator('.gc-modal').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');
    await page.screenshot({path:'/tmp/gc-beta5-light-modal.png'});
    await page.emulateMedia({colorScheme:'dark'});
    assert.equal(await page.locator('.gc-modal').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(32, 38, 51)');
    assert.equal(await page.locator('.gc-modal').evaluate(el=>getComputedStyle(el).color),'rgb(237, 241, 248)');
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.gc-modal .gc-btn')).backgroundColor==='rgb(41, 47, 62)');
    await page.screenshot({path:'/tmp/gc-beta5-dark-modal.png'});
    await page.getByRole('button',{name:'close',exact:true}).click();
    await page.emulateMedia({colorScheme:'light'});
    await page.getByRole('button',{name:'成员',exact:true}).click();
    const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'导出诊断',exact:true}).click()]);
    const diagnostic=JSON.parse(readFileSync(await download.path(),'utf8'));
    assert.equal(diagnostic.current.version,'1.1.0-beta.5');
    assert.ok(diagnostic.bootLog.some(entry=>entry.event==='restored-scroll-reset'));
    assert.ok(diagnostic.bootLog.some(entry=>entry.event==='apply-complete'));
    assert.equal(diagnostic.current.pluginInputs,1);assert.equal(diagnostic.current.messages,2);
    assert.ok(!JSON.stringify(diagnostic).includes('历史消息保留'));
    await page.locator('#blank').click();await page.locator('.gc-composer-input').waitFor();
    assert.equal(await page.locator('.gc-view').getAttribute('data-groupchat-view'),'1.1.0-beta.5');
    await page.locator('#return-old').click();
    await page.locator('#toggle').click();await page.locator('#default-input').waitFor();assert.equal(await page.evaluate(()=>window.entryCount()),0);
    assert.equal(await page.locator('[data-gc-host],[data-gc-bridge]').count(),0);
    assert.equal(await page.locator('[data-conversation-scroll]').evaluate(el=>el.style.getPropertyValue('overflow')),'');
    await page.locator('#toggle').click();await page.locator('.gc-composer-input').waitFor();
    await page.locator('.gc-composer-input').fill('@Al');
    await page.locator('.gc-mention-item').first().click();
    assert.equal(await page.locator('.gc-composer-input').inputValue(),'@Alice ');
    await page.locator('.gc-composer-input').fill('第一群草稿');await page.locator('#switch').click();
    assert.equal(await page.locator('.gc-composer-input').inputValue(),'');
    assert.equal(await page.getByText('正在加载群聊…',{exact:true}).count(),0);
    await page.locator('.gc-composer-input').fill('第二群草稿');await page.locator('#switch').click();
    assert.equal(await page.locator('.gc-composer-input').inputValue(),'第一群草稿');
    assert.equal(await page.locator('.gc-group-chip-add').count(),0);
    await page.locator('.gc-composer-input').fill('@Bo');await page.getByText('外群：第二群',{exact:true}).first().waitFor();
    await page.locator('.gc-mention-item').filter({hasText:'Bob'}).first().click();
    await page.waitForFunction(()=>document.querySelector('.gc-composer-input').value==='@Bob ');
    failSend=true;await page.locator('.gc-composer-input').fill('失败消息');await page.getByRole('button',{name:'发送',exact:true}).click();
    await page.getByText('测试发送失败',{exact:true}).waitFor();assert.equal(await page.locator('.gc-composer-input').inputValue(),'失败消息');
    assert.equal(await page.locator('.gc-bubble-text').filter({hasText:'失败消息'}).count(),0);
    failSend=false;await page.getByRole('button',{name:'发送',exact:true}).click();await page.getByText('失败消息',{exact:true}).waitFor();
    assert.equal(await page.getByText('失败消息',{exact:true}).count(),1);
    await page.setViewportSize({width:430,height:700});
    assert.ok((await page.locator('.gc-view').boundingBox()).height>350);
    assert.deepEqual(errors,[]);
  }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('Chromium + real plugin HTTP engine: an existing user-only group gets main-dialogue model, receives AI replies, survives New -> return', async()=>{
  const { apply }=await import('../lib/index.js');
  const { mkdtempSync,mkdirSync,writeFileSync,rmSync }=await import('node:fs');
  const { join }=await import('node:path');const { tmpdir }=await import('node:os');
  const home=mkdtempSync(join(tmpdir(),'groupchat-browser-'));const previous=process.env.DSH_HOME;process.env.DSH_HOME=home;
  const dir=join(home,'storages','dsh-groupchat');mkdirSync(dir,{recursive:true});
  writeFileSync(join(dir,'state.json'),JSON.stringify({groups:[{id:'existing',name:'已有空群',seq:1,members:[],memory:'',tasks:[],messages:[{id:'old-user',seq:1,kind:'user',speakerName:'我',text:'以前只有我的消息',createdAt:Date.now(),status:'done'}]}]}));
  const routes=[],disposers=[],calls=[];
  apply({
    effect:fn=>disposers.push(fn()),webServer:{register:route=>{routes.push(route);return()=>{};}},
    llm:{
      listProviders:()=>[{id:'wrong-first-api',name:'First API'}],
      listModels:async()=>[{id:'wrong-first-model',name:'First model'}],resolveModelInfo:async()=>({}),
      stream:async function*(options){calls.push(options);
        if(options.messages.at(-1).content[0].text.includes('只返回 JSON')){yield{type:'text-delta',text:'[{"title":"分析需求","assignee":"主对话助手","reason":"助手负责分析","dependsOn":[]}]'};return;}
        yield{type:'text-delta',text:'我是主对话助手，'};await new Promise(r=>setTimeout(r,100));yield{type:'text-delta',text:'已收到你的测试。'};},
    },
  });
  const bundle=await build({stdin:{contents:fixture+'\n'+client+'\nwindow.start();',resolveDir:root+'tests',loader:'js'},bundle:true,write:false,format:'iife'});
  const server=createServer((req,res)=>{
    if(req.url==='/'){res.end(`<html><head><meta charset="utf-8"><style>${hostCSS}</style></head><body><div id="app"></div><script>window.useModelDirectory=true;window.delayMainModel=200;window.mainEntries=[{type:'event',event:{type:'user/message',seq:1,data:{content:[{type:'text',text:'原会话导入消息'}]}}},{type:'event',event:{type:'assistant/message',seq:2,data:{message:{content:[{type:'text',text:'原会话导入回复'}]}}}}];</script><script src="/bundle.js"></script></body></html>`);return;}
    if(req.url==='/bundle.js'){res.setHeader('content-type','text/javascript');res.end(bundle.outputFiles[0].text);return;}
    const route=routes.find(r=>r.path===req.url.split('?')[0]);if(route)route.handler(req,res);else{res.statusCode=404;res.end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  let browser;
  try{
    browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.GROUPCHAT_CHROMIUM_PATH?{executablePath:process.env.GROUPCHAT_CHROMIUM_PATH}:{})});
    const page=await browser.newPage({viewport:{width:1200,height:800}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base);await page.locator('.gc-composer-input').waitFor();
    await page.getByRole('dialog',{name:'首次进入群聊'}).waitFor();
    await page.getByRole('checkbox',{name:'设为默认，下次不再提醒'}).check();
    await page.getByRole('button',{name:'导入历史',exact:true}).click();
    await page.getByText('原会话导入回复',{exact:true}).waitFor();
    assert.equal(calls.length,0);assert.equal(await page.evaluate(()=>localStorage.getItem('dsh-groupchat:import-preference')),'import');
    for(let i=0;i<500;i++){const s=await(await page.request.get(base+'/groupchat/state')).json();if(s.groups[0].members.length===1)break;await new Promise(r=>setTimeout(r,10));}
    let state=await(await page.request.get(base+'/groupchat/state')).json();const member=state.groups[0].members[0];assert.ok(member,JSON.stringify(state));
    assert.equal(member.name,'主对话助手');assert.equal(member.provider,'main-api');assert.equal(member.model,'MainModel');assert.equal(member.reasoningEffort,'high');
    assert.equal(state.groups[0].messages.length,3); // Existing history plus two imported real records; no generated reply.
    await page.locator('.gc-composer-input').fill('测试主模型回复');await page.getByRole('button',{name:'发送',exact:true}).click();
    await page.getByText('我是主对话助手，',{exact:true}).waitFor();
    await page.locator('#new').click();await page.locator('#return-old').click();
    await page.getByText('我是主对话助手，已收到你的测试。',{exact:true}).waitFor();
    assert.equal(await page.getByText('以前只有我的消息',{exact:true}).count(),1);
    assert.ok(await page.locator('.gc-composer').evaluate(el=>Math.abs(el.getBoundingClientRect().bottom-window.innerHeight)<2));
    state=await(await page.request.get(base+'/groupchat/state')).json();assert.equal(state.groups[0].members.length,1);assert.equal(state.groups[0].messages.length,5);
    assert.equal(calls.length,1);assert.equal(calls[0].provider,'main-api');assert.equal(calls[0].model,'MainModel');
    await page.getByRole('combobox',{name:'对话模式'}).selectOption('work');
    await page.getByRole('button',{name:'开始协作',exact:true}).waitFor();
    await page.locator('.gc-composer-input').fill('制定需求方案');await page.getByRole('button',{name:'开始协作',exact:true}).click();
    await page.getByText(/已完成分工，开始执行/).waitFor();
    for(let i=0;i<500;i++){state=await(await page.request.get(base+'/groupchat/state')).json();if(!state.groups[0].runtime.running)break;await new Promise(r=>setTimeout(r,10));}
    assert.equal(calls.length,4);assert.equal(state.groups[0].tasks[0].status,'completed');
    await page.getByRole('button',{name:'记忆',exact:true}).click();
    await page.getByText('主对话助手 · 3 条记录',{exact:true}).waitFor();
    await page.locator('#switch').click();await page.getByText('原会话导入回复',{exact:true}).waitFor();
    assert.equal(await page.getByRole('dialog',{name:'首次进入群聊'}).count(),0);assert.equal(calls.length,4);
    state=await(await page.request.get(base+'/groupchat/state')).json();assert.equal(state.groups.length,2);assert.ok(state.groups.some(g=>g.hostSessionId==='session-2'&&g.messages.length===2));
    await page.locator('#return-old').click();await page.getByRole('button',{name:'开始协作',exact:true}).waitFor();
    assert.deepEqual(errors,[]);
  }finally{
    if(browser)await browser.close();for(const d of disposers.reverse())if(typeof d==='function')d();
    server.closeAllConnections();await new Promise(r=>server.close(r));if(previous===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=previous;rmSync(home,{recursive:true,force:true});
  }
});
