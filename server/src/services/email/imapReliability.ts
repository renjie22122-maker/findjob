/** Only allow-listed categories leave the transport layer; never log server payloads. */
export function imapFailure(error:unknown){
 const e=error as {code?:string;authenticationFailed?:boolean;message?:string};
 if(e?.authenticationFailed||/auth|credential|login failed/i.test(e?.message??''))return {kind:'authentication',message:'邮箱认证失败，请在设置中检查授权',retry:false};
 const code=String(e?.code??'');
 if(['ENOTFOUND','EAI_AGAIN'].includes(code))return {kind:'dns',message:'邮箱服务器域名解析失败，请检查网络或 DNS',retry:true};
 if(['ETIMEDOUT','ETIMEOUT','IMAP_SESSION_TIMEOUT'].includes(code))return {kind:'timeout',message:'邮箱读取超时，已关闭本次连接，增量游标保留',retry:true};
 if(['ECONNRESET','ECONNREFUSED','EPIPE','NoConnection','ConnectionNotAvailable','SocketClosed'].includes(code))return {kind:'connection',message:'邮箱连接中断或被拒绝，增量游标保留',retry:true};
 return {kind:'upstream',message:'邮箱服务器未完成读取，可能为临时服务异常或限流，尚无法确定具体原因',retry:true};
}
export async function boundedImap<T>(client:{close:()=>void},task:()=>Promise<T>,milliseconds:number):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([task(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{reject(Object.assign(new Error('IMAP session deadline'),{code:'IMAP_SESSION_TIMEOUT'}));client.close();},milliseconds);})]);}
 finally{if(timer)clearTimeout(timer);client.close();}
}
