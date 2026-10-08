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

test('Chromium: robot task overview stays current and font preferences scale the whole UI without moving the composer', async () => {
  const bundle=await build({stdin:{contents:fixture+'\n'+client+'\nwindow.start();',resolveDir:root+'tests',loader:'js'},bundle:true,write:false,format:'iife'});
  const group={id:'g1',hostSessionId:'session-1',hostImportDecision:'skipped',seq:1,name:'任务与缩放',memory:'',messages:[{id:'m1',seq:1,kind:'member',speakerId:'a',speakerName:'Alice',text:'Task overview test',status:'done',createdAt:Date.now()}],members:[{id:'a',name:'Alice',enabled:true,provider:'test',model:'model'},{id:'b',name:'Bob',enabled:true,provider:'test',model:'model'}],tasks:[
    {id:'t1',title:'整理方案',assigneeId:'a',status:'completed'},
    {id:'t2',title:'核验资料',assigneeId:'b',status:'in_progress'},
    {id:'t3',title:'发布文档',assigneeId:null,status:'pending'},
    {id:'t4',title:'过期任务',assigneeId:'deleted',status:'cancelled'},
    {id:'t5',title:'修正结果',assigneeId:'a',status:'failed'},
    {id:'t6',title:'审核草稿',assigneeId:'b',status:'awaiting_approval'},
  ]};
  const host={version:'1.1.0-beta.11',instanceId:'task-scale-test',config:{replyRetryCount:2}};
  const json=(res,value)=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({host,...value}));};
  const server=createServer((req,res)=>{
    if(req.url==='/'){res.end(`<html><head><meta charset="utf-8"><style>${hostCSS}</style></head><body><div id="app"></div><script src="/bundle.js"></script></body></html>`);return;}
    if(req.url==='/bundle.js'){res.setHeader('content-type','text/javascript');res.end(bundle.outputFiles[0].text);return;}
    if(req.url==='/groupchat/state'){json(res,{ok:true,groups:[group]});return;}
    if(req.url==='/groupchat/catalog'){json(res,{ok:true,groups:[{id:'test',name:'Test',models:[{id:'model',name:'Model'}]}],failures:[]});return;}
    if(req.url.startsWith('/groupchat/events')){res.writeHead(200,{'content-type':'text/event-stream'});res.write('data: '+JSON.stringify({type:'snapshot',groupId:group.id,host,group:{...group,runtime:{running:false,typing:[],responders:[]}}})+'\n\n');return;}
    if(req.url==='/groupchat/command'){
      let raw='';req.on('data',b=>raw+=b);req.on('end',()=>{
        const body=JSON.parse(raw);
        if(body.op==='updateTask'){const task=group.tasks.find(t=>t.id===body.taskId);Object.assign(task,body.patch);}
        json(res,{ok:true,group});
      });return;
    }
    res.statusCode=404;res.end();
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  let browser;
  try{browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.GROUPCHAT_CHROMIUM_PATH?{executablePath:process.env.GROUPCHAT_CHROMIUM_PATH}:{})});}
  catch(error){server.closeAllConnections();await new Promise(r=>server.close(r));throw error;}
  const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const fit=async()=>{
    await page.waitForFunction(()=>{
      const view=document.querySelector('.gc-view'),composer=document.querySelector('.gc-composer');if(!view||!composer)return false;
      const v=view.getBoundingClientRect(),c=composer.getBoundingClientRect();
      return Math.abs(v.right-window.innerWidth)<2&&Math.abs(v.bottom-window.innerHeight)<2&&Math.abs(c.bottom-window.innerHeight)<2;
    },null,{timeout:5000});
    const geometry=await page.evaluate(()=>{
      const get=selector=>{const e=document.querySelector(selector),r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,scroll:e.scrollTop};};
      return{view:get('.gc-view'),composer:get('.gc-composer'),messages:get('.gc-messages'),overview:get('.gc-task-overview'),width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth};
    });
    assert.ok(geometry.messages.height>20,JSON.stringify(geometry));
    assert.ok(geometry.overview.bottom<=geometry.composer.y+2,JSON.stringify(geometry));
    assert.ok(geometry.composer.x>=-1&&geometry.composer.x+geometry.composer.width<=geometry.width+2,JSON.stringify(geometry));
    assert.equal(geometry.view.scroll,0);assert.ok(geometry.scrollWidth<=geometry.width+2,JSON.stringify(geometry));
  };
  const setSize=async size=>{
    const settings=page.getByRole('button',{name:'导入偏好 / 全局设置',exact:true}).filter({visible:true});
    if(!await settings.count()) await page.getByLabel('更多群聊操作',{exact:true}).click();
    await page.getByRole('button',{name:'导入偏好 / 全局设置',exact:true}).filter({visible:true}).click();
    await page.getByRole('slider',{name:'群聊字号',exact:true}).fill(String(size));
    await page.getByRole('button',{name:'保存偏好',exact:true}).click();
    await page.waitForFunction(size=>Math.abs(parseFloat(getComputedStyle(document.querySelector('.gc-view')).zoom)-size/13)<0.001,size);
    await fit();
    const modal=await page.locator('.gc-modal').boundingBox(),vp=page.viewportSize();
    assert.ok(modal.x>=-1&&modal.y>=-1&&modal.x+modal.width<=vp.width+2&&modal.y+modal.height<=vp.height+2,JSON.stringify({size,modal,vp}));
    assert.equal(await page.locator('.gc-settings').evaluate(el=>parseFloat(getComputedStyle(el).zoom)),1);
    // Saving while focused in the modal cannot scroll the view or lift the composer.
    await page.getByRole('button',{name:'关闭窗口',exact:true}).click();await fit();
  };
  try{
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.getByRole('region',{name:'机器人任务概览'}).waitFor();
    assert.equal(await page.locator('.gc-panel[data-panel=members]').isVisible(),true);
    assert.equal(await page.getByRole('button',{name:'新增角色',exact:true}).textContent(),'新增角色');
    assert.equal(await page.getByRole('button',{name:'群聊诊断',exact:true}).count(),0);
    const overview=page.locator('.gc-task-overview');
    assert.match(await overview.textContent(),/共 6 个任务，已完成 1 个/);
    assert.match(await overview.locator('[data-task-id="t1"]').textContent(),/Alice — 整理方案.*已完成/);
    assert.match(await overview.locator('[data-task-id="t2"]').textContent(),/Bob — 核验资料.*进行中/);
    assert.match(await overview.locator('[data-task-id="t3"]').textContent(),/未分配 — 发布文档.*待开始/);
    assert.match(await overview.locator('[data-task-id="t4"]').textContent(),/未分配 — 过期任务.*已停止/);
    assert.match(await overview.locator('[data-task-id="t5"]').textContent(),/失败（可重试）/);
    assert.match(await overview.locator('[data-task-id="t6"]').textContent(),/待审批/);
    assert.equal(await overview.locator('[data-task-id="t1"] .gc-task-overview-text').evaluate(e=>getComputedStyle(e).textDecorationLine),'line-through');
    assert.ok(await overview.locator('ol').evaluate(e=>e.scrollHeight>e.clientHeight));
    await overview.getByRole('button',{name:/共 6 个任务/}).click();assert.equal(await overview.locator('ol').count(),0);
    await overview.getByRole('button',{name:/共 6 个任务/}).click();
    await page.getByRole('button',{name:'展开任务面板',exact:true}).click();
    const row=page.locator('.gc-panel .gc-task-row').filter({hasText:'发布文档'});
    await row.locator('select').selectOption('b');
    await page.waitForFunction(()=>document.querySelector('.gc-task-overview [data-task-id="t3"]').textContent.includes('Bob — 发布文档'));
    await row.locator('.gc-task-toggle').click();
    await page.waitForFunction(()=>document.querySelector('.gc-task-overview [data-task-id="t3"]').textContent.includes('已完成'));
    assert.match(await overview.textContent(),/共 6 个任务，已完成 2 个/);
    await page.getByRole('button',{name:'关闭任务面板',exact:true}).click();
    const baseline=(await page.getByRole('button',{name:'任务',exact:true}).boundingBox()).height;
    const iconBaseline=(await overview.locator('.gc-task-overview-heading svg').boundingBox()).width;
    for(const size of [11,16,20,13]){
      await setSize(size);
      const height=(await page.getByRole('button',{name:'任务',exact:true}).boundingBox()).height;
      // Font metrics round at each zoom level; the SVG and padding scale continuously.
      assert.ok(Math.abs(height/baseline-size/13)<0.09,JSON.stringify({size,height,baseline}));
      const iconWidth=(await overview.locator('.gc-task-overview-heading svg').boundingBox()).width;
      assert.ok(Math.abs(iconWidth/iconBaseline-size/13)<0.005,JSON.stringify({size,iconWidth,iconBaseline}));
    }
    await setSize(16);await page.reload();await page.locator('.gc-task-overview').waitFor();await fit();
    assert.equal(JSON.parse(await page.evaluate(()=>localStorage.getItem('dsh-groupchat:preferences'))).fontSize,16);
    assert.ok(Math.abs(await page.locator('.gc-view').evaluate(e=>parseFloat(getComputedStyle(e).zoom))-16/13)<0.001);
    // Drag widths use logical CSS pixels under zoom, preserving physical mouse movement.
    await page.getByRole('button',{name:'任务',exact:true}).click();
    const rail=page.getByRole('separator',{name:'调整侧栏宽度'}),before=(await page.locator('.gc-panel-shell').boundingBox()).width,handle=await rail.boundingBox();
    await page.mouse.move(handle.x+handle.width/2,handle.y+25);await page.mouse.down();await page.mouse.move(handle.x+handle.width/2-48,handle.y+25);await page.mouse.up();
    assert.ok(Math.abs((await page.locator('.gc-panel-shell').boundingBox()).width-before-48)<3);
    await page.getByRole('button',{name:'关闭任务面板',exact:true}).click();
    await page.setViewportSize({width:700,height:700});await setSize(20);
    await page.getByRole('button',{name:'任务',exact:true}).click();
    assert.equal(await page.locator('.gc-panel-shell').evaluate(e=>getComputedStyle(e).position),'absolute');
    await page.getByRole('button',{name:'关闭任务面板',exact:true}).click();
    await page.setViewportSize({width:430,height:700});await fit();
    await setSize(11);await setSize(20);
    const taskGeometry=await overview.locator('ol').evaluate(e=>({height:e.clientHeight,rowHeight:e.querySelector('li').offsetHeight,chatHeight:e.closest('.gc-chat').clientHeight,overviewHeight:e.parentElement.clientHeight}));
    assert.ok(taskGeometry.height>=taskGeometry.rowHeight,`Maximum mobile scale must still show at least one task row: ${JSON.stringify(taskGeometry)}`);
    assert.ok((await page.locator('.gc-topbar').boundingBox()).height<180,'Compact actions must leave room for messages and tasks.');
    await page.screenshot({path:'/workspace/scratch/15856e367517/gc-beta10-tasks-scaled-mobile.png'});
    await page.setViewportSize({width:1200,height:800});await setSize(16);
    await page.screenshot({path:'/workspace/scratch/15856e367517/gc-beta10-tasks-scaled-desktop.png'});
    assert.deepEqual(errors,[]);
  }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('Chromium: repeated session/view switches preserve geometry, history, drafts, single composer, @ input and failed send recovery', async () => {
  const bundle=await build({stdin:{contents:fixture+'\n'+client+'\nwindow.start();',resolveDir:root+'tests',loader:'js'},bundle:true,write:false,format:'iife'});
  let failSend=false;
  const group={id:'g1',hostSessionId:'session-1',hostImportDecision:'skipped',seq:1,name:'测试群',members:[{id:'a',name:'Alice',enabled:true,provider:'test',model:'model',avatar:'🤖'}],messages:[{id:'old',seq:1,kind:'member',speakerId:'a',speakerName:'Alice',text:'历史消息保留',status:'done',createdAt:Date.now()}],memory:'',tasks:[]};
  const markdownText='# 渲染标题\n**加粗内容** 和 `inline`\n```python\nprint("hello")\n```\n| 项目 | 结果 |\n| --- | --- |\n| A | 成功 |\n<script>window.injected=true</script>\n[危险链接](javascript:alert(1))';
  group.messages.push({id:'markdown',seq:2,kind:'member',speakerId:'a',speakerName:'Alice',text:markdownText,status:'done',createdAt:Date.now()});group.seq=2;
  group.memberMemories={a:{manual:'固定偏好',notes:[{sourceId:'memory-one',createdAt:Date.now(),text:'成员观点摘录'}]}};
  const other={...group,id:'g2',hostSessionId:'session-2' ,name:'第二群',messages:[],memory:'第二群记忆'};
  other.members=[{...group.members[0],id:'b',name:'Bob',persona:'编辑和报告写作'},{...group.members[0],id:'c',name:'Boris',persona:'研究和核验'}];const groups=[group,other];
  const host={version:'1.1.0-beta.11',instanceId:'browser-host',sourceFile:'C:/plugins/dsh-groupchat/lib/index.js',config:{replyRetryCount:2}};
  const json=(res,value)=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({host,...value}));};
  const server=createServer((req,res)=>{
    if(req.url==='/'){res.end(`<html><head><meta charset="utf-8"><style>${hostCSS}</style></head><body><div id="app"></div><script src="/bundle.js"></script></body></html>`);return;}
    if(req.url==='/bundle.js'){res.setHeader('content-type','text/javascript');res.end(bundle.outputFiles[0].text);return;}
    if(req.url==='/groupchat/state'){json(res,{ok:true,groups});return;}
    if(req.url==='/groupchat/catalog'){json(res,{ok:true,groups:[{id:'test',name:'Test',models:[{id:'model',name:'Model'}]}],failures:[]});return;}
    if(req.url.startsWith('/groupchat/events')){
      const g=groups.find(item=>item.id===new URL(req.url,'http://localhost').searchParams.get('groupId'))??group;
      res.writeHead(200,{'content-type':'text/event-stream'});res.write('data: '+JSON.stringify({type:'snapshot',groupId:g.id,host,group:{...g,runtime:{running:false,typing:[],responders:[]}}})+'\n\n');return;
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
    assert.equal(await page.getByRole('button',{name:'复制代码',exact:true}).locator('svg').count(),1);
    await page.getByRole('button',{name:'复制代码',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.copiedText),'print("hello")');
    await page.locator('.gc-msg-row').filter({has:page.getByRole('heading',{name:'渲染标题'})}).getByRole('button',{name:'复制消息',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.copiedText),markdownText);
    await page.screenshot({path:'/tmp/gc-beta4-md-preview.png'});
    await page.getByRole('button',{name:'记忆',exact:true}).click();
    assert.equal(await page.locator('.gc-member-memory summary').textContent(),'Alice · 1 条记录');
    await page.getByRole('button',{name:'记忆',exact:true}).click();
    await page.getByRole('button',{name:'导入偏好 / 全局设置',exact:true}).click();
    await page.getByRole('combobox',{name:'导入方式'}).selectOption('skip');
    await page.getByRole('button',{name:'保存偏好',exact:true}).click();
    assert.equal(await page.evaluate(()=>localStorage.getItem('dsh-groupchat:import-preference')),'skip');
    await page.getByRole('slider',{name:'气泡不透明度'}).fill('65');
    await page.getByRole('button',{name:'保存偏好',exact:true}).click();
    assert.equal(await page.locator('.gc-view').evaluate(el=>el.style.getPropertyValue('--gc-bubble-alpha')),'65%');
    await page.getByRole('slider',{name:'气泡不透明度'}).fill('100');
    await page.getByRole('button',{name:'保存偏好',exact:true}).click();
    await page.locator('.gc-modal-head button').click();
    await page.getByRole('button',{name:'任务',exact:true}).click();
    await page.locator('.gc-panel[data-panel="tasks"]').waitFor();
    assert.equal(await page.locator('[data-gc-section="memory"]').isVisible(),false);
    assert.equal(await page.locator('[data-gc-section="tasks"]').first().isVisible(),true);
    const rail=page.getByRole('separator',{name:'调整侧栏宽度'});await rail.focus();
    const before=(await page.locator('.gc-panel-shell').boundingBox()).width;await rail.press('ArrowLeft');
    assert.equal((await page.locator('.gc-panel-shell').boundingBox()).width,before+20);
    const box=await rail.boundingBox();await page.mouse.move(box.x+4,box.y+20);await page.mouse.down();await page.mouse.move(box.x-56,box.y+20);await page.mouse.up();
    assert.ok((await page.locator('.gc-panel-shell').boundingBox()).width>before+60);
    await page.getByRole('button',{name:'记忆',exact:true}).click();
    assert.equal(await page.locator('[data-gc-section="memory"]').isVisible(),true);
    assert.equal(await page.locator('[data-gc-section="tasks"]').first().isVisible(),false);
    await page.getByRole('button',{name:'记忆',exact:true}).click();
    await page.locator('.gc-composer-input').fill('未发送草稿');
    for(let i=0;i<12;i++){
      await page.locator('#switch').click();
      await page.waitForFunction(()=>window.entryCount()===0);
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
    await page.addStyleTag({content:'[data-phase] .restoredWrapper{position:relative!important;contain:layout!important} [data-phase] .gc-main{flex:0 0 auto;min-height:0} [data-phase] .gc-messages{flex:0 0 auto}'});
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
    if(!await page.getByRole('button',{name:'新增角色',exact:true}).isVisible()) await page.getByRole('button',{name:'成员',exact:true}).click();
    await page.getByRole('button',{name:'新增角色',exact:true}).click();
    assert.equal(await page.locator('.gc-modal').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');
    await page.screenshot({path:'/tmp/gc-beta5-light-modal.png'});
    await page.emulateMedia({colorScheme:'dark'});
    assert.equal(await page.locator('.gc-modal').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(32, 38, 51)');
    assert.equal(await page.locator('.gc-modal').evaluate(el=>getComputedStyle(el).color),'rgb(237, 241, 248)');
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.gc-modal .gc-btn')).backgroundColor==='rgb(41, 47, 62)');
    await page.screenshot({path:'/tmp/gc-beta5-dark-modal.png'});
    await page.evaluate(()=>{window.closeClickBubbles=0;document.addEventListener('click',()=>window.closeClickBubbles++);});
    await page.getByRole('button',{name:'关闭窗口',exact:true}).click();
    await page.locator('.gc-modal').waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>window.closeClickBubbles),0);
    await page.getByRole('button',{name:'新增角色',exact:true}).click();
    await page.keyboard.press('Escape');await page.locator('.gc-modal').waitFor({state:'hidden'});
    await page.getByRole('button',{name:'新增角色',exact:true}).click();
    await page.locator('.gc-modal-backdrop').click({position:{x:5,y:5}});await page.locator('.gc-modal').waitFor({state:'hidden'});
    await page.getByRole('button',{name:'关闭成员面板',exact:true}).click();
    await page.locator('.gc-panel-shell').waitFor({state:'hidden'});
    await page.emulateMedia({colorScheme:'light'});
    await page.getByRole('button',{name:'成员',exact:true}).click();
    const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'导出诊断',exact:true}).click()]);
    const diagnostic=JSON.parse(readFileSync(await download.path(),'utf8'));
    assert.equal(diagnostic.current.version,'1.1.0-beta.11');
    assert.ok(diagnostic.bootLog.some(entry=>entry.event==='restored-scroll-reset'));
    assert.ok(diagnostic.bootLog.some(entry=>entry.event==='apply-complete'));
    assert.ok(diagnostic.current.sections.some(section=>section.selector==='.gc-composer'&&section.height>0));
    assert.equal(diagnostic.current.pluginInputs,1);assert.equal(diagnostic.current.messages,2);
    assert.ok(!JSON.stringify(diagnostic).includes('历史消息保留'));
    await page.locator('#blank').click();await page.locator('.gc-composer-input').waitFor();
    assert.equal(await page.locator('.gc-view').getAttribute('data-groupchat-view'),'1.1.0-beta.11');
    await page.locator('#return-old').click();
    await page.locator('#toggle').click();await page.locator('#default-input').waitFor();assert.equal(await page.evaluate(()=>window.entryCount()),0);
    const [emergencyDownload]=await Promise.all([page.waitForEvent('download'),page.keyboard.press('Control+Alt+Shift+D')]);
    const emergency=JSON.parse(readFileSync(await emergencyDownload.path(),'utf8'));
    assert.equal(emergency.current.views,0);assert.equal(emergency.current.pluginInputs,0);
    assert.equal(await page.getByRole('button',{name:'群聊诊断',exact:true}).count(),0);
    assert.equal(await page.locator('[data-gc-host],[data-gc-bridge]').count(),0);
    assert.equal(await page.locator('[data-conversation-scroll]').evaluate(el=>el.style.getPropertyValue('overflow')),'');
    await page.locator('#toggle').click();await page.locator('.gc-composer-input').waitFor();
    // Keyboard navigation must select the highlighted external member, preserving draft suffixes.
    await page.locator('.gc-composer-input').fill('@');
    await page.locator('.gc-mention-pop').waitFor();
    await page.locator('.gc-composer-input').press('ArrowDown');
    assert.equal(await page.locator('[role="option"][aria-selected="true"] span').last().textContent(),'Bob');
    await page.locator('.gc-composer-input').press('Enter');
    await page.waitForFunction(()=>document.querySelector('.gc-composer-input').value==='@Bob ');
    await page.locator('.gc-composer-input').fill('开头 @Al 结尾');
    await page.locator('.gc-composer-input').evaluate(el=>{el.setSelectionRange(6,6);el.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
    await page.locator('.gc-composer-input').press('Enter');
    assert.equal(await page.locator('.gc-composer-input').inputValue(),'开头 @Alice 结尾');
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
    // A newer client must not silently use an old host, even after a successful refresh.
    host.version='1.1.0-beta.9';
    await page.getByRole('button',{name:'核对宿主',exact:true}).click();
    await page.locator('[data-host-mismatch]').waitFor();
    assert.match(await page.locator('[data-host-mismatch]').textContent(),/宿主 1\.1\.0-beta\.9/);
    await page.locator('.gc-composer-input').fill('版本混用时禁止调用');await page.getByRole('button',{name:'发送',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.gc-composer-input').value==='版本混用时禁止调用');
    assert.equal(groups.flatMap(g=>g.messages).filter(m=>m.text==='版本混用时禁止调用').length,0);
    host.version='1.1.0-beta.11';
    await page.locator('.gc-top-actions').getByRole('button',{name:'核对宿主',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('[data-host-mismatch]'));
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
  const routes=[],disposers=[],calls=[];let emptyReply=false;
  apply({
    effect:fn=>disposers.push(fn()),webServer:{register:route=>{routes.push(route);return()=>{};}},
    llm:{
      listProviders:()=>[{id:'wrong-first-api',name:'First API'}],
      listModels:async()=>[{id:'wrong-first-model',name:'First model'}],resolveModelInfo:async()=>({}),
      stream:async function*(options){calls.push(options);
        if(emptyReply){yield{type:'usage',usage:{inputTokens:40,outputTokens:0}};yield{type:'finish',reason:{kind:'stop'}};return;}
        if(options.messages.at(-1).content[0].text.includes('只返回 JSON')){yield{type:'text-delta',text:'[{"title":"分析需求","assignee":"大肥鱼","reason":"助手负责分析","dependsOn":[]}]'};yield{type:'finish',reason:{kind:'stop'}};return;}
        yield{type:'reasoning-delta',index:0,text:'PRIVATE_REASONING_TEXT'};await new Promise(r=>setTimeout(r,180));
        yield{type:'text-delta',text:'我是主对话助手，'};await new Promise(r=>setTimeout(r,100));yield{type:'text-delta',text:'已收到你的测试。'};yield{type:'finish',reason:{kind:'stop'}};},
    },
  },{retryDelayMs:5});
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
    assert.equal(member.name,'大肥鱼');assert.equal(member.provider,'main-api');assert.equal(member.model,'MainModel');assert.equal(member.reasoningEffort,'high');
    assert.equal(state.groups[0].messages.length,3); // Existing history plus two imported real records; no generated reply.
    await page.getByRole('button',{name:'导入主对话',exact:true}).click();
    await page.getByRole('dialog',{name:'导入主对话历史',exact:true}).waitFor();
    await page.getByRole('button',{name:'导入历史',exact:true}).click();
    await page.getByText('成功导入 0 条新记录',{exact:true}).waitFor();
    await page.locator('.gc-modal-head button').click();
    await page.locator('.gc-composer-input').fill('测试主模型回复');await page.getByRole('button',{name:'发送',exact:true}).click();
    await page.getByText('正在思考…',{exact:true}).waitFor();assert.equal(await page.getByText('PRIVATE_REASONING_TEXT').count(),0);
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
    // The client flushes every four seconds; inspect the persisted snapshot itself.
    let autoDiagnostic;
    for(let i=0;i<120;i++){
      const response=await page.request.get(base+'/groupchat/diagnostics');
      if(response.ok())autoDiagnostic=await response.json();
      if(autoDiagnostic?.bootLog?.some(entry=>entry.event==='model-call' && entry.diagnostics.reasoningChars>0))break;
      await new Promise(r=>setTimeout(r,50));
    }
    assert.equal(autoDiagnostic.version,'1.1.0-beta.11');assert.ok(autoDiagnostic.bootLog.length>0);
    assert.ok(!JSON.stringify(autoDiagnostic).includes('原会话导入消息'));
    assert.ok(!JSON.stringify(autoDiagnostic).includes('PRIVATE_REASONING_TEXT'));assert.ok(autoDiagnostic.bootLog.some(entry=>entry.event==='model-call' && entry.diagnostics.reasoningChars>0));
    await page.getByRole('button',{name:'记忆',exact:true}).click();
    await page.getByText('大肥鱼 · 3 条记录',{exact:true}).waitFor();
    await page.locator('#switch').click();await page.getByText('原会话导入回复',{exact:true}).waitFor();
    assert.equal(await page.getByRole('dialog',{name:'首次进入群聊'}).count(),0);assert.equal(calls.length,4);
    state=await(await page.request.get(base+'/groupchat/state')).json();assert.equal(state.groups.length,2);assert.ok(state.groups.some(g=>g.hostSessionId==='session-2'&&g.messages.length===2));
    await page.locator('#return-old').click();await page.getByRole('button',{name:'开始协作',exact:true}).waitFor();
    assert.match(await page.locator('.gc-version').textContent(),/beta\.11 \/ 宿主 beta\.11/);
    await page.getByRole('combobox',{name:'对话模式'}).selectOption('chat');
    emptyReply=true;
    await page.locator('.gc-composer-input').fill('验证空回复诊断');await page.getByRole('button',{name:'发送',exact:true}).click();
    const failed=page.locator('.gc-msg-member').filter({hasText:'EMPTY_RESPONSE'}).last();
    await failed.waitFor();
    const beforeDetails=await page.locator('.gc-composer').boundingBox();
    assert.ok(Math.abs(beforeDetails.y+beforeDetails.height-800)<2);
    await failed.locator('.gc-call-details summary').click();
    assert.match(await failed.locator('.gc-call-details').textContent(),/3 \/ 3/);
    assert.match(await failed.locator('.gc-call-details').textContent(),/结束原因stop/);
    assert.match(await failed.locator('.gc-call-details').textContent(),/输出 token0/);
    await page.waitForFunction(()=>Math.abs(document.querySelector('.gc-composer').getBoundingClientRect().bottom-window.innerHeight)<2,{},{timeout:2000});
    assert.equal(await page.locator('.gc-view').evaluate(el=>el.scrollTop),0);
    await page.waitForFunction(()=>{
      const port=document.querySelector('.gc-messages').getBoundingClientRect(),row=document.querySelector('.gc-call-details[open] dd:nth-of-type(9)').getBoundingClientRect();
      return row.top>=port.top && row.bottom<=port.bottom;
    },{},{timeout:2000});
    await page.screenshot({path:'/tmp/gc-beta10-call-details.png'});
    assert.equal(calls.length,7);
    const [exported]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'导出诊断',exact:true}).click()]);
    const exportedData=JSON.parse(readFileSync(await exported.path(),'utf8'));
    assert.equal(exportedData.host.version,'1.1.0-beta.11');assert.equal(exportedData.server.host.version,'1.1.0-beta.11');
    assert.ok(exportedData.server.modelCalls.some(entry=>entry.diagnostics.failureCode==='EMPTY_RESPONSE'&&entry.diagnostics.attempt===3));
    assert.ok(!JSON.stringify(exportedData).includes('验证空回复诊断'));assert.ok(!JSON.stringify(exportedData).includes('PRIVATE_REASONING_TEXT'));
    await page.getByRole('button',{name:'导入偏好 / 全局设置',exact:true}).click();
    await page.getByText('宿主加载详情',{exact:true}).click();
    assert.match(await page.locator('.gc-runtime-details').textContent(),/实际加载文件.*lib\/index\.js/);
    assert.equal(await page.locator('[data-host-mismatch]').count(),0);
    assert.deepEqual(errors,[]);
  }finally{
    if(browser)await browser.close();for(const d of disposers.reverse())if(typeof d==='function')d();
    server.closeAllConnections();await new Promise(r=>server.close(r));if(previous===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=previous;rmSync(home,{recursive:true,force:true});
  }
});
