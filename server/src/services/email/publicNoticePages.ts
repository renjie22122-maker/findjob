import {lookup} from 'node:dns/promises';
import {request} from 'node:https';
import {load} from 'cheerio';
import {redactMailSecrets} from './contentSafety.js';

export const PAGE_MARKER='\n[只读公开通知页摘录]\n';
const unsafe=/验证码|身份验证|私人专属|不提供二次机会|仅限一次|确认是否参加|开始答题|one.time|start (?:test|exam)|confirm.*participat/i;
/** Explicit URL grants, not domain grants: no personal paths, parameters or redirects. */
export function approvedPublicPage(value:string, grants:string[]):URL|null {
 try {
  const u=new URL(value);
  if(u.protocol!=='https:'||u.port||u.username||u.password||u.search||u.hash||!grants.includes(u.href))return null;
  if(/token|auth|login|signin|verify|confirm|unsubscribe|start|session|candidate|invite|\/s\//i.test(decodeURIComponent(u.pathname)))return null;
  return u;
 } catch {return null;}
}
export function publicIPv4(ip:string):boolean {
 const parts=ip.split('.').map(Number);
 if(parts.length!==4||parts.some(n=>!Number.isInteger(n)||n<0||n>255))return false;
 const [a,b,c]=parts;
 return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===2)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113);
}
export function publicPageText(html:string):string {
 const $=load(html);
 if($('form,input[type=password]').length||unsafe.test($.text()))throw Error('页面涉及交互或身份验证');
 $('script,style,iframe,object,svg,img,link,meta,noscript').remove();
 $('br').replaceWith('\n');$('p,div,tr,li').append('\n');
 const text=$.text().trim();if(text.length>8000)throw Error('公开页超出文本限额');
 return redactMailSecrets(text);
}
async function readPage(url:URL):Promise<string>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 const addresses=await Promise.race([lookup(url.hostname,{all:true}),new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(Error('域名解析超时')),3000);})]).finally(()=>clearTimeout(timer));
 if(!addresses.length||addresses.some(a=>a.family!==4||!publicIPv4(a.address)))throw Error('非公开地址');
 const address=addresses[0].address;
 return new Promise((resolve,reject)=>{
  // Pin the validated DNS address. No cookies, authorization, JS, redirects or subresources.
  const req=request(url,{method:'GET',family:4,headers:{Accept:'text/html,text/plain','Accept-Encoding':'identity'},lookup:(_host,_options,cb)=>cb(null,address,4)},res=>{
   if(res.statusCode!==200||!/^text\/(html|plain)(?:;|$)/i.test(res.headers['content-type']||'')||res.headers['content-encoding']&&res.headers['content-encoding']!=='identity'){
    res.destroy();req.destroy();reject(Error('非只读文本响应'));return;
   }
   let size=0;const chunks:Buffer[]=[];
   res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>128*1024){req.destroy(Error('公开页超过128KiB'));return;}chunks.push(chunk);});
   res.on('error',reject);res.on('end',()=>{try{resolve(publicPageText(Buffer.concat(chunks).toString('utf8')));}catch(e){reject(e);}});
  });
  const timer=setTimeout(()=>req.destroy(Error('公开页读取超时')),5000);
  req.on('error',reject);req.on('close',()=>clearTimeout(timer));req.end();
 });
}
const cache=new Map<string,{at:number;text:string}>();
/** Called only while parsing a new mail. Private examination links are never probed. */
export async function publicNoticeExcerpt(body:string,html:string):Promise<string>{
 if(unsafe.test(body)||!/(?:截止|有效期|时间|deadline|schedule)/i.test(body))return '';
 let grants:string[]=[];try{const parsed=JSON.parse(process.env.CAREERFLOW_PUBLIC_NOTICE_URLS||'[]');if(Array.isArray(parsed))grants=parsed.filter(x=>typeof x==='string');}catch{return '';}
 if(!grants.length)return '';
 const $=load(html),values=[...body.matchAll(/https:\/\/[^\s<>"'）)]+/g)].map(m=>m[0]);
 $('a[href]').each((_i,el)=>{values.push($(el).attr('href')||'');});
 const urls=[...new Set(values)].map(v=>approvedPublicPage(v,grants)).filter((u):u is URL=>!!u).slice(0,2);
 const excerpts:string[]=[];
 for(const url of urls){
  const old=cache.get(url.href);let text=old&&Date.now()-old.at<3600000?old.text:undefined;
  if(text===undefined){try{text=await readPage(url);}catch{text='';}if(cache.size>=64)cache.delete(cache.keys().next().value!);cache.set(url.href,{at:Date.now(),text});}
  if(text)excerpts.push(`来源：${url.hostname}${url.pathname}\n读取时间：${new Date().toISOString()}\n${text}`);
 }
 return excerpts.length?PAGE_MARKER+excerpts.join('\n\n'):'';
}
