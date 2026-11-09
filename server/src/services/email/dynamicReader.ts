import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';
import {dynamicResource,type ResourceKind} from './dynamicPolicy.js';
import {readPublicResource} from './publicNoticePages.js';
import {recordAudit} from '../audit.service.js';
let busy=false;
export async function readDynamicInstructions(url:URL,html:string,budgetMs=15000):Promise<{html:string;blocked?:number}>{
 if(busy)return {html:''};busy=true;
 try{return await new Promise(resolve=>{
  const local=new URL('./dynamic.worker.js',import.meta.url),worker=existsSync(local)?local:new URL('../../../dist/services/email/dynamic.worker.js',import.meta.url);
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(PATH|SystemRoot|WINDIR|TEMP|TMP|LOCALAPPDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|PLAYWRIGHT_BROWSERS_PATH)$/i.test(key)));
  const child=spawn(process.execPath,['--max-old-space-size=160',fileURLToPath(worker)],{env,windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','ignore','ignore','ipc'],serialization:'advanced'});
  let settled=false,requests=0;
  const finish=(result:{html:string;blocked?:number})=>{if(settled)return;settled=true;clearTimeout(timer);recordAudit({kind:'crawl',target:url.hostname,detail:'隔离动态说明页：禁止点击、提交、身份验证和任意接口',status:result.html?'success':'failed',result:`资源请求 ${requests}；拦截 ${result.blocked??0}`,error:result.html?undefined:'超时、浏览器不可用或页面不能在只读边界内加载'});resolve(result);};
  const timer=setTimeout(()=>{
   child.send?.({type:'stop'},()=>{});
   if(process.platform==='win32')spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'}).on('error',()=>child.kill());
   else if(child.pid)try{process.kill(-child.pid,'SIGKILL');}catch{child.kill();}
   finish({html:''});
  },Math.max(1000,Math.min(15000,budgetMs)));
  child.on('error',()=>finish({html:''}));child.on('exit',()=>finish({html:''}));
  child.on('message',async(message:{type:string;id:number;url:string;kind:ResourceKind;html:string;blocked:number})=>{
   if(message.type==='done'){finish({html:message.html?.slice(0,128*1024)||'',blocked:message.blocked});return;}
   if(message.type!=='read'||settled)return;
   const kind=dynamicResource(url,message.url,'GET',message.kind==='data'?'fetch':message.kind);
   try{if(!kind||kind==='document'||++requests>15)throw Error('Policy');const resource=await readPublicResource(new URL(message.url),kind);if(child.connected)child.send?.({type:'resource',id:message.id,...resource},()=>{});}
   catch{if(child.connected)child.send?.({type:'resource',id:message.id,error:true},()=>{});}
  });
  child.send?.({type:'start',url:url.href,html},()=>{});
 });}finally{busy=false;}
}
