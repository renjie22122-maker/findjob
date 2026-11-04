import {beforeEach,it,expect,vi} from 'vitest';
import {getDb,closeDb} from '../../db/connection.js';
import {createCompany,findCompanyByName} from '../companies.service.js';
import {aliasCompany,findCanonicalCompany,reconcileOrganizationNames,fuzzyOrganizationMatch,expandOrganizationSearch} from './organizations.js';
import {workGraph} from './graph.js';
import {applyWorkPlan,workFingerprint} from './engine.js';
const layoutModule='../../../../client/src/utils/workGraphLayout.ts';
const {layoutWorkGraph}=await import(layoutModule);
const model=vi.hoisted(()=>vi.fn());
vi.mock('../settings.service.js',()=>({getLlmConfig:()=>({apiKey:'test'})}));
vi.mock('../llm/llm.client.js',async original=>({...await original<object>(),chatJson:model}));
beforeEach(()=>{closeDb();getDb();model.mockReset();process.env.CAREERFLOW_PUBLIC_SEARCH='0';});
it('typographic variants normalize without swallowing regional subsidiaries',()=>{
 const a=createCompany({name:'样例游戏互娱'}),b=createCompany({name:'样例游戏（互娱）'}),c=createCompany({name:'样例游戏上海分公司'});
 expect(reconcileOrganizationNames()).toBe(1);expect(reconcileOrganizationNames()).toBe(0);
 expect(findCanonicalCompany(b.name)?.id).toBe(a.id);expect(findCanonicalCompany(c.name)?.id).toBe(c.id);
 expect(workGraph().nodes.filter(n=>n.kind==='company')).toHaveLength(2);
 expect(workGraph(b.name).nodes.some(n=>n.id===`company:${a.id}`)).toBe(true);
});
it('bilingual identity redirects future imports and retains an audit trail',()=>{
 const a=createCompany({name:'样例证券'}),b=createCompany({name:'Example Securities'});
 aliasCompany(b.id,a.id,'用户确认中英文名称');expect(findCompanyByName(b.name)?.id).toBe(a.id);
 expect(workGraph('example').nodes.find(n=>n.kind==='company')?.title).toBe(a.name);
 expect(aliasCompany(b.id,a.id,'重复请求')).toMatchObject({unchanged:true});
 expect(getDb().prepare('SELECT COUNT(*) n FROM email_check_changes').get()).toEqual({n:1});
 expect(getDb().prepare('SELECT COUNT(*) n FROM companies').get()).toEqual({n:2});
});
it('abbreviations and hierarchy aid discovery without merging companies',()=>{
 const a=createCompany({name:'中国海洋石油'}),b=createCompany({name:'海洋能源服务'});
 expect(fuzzyOrganizationMatch('中海油',a.name)).toBe(true);
 getDb().prepare("INSERT INTO work_edges(source,target,relation,evidence,created_at) VALUES (?,?,'parent_of','[]','2099')").run(`company:${a.id}`,`company:${b.id}`);
 expect(workGraph('中海油').nodes.filter(n=>n.kind==='company')).toHaveLength(2);
 expect(findCanonicalCompany(b.name)?.id).toBe(b.id);
});
it('semantic search is cached, non-destructive and excludes sensitive queries',async()=>{
 const a=createCompany({name:'样例证券'});model.mockResolvedValue({matches:[{companyId:a.id,confidence:.98,reason:'英文简称'}]});
 await expandOrganizationSearch('Example Securities');await expandOrganizationSearch('Example Securities');
 expect(model).toHaveBeenCalledTimes(1);expect(workGraph('Example Securities').nodes.some(n=>n.title===a.name)).toBe(true);
 expect(getDb().prepare('SELECT COUNT(*) n FROM company_aliases').get()).toEqual({n:0});
 await expandOrganizationSearch('验证码123456');expect(model).toHaveBeenCalledTimes(1);
});
it('automatic bilingual identity requires both names in verified notice quotes',()=>{
 const a=createCompany({name:'样例证券'}),b=createCompany({name:'Example Securities'});
 const body='样例证券 Example Securities 校园招聘通知';
 const id=Number(getDb().prepare("INSERT INTO email_items(message_id,subject,snippet,received_at,status,created_at) VALUES ('bilingual','校园招聘',?,'2099-01-01','pending','2099-01-01')").run(body).lastInsertRowid);
 const action={type:'identify-company' as const,aliasId:b.id,canonicalId:a.id,reason:'原文中英文同一主体',confidence:.99,evidence:[{noticeId:id,quote:body}]};
 expect(applyWorkPlan({reply:'关联',actions:[action]},'自动整理',workFingerprint()).status).toBe('applied');
 expect(findCanonicalCompany(b.name)?.id).toBe(a.id);
});
it('graph layout reduces crossings and uses card edges rather than centers',()=>{
 const nodes=[{id:'a',kind:'company'},{id:'b',kind:'company'},{id:'c',kind:'application'},{id:'d',kind:'application'}];
 const edges=[{source:'a',target:'d',relation:'offers'},{source:'b',target:'c',relation:'offers'}];
 const layout=layoutWorkGraph(nodes,edges);expect(layout.crossings).toBe(0);expect(layout.path(edges[0])).toMatch(/^M 250 /);
 expect(layout.positions.size).toBe(4);
});
it('custom organization nodes without alias metadata remain searchable',()=>{
 getDb().prepare("INSERT INTO work_nodes(id,kind,title,state,data,updated_at) VALUES ('work:org','company','自定义组织','active','{}','2099')").run();
 expect(workGraph('自定').nodes.some(n=>n.id==='work:org')).toBe(true);
 expect(workGraph('不匹配').nodes).toEqual([]);
});
