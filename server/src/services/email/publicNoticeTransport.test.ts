import {EventEmitter} from 'node:events';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({status:200,html:'<p>截止时间2099年11月8日17:00</p>',ip:'8.8.8.8',calls:vi.fn(),dns:vi.fn(),model:vi.fn()}));
vi.mock('../settings.service.js',()=>({getLlmConfig:()=>({apiKey:'synthetic',baseUrl:'synthetic',model:'synthetic'})}));
vi.mock('../llm/llm.client.js',()=>({chatJson:state.model}));
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
beforeEach(()=>{state.status=200;state.html='<p>截止时间2099年11月8日17:00</p>';state.ip='8.8.8.8';state.calls.mockClear();state.dns.mockClear();state.model.mockReset();});
afterEach(()=>vi.unstubAllEnvs());
function grant(path:string){const url=`https://public.example.org/${path}`;vi.stubEnv('CAREERFLOW_PUBLIC_NOTICE_URLS',JSON.stringify([url]));return url;}
it('只读一次并缓存脱敏摘录，DNS固定，不发送Cookie和认证头',async()=>{
 const url=grant('announcement');const body=`截止截止时间见 ${url}`;
 expect(await publicNoticeExcerpt(body,'')).toContain('截止时间2099年11月8日17:00');
 await publicNoticeExcerpt(body,'');expect(state.calls).toHaveBeenCalledTimes(1);
 const options=state.calls.mock.calls[0][1];expect(options.headers.Cookie).toBeUndefined();expect(options.headers.Authorization).toBeUndefined();
 const cb=vi.fn();options.lookup('public.example.org',{},cb);expect(cb).toHaveBeenCalledWith(null,'8.8.8.8',4);
});
it('重定向不跟随，失败缓存避免反复请求',async()=>{
 const url=grant('redirect');state.status=302;
 expect(await publicNoticeExcerpt(`截止时间见 ${url}`, '')).toBe('');
 await publicNoticeExcerpt(`截止时间见 ${url}`,'');expect(state.calls).toHaveBeenCalledTimes(1);
});
it('DNS指向内网时零HTTP请求',async()=>{
 const url=grant('internal');state.ip='127.0.0.1';
 expect(await publicNoticeExcerpt(`截止时间见 ${url}`, '')).toBe('');expect(state.calls).not.toHaveBeenCalled();
});
it('无逐条授权时AI只允许说明链接，旁边的开始按钮不访问',async()=>{
 vi.stubEnv('CAREERFLOW_PUBLIC_NOTICE_URLS','[]');
 state.html='<p>作答截止2099年11月8日17:00</p><form action="/start"><button>开始答题</button></form>';
 state.model.mockResolvedValue({decisions:[{index:0,purpose:'instructions',safeRead:true,confidence:.99,reason:'静态说明页'}]});
 const html='<p><a href="https://public.example.org/instructions-auto">考试说明</a></p><p><a href="https://public.example.org/start">开始答题</a></p>';
 expect(await publicNoticeExcerpt('作答有效期在考试说明，考试不提供二次机会',html)).toContain('2099年11月8日17:00');
 expect(state.model).toHaveBeenCalledTimes(1);expect(state.calls).toHaveBeenCalledTimes(1);
 expect(state.calls.mock.calls[0][0]).toBe('https://public.example.org/instructions-auto');
});
it('AI不确定或请求失败时不发GET；关闭功能后连AI也不请求',async()=>{
 vi.stubEnv('CAREERFLOW_PUBLIC_NOTICE_URLS','[]');state.model.mockRejectedValue(Error('timeout'));
 expect(await publicNoticeExcerpt('截止时间见 https://public.example.org/instructions-failed','')).toBe('');expect(state.calls).not.toHaveBeenCalled();
 vi.stubEnv('CAREERFLOW_LINK_REVIEW','off');state.model.mockClear();
 expect(await publicNoticeExcerpt('截止时间见 https://public.example.org/instructions-disabled','')).toBe('');expect(state.model).not.toHaveBeenCalled();
});
