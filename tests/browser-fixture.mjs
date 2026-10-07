import React from 'react';
import { createRoot } from 'react-dom/client';
const clone = (x) => typeof x !== 'object' || x === null ? x : Array.isArray(x) ? x.map(clone) : Object.fromEntries(Object.entries(x).map(([k,v])=>[k,clone(v)]));
function createSnapshotStore(state) {
  const listeners = new Set();
  return { getSnapshot: () => state, subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); }, update: (fn) => { const next=clone(state); fn(next); state=next; for(const fn of listeners) fn(); } };
}
window.__ModuleLoader__ = { load(bundle) { window.plugin = bundle.factory((name) => name === 'react' ? React : { createSnapshotStore }); } };
const entries = [];
const subscriptions = new Set(); let generation = 0;
function notify() { generation++; for(const fn of subscriptions) fn(); }
const disposers = [];
let targetDefinition;
const mainSelection = {provider:'main-api',model:'MainModel',reasoningEffort:'high'};
let modelSnapshot = window.delayMainModel ? {current:null} : {next:mainSelection};
const modelListeners=new Set();
const modelSource = { getSnapshot:()=>modelSnapshot, subscribe:(fn)=>{modelListeners.add(fn);return()=>modelListeners.delete(fn);} };
let modelFlight;
const directory={store:modelSource,load:()=>modelFlight??=(new Promise(resolve=>setTimeout(()=>{modelSnapshot={current:mainSelection};for(const fn of modelListeners)fn();resolve(modelSnapshot);},window.delayMainModel??0)))};
const ctx = {
  get: (name) => name === 'uiConversation' ? {views:{register:(definition)=>{targetDefinition=definition;return ()=>{targetDefinition=null;};}}} : name === 'modelDirectories' && window.useModelDirectory ? {directoryFor:()=>directory} : undefined,
  sessions: {binding:(sessionId)=>({sessionId,eventSource:{getSnapshot:()=>({entries:window.mainEntries??[]})},session:{projections:{faceOf:(name)=>name==='modelSelection'?modelSource:{getSnapshot:()=>[]}}}})},
  effect: (fn) => { disposers.push(fn()); },
  locale: { register: () => () => {}, bind: () => (key) => key },
  slots: {
    inject: (name, fn) => { disposers.push(fn()); },
    register: (options, component) => {
      const entry = { options, component }; entries.push(entry); notify();
      return () => { const i=entries.indexOf(entry); if(i>=0) { entries.splice(i,1); notify(); } };
    },
  },
};
window.start = () => {
  window.plugin.apply(ctx);
  const t = (key) => ({ 'composer.send':'发送', 'composer.stop':'停止', 'composer.placeholder':'@成员名，开始协作', 'view.loading':'正在加载群聊…', 'panel.members':'成员', 'panel.memory':'记忆', 'panel.tasks':'任务', 'actions.clear':'清空' }[key] ?? key);
  function App() {
    React.useSyncExternalStore((fn)=>{ subscriptions.add(fn); return ()=>subscriptions.delete(fn); },()=>generation);
    const [session,setSession] = React.useState('session-1');
    const [view,setView] = React.useState(true);
    const [restored,setRestored] = React.useState(false);
    const entry = entries.find((e)=>e.options.name==='conversation.view');
    const composer = entries.filter((e)=>e.options.name==='conversation.composer').sort((a,b)=>a.options.priority-b.options.priority).find((e)=>e.options.select({sessionId:session}));
    React.useLayoutEffect(()=>{
      const seat=document.querySelector('[data-composer-seat]'); const scroll=document.querySelector('[data-conversation-scroll]');
      if(seat && scroll) scroll.style.setProperty('--dsh-composer-height', `${seat.offsetHeight}px`);
    });
    const h=React.createElement;
    return h('div',{className:'root','data-phase':'active'},[
      h('header',{key:'header'},[
        h('button',{id:'switch',onClick:()=>setSession((s)=>s==='session-1'?'session-2':'session-1')},'切换会话'),
        h('button',{id:'new',onClick:()=>setSession(undefined)},'新对话'),
        h('button',{id:'return-old',onClick:()=>{setRestored(true);setSession('session-1');}},'返回旧对话'),
        h('button',{id:'blank',onClick:()=>setSession('blank-session')},'空白会话'),
        h('button',{id:'toggle',onClick:()=>setView(!view)},'普通/群聊'),
        h('span',{id:'session'},session),
      ]),
      h('div',{className:'body',key:'body','data-conversation-content':'','data-conversation-region':'chat'},h('div',{className:'scrollBody','data-conversation-scroll':''},[
        h('div',{'data-slot':'conversation.session',style:{display:'contents'},key:session},h('div',{className:'viewArea'},view&&entry&&session!==undefined?h('div',{className:restored?'restoredWrapper':'initialWrapper',style:restored?{display:'block',position:'relative',contain:'layout',height:'auto'}:{display:'contents'}},h(entry.component,{...entry.options.inject(session),t,sessionId:session})):h('div',{id:'normal'},'普通会话'))),
        h('div',{className:'composerSeat','data-composer-seat':'',key:'composer'},composer?h(composer.component,{...composer.options.inject(),t,sessionId:session,key:session}):h('textarea',{id:'default-input'})),
      ])),
    ]);
  }
  createRoot(document.getElementById('app')).render(React.createElement(App));
};
window.targetRegistered = () => Boolean(targetDefinition);
window.entryCount = () => entries.filter(e=>e.options.name==='conversation.composer').length;
