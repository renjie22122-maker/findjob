import {EventEmitter} from 'node:events';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({status:200,html:'<p>截止时间2099年11月8日17:00</p>',ip:'8.8.8.8',calls:vi.fn(),dns:vi.fn()}));
vi.mock('node:dns/promises',()=>({lookup:async()=>{state.dns();return [{address:state.ip,family:4}];}}));
vi.mock('node:https',()=>({request:(url:URL,options:unknown,cb:(r:unknown)=>void)=>{
 state.calls(url.href,options);
 const req=new EventEmitter() as EventEmitter&{end:()=>void;destroy:(error?:Error)=>void};
 req.destroy=error=>{if(error)req.emit('error',error);req.emit('close');};
 req.end=()=>queueMicrotask(()=>{
  const res=Object.assign(new EventEmitter(),{statusCode:state.status,headers:{'content-type':'text/html',location:'https://127.0.0.1/private'},destroy:()=>{}});
  cb(res);res.emit('data',Buffer.from(state.html));res.emit('end');req.emit('close');
 });return req;
}}));
import {publicNoticeExcerpt} from './publicNoticePages.js';
beforeEach(()=>{state.status=200;state.html='<p>截止时间2099年11月8日17:00</p>';state.ip='8.8.8.8';state.calls.mockClear();state.dns.mockClear();});
afterEach(()=>vi.unstubAllEnvs());
function grant(path:string){const url=`https://public.example.org/${path}`;vi.stubEnv('CAREERFLOW_PUBLIC_NOTICE_URLS',JSON.stringify([url]));return url;}
it('只读一次并缓存脱敏摘录，DNS固定，不发送Cookie和认证头',async()=>{
 const url=grant('announcement');const body=`截止时间见 ${url}`;
 expect(await publicNoticeExcerpt(body,'')).toContain('截止时间2099年11月8日17:00');
 await publicNoticeExcerpt(body,'');expect(state.calls).toHaveBeenCalledTimes(1);
 const options=state.calls.mock.calls[0][1];expect(options.headers.Cookie).toBeUndefined();expect(options.headers.Authorization).toBeUndefined();
 const cb=vi.fn();options.lookup('public.example.org',{},cb);expect(cb).toHaveBeenCalledWith(null,'8.8.8.8',4);
});
it('重定向不跟随，失败缓存避免反复请求',async()=>{
 const url=grant('redirect');state.status=302;
 expect(await publicNoticeExcerpt(`时间见 ${url}`, '')).toBe('');
 await publicNoticeExcerpt(`时间见 ${url}`,'');expect(state.calls).toHaveBeenCalledTimes(1);
});
it('DNS指向内网时零HTTP请求',async()=>{
 const url=grant('internal');state.ip='127.0.0.1';
 expect(await publicNoticeExcerpt(`时间见 ${url}`, '')).toBe('');expect(state.calls).not.toHaveBeenCalled();
});
