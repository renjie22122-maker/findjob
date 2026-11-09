import {renderInstructions} from './dynamicBrowser.js';
import type {Browser} from 'playwright';
let browser:Browser|undefined,seq=0;
const pending=new Map<number,{resolve:(x:{body:Buffer;contentType:string})=>void;reject:()=>void}>();
process.on('message',async(message:{type:string;url:string;html:string;id:number;body:Buffer;contentType:string;error?:boolean})=>{
 if(message.type==='stop'){await browser?.close().catch(()=>{});process.exit(0);}
 if(message.type==='resource'){const p=pending.get(message.id);pending.delete(message.id);if(message.error)p?.reject();else p?.resolve({body:message.body,contentType:message.contentType});return;}
 if(message.type!=='start')return;
 try{
  const result=await renderInstructions(message.url,message.html,(url,kind)=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject:()=>reject(Error('Resource blocked'))});process.send?.({type:'read',id,url,kind});}),b=>{browser=b;});
  process.send?.({type:'done',...result});
 }catch{process.send?.({type:'done',html:'',blocked:0,error:'动态说明页不可读取或浏览器不可用'});}
 finally{process.disconnect();}
});
