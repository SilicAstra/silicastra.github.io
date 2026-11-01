import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const script=html.match(/<script id="feedback-source">([\s\S]*?)<\/script>/)[1];
function setup(fetcher,copy=async()=>{}){
 const elements=new Map();
 function element(id){if(!elements.has(id))elements.set(id,{id,value:'',textContent:'',hidden:false,disabled:false,dataset:{},listeners:{},classes:new Set(),addEventListener(type,fn){this.listeners[type]=fn;},focus(){this.focused=true;},select(){this.selected=true;},getAttribute(name){return this[name]||null;},classList:{add(name){elements.get(id).classes.add(name);},remove(name){elements.get(id).classes.delete(name);}},showModal(){this.open=true;},close(){this.open=false;}});return elements.get(id);}
 const controls=['feedback-category','feedback-message','feedback-contact','feedback-website'].map(element);
 element('feedback-category').value='suggestion';element('feedback-category').selectedIndex=1;element('feedback-category').options=[{text:'遇到问题'},{text:'功能建议'},{text:'其他反馈'}];
 element('feedback-message').value='这是测试反馈，原内容不应丢失。';element('feedback-contact').value='test@example.invalid';
 const form=element('feedback-form');form.reportValidity=()=>true;form.querySelectorAll=()=>controls;form.reset=()=>controls.forEach(e=>e.value='');element('feedback-backup').hidden=true;
 const opener=element('opener'),back=element('back');let timer,ms,cleared=false,calls=0;
 const context=vm.createContext({I18n:{t:x=>x},document:{getElementById:element,querySelectorAll:s=>s==='.feedback-open'?[opener]:[back],body:{dataset:{view:'result'}}},crypto:webcrypto,AbortController,TypeError,Error,navigator:{clipboard:{writeText:copy}},setTimeout(fn,delay){timer=fn;ms=delay;return 1;},clearTimeout(){cleared=true;},fetch:async(...args)=>{calls++;return fetcher(...args);}});
 vm.runInContext(script,context);
 return {el:element,submit:()=>form.listeners.submit({preventDefault(){}}),click:id=>element(id).listeners.click(),back:()=>back.listeners.click(),timer:()=>timer(),get ms(){return ms;},get calls(){return calls;},get cleared(){return cleared;}};
}
const reply=(status,data)=>({status,ok:status>=200&&status<300,json:async()=>data});
{
 const t=setup(async()=>reply(201,{ok:true,id:'123456789'}));assert.equal(t.el('feedback-backup-frame').src,undefined);await t.submit();assert.equal(t.el('feedback-message').value,'');assert.equal(t.el('feedback-status').dataset.state,'success');assert.equal(t.el('feedback-backup').hidden,true);assert(t.cleared);
}
for(const kind of ['network','timeout','server','invalid-response']){
 let request;
 const t=setup(async(url,options)=>{request=JSON.parse(options.body);if(kind==='network')throw new TypeError('offline');if(kind==='server')return reply(503,{});if(kind==='invalid-response')return {...reply(200,{}),json:async()=>{throw new Error('not json');}};return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>{const e=new Error('aborted');e.name='AbortError';reject(e);}));});
 const pending=t.submit();if(kind==='timeout'){assert.equal(t.ms,8000);await t.submit();assert.equal(t.calls,1);t.timer();}await pending;
 assert.equal(t.el('feedback-form').hidden,true,kind);assert.equal(t.el('feedback-backup').hidden,false,kind);assert.match(t.el('feedback-backup-reason').textContent,/自动切换/);assert.match(t.el('feedback-draft').value,/这是测试反馈/);assert.match(t.el('feedback-draft').value,/功能建议/);assert.match(t.el('feedback-draft').value,/结果页/);assert(t.el('feedback-draft').value.includes(request.id));assert(!t.el('feedback-draft').value.includes('test@example.invalid'));assert.equal(t.el('feedback-contact').value,'test@example.invalid');assert(!t.el('feedback-backup-frame').src.includes(encodeURIComponent(request.message)));assert(!t.el('feedback-backup-frame').src.includes(request.id));assert.equal(t.el('feedback-submit').disabled,false);assert.equal(t.el('feedback-backup-open').disabled,false);assert(t.cleared);t.back();assert.equal(t.el('feedback-form').hidden,false);assert.match(t.el('feedback-message').value,/不应丢失/);
}
for(const status of [400,403,429]){
 const t=setup(async()=>reply(status,{ok:false,error:'请稍后重试'}));await t.submit();assert.equal(t.el('feedback-form').hidden,false);assert.equal(t.el('feedback-backup').hidden,true);assert.equal(t.el('feedback-status').dataset.state,'error');assert.equal(t.el('feedback-backup-frame').src,undefined);
}
{
 let copied;const t=setup(()=>{throw new Error('should not call primary');},async text=>{copied=text;});t.click('feedback-backup-open');assert.equal(t.calls,0);await t.click('feedback-copy');assert.equal(copied,t.el('feedback-draft').value);assert.match(t.el('feedback-copy-status').textContent,/已复制/);
}
{
 const t=setup(()=>{},async()=>{throw new Error('denied');});t.click('feedback-backup-open');await t.click('feedback-copy');assert(t.el('feedback-draft').selected);assert.match(t.el('feedback-copy-status').textContent,/无法自动复制/);
}
{
 const t=setup(()=>{});t.el('feedback-message').value='';t.click('feedback-backup-open');assert(t.el('feedback-draft-wrap').hidden);assert.equal(t.el('feedback-backup').hidden,false);t.back();assert.equal(t.el('feedback-form').hidden,false);
}
{
 const t=setup(()=>{});let src,loads=0;Object.defineProperty(t.el('feedback-backup-frame'),'src',{get(){return src;},set(value){src=value;loads++;}});
 t.el('feedback-message').value='字'.repeat(2000);t.click('feedback-backup-open');assert(t.el('feedback-draft').value.length<=2400);assert.equal(loads,1);
 t.click('feedback-close');t.click('opener');assert.equal(loads,1,'closing/reopening must preserve the embedded draft');
 t.back();t.click('feedback-backup-open');assert.equal(loads,2,'starting a fresh fallback must load a new form after previous success');
}
console.log('Feedback tests passed: success, timeout, offline, 5xx, malformed response, validation/rate limits, draft retention, manual fallback and clipboard denial.');
