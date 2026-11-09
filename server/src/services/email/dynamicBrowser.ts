import {chromium,type Browser} from 'playwright';
import {dynamicResource,type ResourceKind} from './dynamicPolicy.js';
export type ResourceReader=(url:string,kind:ResourceKind)=>Promise<{body:Buffer;contentType:string}>;
/** Browser has no direct network route; every permitted resource is fulfilled by the parent. */
export async function renderInstructions(url:string,html:string,read:ResourceReader,onBrowser?:(browser:Browser)=>void){
 const entry=new URL(url),browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{}),args:['--disable-background-networking','--dns-prefetch-disable','--disable-features=NetworkPrediction','--force-webrtc-ip-handling-policy=disable_non_proxied_udp','--js-flags=--max-old-space-size=128']});onBrowser?.(browser);
 let blocked=0,count=0,bytes=Buffer.byteLength(html),documentServed=false;
 try{
  const context=await browser.newContext({acceptDownloads:false,serviceWorkers:'block',permissions:[]});
  await context.routeWebSocket('**',socket=>socket.close());
  await context.addInitScript(()=>{
   for(const name of ['WebSocket','EventSource','RTCPeerConnection','webkitRTCPeerConnection','Worker','SharedWorker'])Object.defineProperty(globalThis,name,{value:class{constructor(){throw Error('Read-only viewer');}},writable:false});
   HTMLFormElement.prototype.submit=function(){throw Error('Read-only viewer');};
   HTMLFormElement.prototype.requestSubmit=function(){throw Error('Read-only viewer');};
  });
  const page=await context.newPage();page.on('dialog',dialog=>void dialog.dismiss());context.on('page',popup=>{if(popup!==page)void popup.close();});
  await context.route('**/*',async route=>{
   const request=route.request(),kind=dynamicResource(entry,request.url(),request.method(),request.resourceType());
   if(!kind||++count>16||bytes>6*1024*1024||kind==='document'&&(documentServed||request.frame()!==page.mainFrame())){blocked++;await route.abort();return;}
   try{
    const resource=kind==='document'?{body:Buffer.from(html),contentType:'text/html; charset=utf-8'}:await read(request.url(),kind);
    if(kind==='document')documentServed=true;
    bytes+=resource.body.length;if(bytes>6*1024*1024)throw Error('Resource budget');
    await route.fulfill({status:200,body:resource.body,contentType:resource.contentType,headers:{'Cache-Control':'no-store','X-DNS-Prefetch-Control':'off','Content-Security-Policy':"default-src 'none'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'"}});
   }catch{blocked++;await route.abort().catch(()=>{});}
  });
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:8000});
  await page.waitForFunction(()=>/(?:截止|有效期|考试时间|面试时间|deadline|schedule)[\s\S]{0,200}\d{1,2}[:：]\d{2}/i.test(document.body?.innerText||'')||/已完成|已提交|completed|submitted/i.test(document.body?.innerText||'')||[...document.querySelectorAll('input[type=password],input[autocomplete=one-time-code]')].some(e=>e.getClientRects().length),{},{timeout:3500}).catch(()=>{});
  const snapshot=await page.evaluate(()=>{
   const guarded=[...document.querySelectorAll('input[type=password],input[autocomplete=one-time-code],.question input,[data-question-id],input[name*=answer],input[name*=question]')].some(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden');
   // Visible DOM text only; never copy script state, hidden fields or input values.
   document.querySelectorAll('button,input,select,textarea,nav').forEach(e=>e.remove());
   const text=(document.body?.innerText||'').slice(0,10000);
   const safe=text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
   return guarded?'<input type="password">':`<main>${safe}</main>`;
  });
  return {html:snapshot,blocked,requests:count};
 }finally{await browser.close();}
}
