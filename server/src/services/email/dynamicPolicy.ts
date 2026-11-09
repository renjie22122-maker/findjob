export type ResourceKind='document'|'script'|'stylesheet'|'data';
/** Independent of model confidence. No arbitrary page APIs or authenticated requests. */
export function dynamicResource(entry:URL,target:string,method:string,type:string):ResourceKind|null{
 try{
  const u=new URL(target),path=decodeURIComponent(u.pathname);
  if(method!=='GET'||u.protocol!=='https:'||u.origin!==entry.origin||u.username||u.password||u.hash||u.port)return null;
  if(/auth|login|signin|verify|captcha|token|session|start|begin|submit|confirm|participat|answer|question|logout|unsubscribe/i.test(path)||/%|[\\\u0000-\u001f]/.test(path))return null;
  if(type==='document')return u.href===entry.href?'document':null;
  // Static version keys only, never copied candidate tokens.
  if([...u.searchParams].some(([key,value])=>!['v','ver','version'].includes(key)||!/^[\w.-]{1,40}$/.test(value)))return null;
  if(type==='script'&&/\.m?js$/i.test(path))return 'script';
  if(type==='stylesheet'&&/\.css$/i.test(path))return 'stylesheet';
  if(['fetch','xhr'].includes(type)&&/\/(?:instructions|schedule|summary|metadata)\.json$/i.test(path))return 'data';
  return null;
 }catch{return null;}
}
