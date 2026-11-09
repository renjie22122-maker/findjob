import {lookup} from 'node:dns/promises';
import {request} from 'node:https';
import {load} from 'cheerio';
import {redactMailSecrets} from './contentSafety.js';
import {inspectLink,reviewLinks,type LinkCandidate} from './linkReview.js';
import {recordAudit} from '../audit.service.js';
import {instructionRoute} from './instructionRoutes.js';

export const PAGE_MARKER='\n[只读公开通知页摘录]\n';
/** Compatibility helper for the optional exact-URL grants; preflight still cannot be bypassed. */
export function approvedPublicPage(value:string, grants:string[]):URL|null {
 const checked=inspectLink({url:value,label:'',context:''},'');
 return checked.url&&grants.includes(checked.url.href)?checked.url:null;
}
export function publicIPv4(ip:string):boolean {
 const parts=ip.split('.').map(Number);
 if(parts.length!==4||parts.some(n=>!Number.isInteger(n)||n<0||n>255))return false;
 const [a,b,c]=parts;
 return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===2)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113);
}
export function publicPageText(html:string):string {
 const $=load(html);
 $('[hidden],[aria-hidden="true"]').remove();
 $('[style]').each((_i,node)=>{if(/display\s*:\s*none|visibility\s*:\s*hidden/i.test($(node).attr('style')||''))$(node).remove();});
 if($('input[type=password],input[autocomplete=one-time-code],.question input,[data-question-id],input[name*=answer],input[name*=question]').length || /答题中|考试已开始|剩余答题时间|第\s*\d+\s*题|question\s+\d+\s+of/i.test($.text()))throw Error('页面涉及身份验证或实际答题');
 // Reading instructions is independent of action controls. Never submit or follow them.
 $('button,input,select,textarea,nav').remove();
 $('form').each((_i,form)=>{$(form).replaceWith($(form).contents());});
 $('script,style,iframe,object,svg,img,link,meta,noscript').remove();
 $('br').replaceWith('\n');$('p,div,tr,li').append('\n');
 const text=$.text().trim();if(text.length>8000)throw Error('公开页超出文本限额');
 return redactMailSecrets(text);
}
export async function readPublicResource(url:URL,kind:'document'|'script'|'stylesheet'|'data'='document'):Promise<{body:Buffer;contentType:string}>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 const addresses=await Promise.race([lookup(url.hostname,{all:true}),new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(Error('域名解析超时')),3000);})]).finally(()=>clearTimeout(timer));
 const ipv4=addresses.filter(a=>a.family===4);
 if(!ipv4.length||ipv4.some(a=>!publicIPv4(a.address)))throw Error('非公开地址');
 const address=ipv4[0].address;
 return new Promise((resolve,reject)=>{
  // Pin the validated DNS address. No cookies, authorization, JS, redirects or subresources.
  const accept={document:'text/html,text/plain',script:'application/javascript,text/javascript',stylesheet:'text/css',data:'application/json'}[kind];
  const req=request(url,{method:'GET',family:4,headers:{Accept:accept,'Accept-Encoding':'identity'},lookup:(_host,_options,cb)=>cb(null,address,4)},res=>{
   if(res.statusCode!==200||!(kind==='document'?/^text\/(html|plain)(?:;|$)/i:kind==='script'?/^(?:application|text)\/(?:javascript|x-javascript)(?:;|$)/i:kind==='stylesheet'?/^text\/css(?:;|$)/i:/^application\/json(?:;|$)/i).test(res.headers['content-type']||'')||res.headers['content-encoding']&&res.headers['content-encoding']!=='identity'){
    res.destroy();req.destroy();reject(Error('非只读文本响应'));return;
   }
   let size=0;const chunks:Buffer[]=[];
   res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>(kind==='script'?2*1024*1024:128*1024)){req.destroy(Error('公开页超过128KiB'));return;}chunks.push(chunk);});
   res.on('error',reject);res.on('end',()=>{try{resolve({body:Buffer.concat(chunks),contentType:res.headers['content-type']||'text/plain'});}catch(e){reject(e);}});
  });
  const timer=setTimeout(()=>req.destroy(Error('公开页读取超时')),5000);
  req.on('error',reject);req.on('close',()=>clearTimeout(timer));req.end();
 });
}
async function readPage(url:URL):Promise<string>{
 const resource=await readPublicResource(url);
 const text=publicPageText(resource.body.toString('utf8'));
 if(!/(?:截止|有效期|考试时间|面试时间|时间安排|deadline|schedule)[\s\S]{0,200}\d{1,2}[:：]\d{2}/i.test(text)&&process.env.CAREERFLOW_DYNAMIC_READ!=='off'){
  const {readDynamicInstructions}=await import('./dynamicReader.js');
  const rendered=await readDynamicInstructions(url,resource.body.toString('utf8'));
  if(rendered.html)return publicPageText(rendered.html);
 }
 return text;
}
const cache=new Map<string,{at:number;text:string}>();
/** At most one AI review and two static GETs per mail; only eligible instruction links are considered. */
export async function publicNoticeExcerpt(body:string,html:string):Promise<string>{
 if(process.env.CAREERFLOW_LINK_REVIEW==='off'||!/(?:截止|有效期|考试时间|面试时间|时间安排|deadline|schedule)/i.test(body))return '';
 let grants:string[]=[];try{const parsed=JSON.parse(process.env.CAREERFLOW_PUBLIC_NOTICE_URLS||'[]');if(Array.isArray(parsed))grants=parsed.filter(x=>typeof x==='string');}catch{/* Invalid optional grants do not disable the model review. */}
 const $=load(html),candidates:LinkCandidate[]=[];
 // Prefer the actual anchor label over its duplicate URL in a plain-text alternative.
 $('a[href]').slice(0,30).each((_i,el)=>{candidates.push({url:$(el).attr('href')||'',label:$(el).text().trim().slice(0,200),context:$(el).parent().text().trim().slice(0,500)});});
 for(const m of body.matchAll(/https:\/\/[^\s<>"'）)]+/g)){if(candidates.length>=60)break;candidates.push({url:m[0],label:'',context:body.slice(Math.max(0,m.index!-100),m.index!+m[0].length+100)});}
 const unique=[...new Map(candidates.reverse().map(c=>[c.url,c])).values()].reverse();
 const eligible:LinkCandidate[]=[],allowed:URL[]=[];
 for(const c of unique.slice(0,30)){
  const checked=inspectLink(c,body);
  if(!checked.url){if(/说明|须知|考试|面试|instructions|exam|interview/i.test(c.label))recordAudit({kind:'crawl',target:'招聘通知中的链接（地址不记录）',detail:'首次读取安全检查',status:'failed',error:checked.reason});continue;}
  // An explicit grant or a descriptive informational cue is required before asking the AI.
  if(grants.includes(checked.url.href)&&!checked.url.search){allowed.push(checked.url);continue;}
  if(!instructionRoute(checked.url)&&!/说明|须知|公告|安排|详情|instructions|guide|notice|schedule|announcement|details/i.test(c.label+' '+decodeURIComponent(checked.url.pathname)))continue;
  if(eligible.length<6)eligible.push({...c,url:checked.url.href});
 }
 const decisions=allowed.length>=2?[]:await reviewLinks(eligible,body);
 for(const d of decisions){
  const c=eligible[d.index];
  recordAudit({kind:'crawl',target:new URL(c.url).hostname,detail:'说明页首次读取决策',status:d.decision==='read'?'success':'failed',result:d.decision,error:d.decision==='read'?undefined:d.reason});
  if(d.decision==='read')allowed.push(new URL(c.url));
 }
 const excerpts:string[]=[];
 for(const url of [...new Map(allowed.map(u=>[u.href,u])).values()].slice(0,2)){
  const old=cache.get(url.href);let text=old&&Date.now()-old.at<3600000?old.text:undefined;
  if(text===undefined){
   try{text=await readPage(url);const hasTiming=/(?:截止|有效期|考试时间|面试时间|时间安排|deadline|schedule)/i.test(text);recordAudit({kind:'crawl',target:url.hostname,detail:'只读说明页GET：无脚本、无Cookie、无页面操作',status:hasTiming?'success':'failed',result:`提取 ${text.length} 字符`,error:hasTiming?undefined:'说明页已读取，但静态内容没有可核对时间；未执行脚本、登录或继续调用页面接口'});}
   catch{text='';recordAudit({kind:'crawl',target:url.hostname,detail:'只读说明页GET',status:'failed',error:'读取受限或失败；未继续跳转、登录或执行页面操作'});}
   if(cache.size>=64)cache.delete(cache.keys().next().value!);cache.set(url.href,{at:Date.now(),text});
  }
  if(text&&/(?:截止|有效期|考试时间|面试时间|时间安排|deadline|schedule)/i.test(text))excerpts.push(`来源：${url.hostname}${url.pathname}\n读取时间：${new Date().toISOString()}\n${text}`);
 }
 return excerpts.length?PAGE_MARKER+excerpts.join('\n\n'):'';
}
