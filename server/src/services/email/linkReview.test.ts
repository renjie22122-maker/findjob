import {beforeEach,it,expect,vi} from 'vitest';
const mock=vi.hoisted(()=>vi.fn());
vi.mock('../settings.service.js',()=>({getLlmConfig:()=>({apiKey:'synthetic',baseUrl:'synthetic',model:'model'})}));
vi.mock('../llm/llm.client.js',()=>({chatJson:mock}));
import {inspectLink,reviewLinks} from './linkReview.js';
beforeEach(()=>mock.mockReset());
const candidate=(path:string)=>({url:`https://example.org/${path}`,label:'考试说明',context:'考试只有一次机会，截止时间见说明'});
it('只否决首次访问生效及操作链接，不因考试只有一次或旁边有确认按钮一概阻断',()=>{
 expect(inspectLink(candidate('instructions'),'考试不提供二次机会。请确认是否参加').url).toBeDefined();
 for(const c of [{...candidate('guide'),label:'确认参加'},{...candidate('guide'),context:'打开即开始考试'},candidate('guide?token=secret'),candidate('guide/ab12cd34ef56ab78cd90ef12'),candidate('%2563onfirm')])expect(inspectLink(c,'').url).toBeUndefined();
});
it('经过文档核对的平台摘要页严格匹配主机路径及参数；ID不传给AI',async()=>{
 const c={...candidate(''),url:'https://exam.nowcoder.com/cts/123456/summary?id=privateIdentifier'};
 expect(inspectLink(c,'').url).toBeDefined();
 for(const url of [c.url.replace('exam.nowcoder.com','evil.example'),c.url+'&token=secret',c.url+'&id=other',c.url.replace('/summary','/start'),c.url+'#start'])expect(inspectLink({...c,url},'').url).toBeUndefined();
 mock.mockResolvedValue({decisions:[{index:0,purpose:'instructions',safeRead:true,confidence:.99,reason:'平台摘要页'}]});
 await reviewLinks([c],'时间安排');
 expect(mock.mock.calls[0][1]).not.toContain('privateIdentifier');expect(mock.mock.calls[0][1]).toContain('nowcoder-exam-summary');
});
it('AI确认用途后才允许只读，决策缓存避免重复API调用',async()=>{
 mock.mockResolvedValue({decisions:[{index:0,purpose:'instructions',safeRead:true,confidence:.99,reason:'公开时间说明'}]});
 const c=[candidate('guide-cache')];expect((await reviewLinks(c,'时间安排'))[0].decision).toBe('read');
 await reviewLinks(c,'时间安排');expect(mock).toHaveBeenCalledTimes(1);
 expect(mock.mock.calls[0][3]).toMatchObject({timeoutMs:12000});
});
it('低置信度、模型重复索引、失败和伪造索引均不授权',async()=>{
 mock.mockResolvedValue({decisions:[{index:0,purpose:'instructions',safeRead:true,confidence:.8,reason:'不确定'}]});
 expect((await reviewLinks([candidate('low')],''))[0].decision).toBe('uncertain');
 mock.mockResolvedValue({decisions:[0,0].map(index=>({index,purpose:'instructions',safeRead:true,confidence:1,reason:'重复'}))});
 expect((await reviewLinks([candidate('duplicate')],''))[0].decision).toBe('uncertain');
 mock.mockRejectedValue(Error('timeout'));expect((await reviewLinks([candidate('timeout')],''))[0].decision).toBe('uncertain');
 mock.mockResolvedValue({decisions:[{index:5,purpose:'instructions',safeRead:true,confidence:1,reason:'伪造'}]});
 expect((await reviewLinks([candidate('invented')],''))[0].decision).toBe('uncertain');
});
