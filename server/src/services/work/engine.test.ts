import {beforeEach,it,expect,vi} from 'vitest';
import {getDb,closeDb} from '../../db/connection.js';
import {applyWorkPlan,workFingerprint,confirmWorkPlan,runWorkAnalysis} from './engine.js';
import {workGraph} from './graph.js';
import {workPlanSchema,type WorkAction} from './schema.js';
import {applyEmailItem} from '../email/email.service.js';
import {attachEvidence} from '../email/evidence.js';
import {createCompany} from '../companies.service.js';
import {aliasCompany} from './organizations.js';
const mock=vi.hoisted(()=>vi.fn());
vi.mock('../settings.service.js',()=>({getLlmConfig:()=>({apiKey:'synthetic'})}));
vi.mock('../llm/llm.client.js',async original=>({...await original<object>(),chatJson:mock}));
beforeEach(()=>{closeDb();getDb();mock.mockReset();});
it('跨语言通知关联同一活动，不重复提醒或重开完成记录',()=>{
 const a=notice('样例集团考试 2099年11月5日09:00 至11:00');
 applyEmailItem(a,undefined,{createIfMissing:true});
 const db=getDb(),app=db.prepare('SELECT id,company_id FROM applications').get() as {id:number;company_id:number};
 const english=createCompany({name:'Example Group'});aliasCompany(english.id,app.company_id,'已确认中英文同一主体');
 db.prepare('UPDATE reminders SET done=1').run();
 const before=db.prepare('SELECT id,done FROM reminders ORDER BY id').all();
 const b=notice('Example Group examination 2099-11-05 09:00–11:00','Example Group','Engineer');
 const extraction={relevant:true,company:'Example Group',positionTitle:'Engineer',eventType:'written_test' as const,eventTime:'2099-11-05T09:00:00',eventTimeEnd:'2099-11-05T11:00:00',timeSource:'body' as const,timeEvidence:'2099-11-05 09:00–11:00',confidence:.99,summary:'Exam invitation'};
 const row=db.prepare('SELECT id,revision FROM recruitment_schedules').get() as {id:number;revision:number};
 const result=apply([{type:'apply-notice',noticeId:b,applicationId:app.id,targetScheduleId:row.id,expectedScheduleRevision:row.revision,extraction,reason:'已知主体同一岗位及考试窗口',confidence:.99,evidence:[{noticeId:b,quote:'Example Group examination 2099-11-05 09:00–11:00'}]}]);
 expect(result.status).toBe('applied');expect(db.prepare('SELECT COUNT(*) n FROM recruitment_schedules').get()).toEqual({n:1});
 expect(db.prepare('SELECT COUNT(*) n FROM applications').get()).toEqual({n:1});
 expect(db.prepare('SELECT id,done FROM reminders ORDER BY id').all()).toEqual(before);
});
let count=0;
function notice(body='本次考试只需考一次，成绩全集团有效。',company='样例集团',position='软件岗'){
 const extracted={company,positionTitle:position,eventType:'written_test',eventTime:'2099-11-05T09:00:00',eventTimeEnd:'2099-11-05T11:00:00',timeSource:'body',timeEvidence:'2099年11月5日09:00',confidence:.95,summary:'统一笔试'};
 return Number(getDb().prepare("INSERT INTO email_items(message_id,subject,sender,snippet,received_at,extracted,status,created_at) VALUES (?,'招聘考试','样例集团',?,'2099-11-01',?,'pending','2099-11-01')").run(`work-${++count}`,body,JSON.stringify(extracted)).lastInsertRowid);
}
function item(id:number,more:Partial<WorkAction>={}){return {type:'item',key:'stage-1',title:'资格预审',kind:'milestone',state:'active',data:{customField:'支持扩展'},revision:0,evidence:[{noticeId:id,quote:'成绩全集团有效'}],reason:'进度里程碑',confidence:.96,...more} as WorkAction;}
function apply(actions:WorkAction[],id?:string){return applyWorkPlan({reply:'核对结果',actions},'自动整理',workFingerprint(),false,id);}
it('自定义类型阶段和属性可扩展，多对多关系不合并岗位',()=>{
 const n=notice();apply([item(n)]);
 const a=item(n,{type:'link',source:`notice:${n}`,target:'work:stage-1',relation:'supports'}) as WorkAction;
 expect(apply([a]).status).toBe('applied');expect(workGraph().edges).toContainEqual(expect.objectContaining({target:'work:stage-1'}));
 expect(getDb().prepare('SELECT COUNT(*) n FROM work_nodes').get()).toEqual({n:1});
});
it('请求重放不会重复写入，证据伪造与不存在端点不写入',()=>{
 const n=notice(),a=item(n),fp=workFingerprint(),id='replay';
 applyWorkPlan({reply:'ok',actions:[a]},'auto',fp,false,id);
 expect(applyWorkPlan({reply:'ok',actions:[a]},'auto',fp,false,id).status).toBe('applied');
 expect(apply([item(n,{key:'bad',evidence:[{noticeId:n,quote:'伪造原文'}]})]).status).toBe('pending');
 expect(getDb().prepare('SELECT COUNT(*) n FROM work_nodes').get()).toEqual({n:1});
});
it('有歧义先保留方案，确认要求版本未变化，完成状态不重开',()=>{
 const n=notice();const p=apply([item(n,{question:'这是同一里程碑吗？'})]);
 expect(getDb().prepare('SELECT COUNT(*) n FROM work_nodes').get()).toEqual({n:0});
 confirmWorkPlan(p.id);
 const done=apply([item(n,{revision:1,state:'done'})]);expect(done.status).toBe('pending');confirmWorkPlan(done.id);
 expect(apply([item(n,{revision:2,state:'active'})]).status).toBe('pending');
 expect(getDb().prepare('SELECT state FROM work_nodes').get()).toEqual({state:'done'});
 const stale=apply([item(n,{key:'other',question:'是否关联？'})]);notice('新的证据');expect(()=>confirmWorkPlan(stale.id)).toThrow('已变化');
});
it('多岗位共用考试仅共享提醒，保留完成记录与独立申请',()=>{
 const a=notice(),b=notice(undefined,'样例集团','数据岗');
 applyEmailItem(a,undefined,{createIfMissing:true});applyEmailItem(b,undefined,{createIfMissing:true});
 const schedules=getDb().prepare('SELECT id FROM recruitment_schedules ORDER BY id').all() as {id:number}[];
 getDb().prepare('UPDATE reminders SET done=1 WHERE schedule_id=?').run(schedules[0].id);
 const r=apply([{type:'share-reminders',source:`schedule:${schedules[0].id}`,target:`schedule:${schedules[1].id}`,reason:'跨岗位共用',confidence:.98,evidence:[{noticeId:a,quote:'本次考试只需考一次，成绩全集团有效。'},{noticeId:b,quote:'本次考试只需考一次，成绩全集团有效。'}]}]);
 expect(r.status).toBe('applied');expect(getDb().prepare('SELECT COUNT(*) n FROM applications').get()).toEqual({n:2});
 expect(getDb().prepare('SELECT COUNT(*) n FROM reminders WHERE done=0').get()).toEqual({n:0});
 expect(workGraph().edges.some(e=>e.relation==='shares_reminders')).toBe(true);
});
it('仅同时间的考试不能自动共用，来源不足保留待决',()=>{
 const a=notice('统一考试'),b=notice('统一考试','样例集团','数据岗');applyEmailItem(a,undefined,{createIfMissing:true});applyEmailItem(b,undefined,{createIfMissing:true});
 expect(apply([{type:'share-reminders',source:'schedule:1',target:'schedule:2',reason:'时间相同',confidence:.99,evidence:[{noticeId:a,quote:'统一考试'},{noticeId:b,quote:'统一考试'}]}]).status).toBe('pending');
 expect(getDb().prepare('SELECT COUNT(*) n FROM reminders WHERE done=0').get()).toEqual({n:4});
});
it('通过考试是进展，不要求新考试时间，也不新建考试提醒',()=>{
 const n=notice('样例集团通知：您通过了通用能力考试，后续另行通知。');
 const extraction={relevant:true,intent:'progress' as const,company:'样例集团',positionTitle:null,eventType:'other' as const,eventTime:null,summary:'通过考试',confidence:.96};
 expect(apply([{type:'apply-notice',noticeId:n,extraction,evidence:[{noticeId:n,quote:'您通过了通用能力考试'}],reason:'结果通知',confidence:.96}]).status).toBe('applied');
 expect(getDb().prepare('SELECT COUNT(*) n FROM recruitment_schedules').get()).toEqual({n:0});expect(getDb().prepare('SELECT COUNT(*) n FROM reminders').get()).toEqual({n:0});
});
it('资料填报自动建立截止待办，身份操作警告不阻断普通正文时间',()=>{
 const body='样例集团资料预审：请于2099年11月5日14点前完成信息填报，请使用短信验证码登录。',n=notice(body);
 const extraction={relevant:true,intent:'task' as const,company:'样例集团',positionTitle:null,eventType:'other' as const,eventTime:null,summary:'资料填报',confidence:.96,preparationTasks:[{title:'资料填报截止',scheduledAt:'2099-11-05T14:00:00',timeEvidence:'2099年11月5日14点前完成信息填报'}]};
 expect(apply([{type:'apply-notice',noticeId:n,extraction,evidence:[{noticeId:n,quote:'资料预审'}],reason:'明确截止',confidence:.96}]).status).toBe('applied');
 expect(getDb().prepare('SELECT COUNT(*) n FROM reminders').get()).toEqual({n:1});
 const e=attachEvidence({...extraction,eventType:'assessment',eventTime:'2099-11-05T14:00:00',timeEvidence:'2099年11月5日14点',preparationTasks:[]},{messageId:'1',subject:'测评',sender:'HR',receivedAt:'2099-11-01',snippet:body,content:{body,attachmentText:'',attachments:[],warnings:['邮件含身份验证或一次性操作信息：需本人完成']}});
 expect(e.reviewReasons).toEqual([]);
});
it('兼容API将普通任务截止写到eventTime，不要求用户修正字段',()=>{
 const n=notice('样例集团：请于2099年11月5日14点前完成信息填报。');
 const extraction={relevant:true,intent:'task' as const,company:'样例集团',positionTitle:null,eventType:'other' as const,eventTime:'2099-11-05T14:00:00',timeEvidence:'2099年11月5日14点前完成信息填报',summary:'资料填报截止',confidence:.96,schedule:{action:'create' as const,timeKind:'deadline' as const}};
 expect(apply([{type:'apply-notice',noticeId:n,extraction,evidence:[{noticeId:n,quote:'完成信息填报'}],reason:'明确截止',confidence:.96}]).status).toBe('applied');
 expect(getDb().prepare('SELECT scheduled_at FROM reminders').get()).toEqual({scheduled_at:'2099-11-05T14:00:00'});
});
it('AI调用接收跨通知上下文且不包含密钥或一次性链接',async()=>{
 const n=notice('成绩全集团有效 https://example.test/once?token=secret 验证码：123456');mock.mockResolvedValue({reply:'已核对建议',actions:[item(n)]});
 await runWorkAnalysis('检查这些事项',[n]);const payload=mock.mock.calls[0][1];expect(payload).not.toContain('token=secret');expect(payload).not.toContain('123456');expect(payload).toContain('graph');
});
it('模型引用本轮未检索通知不会自动执行',async()=>{
 const a=notice(),b=notice();mock.mockResolvedValue({reply:'建议',actions:[item(b)]});
 expect(await runWorkAnalysis('检查',[a])).toMatchObject({status:'pending'});expect(getDb().prepare('SELECT COUNT(*) n FROM work_nodes').get()).toEqual({n:0});
});
it('未知动作、无证据、超量输出由契约拒绝',()=>{
 expect(()=>workPlanSchema.parse({reply:'x',actions:[{type:'open-url'}]})).toThrow();
 expect(()=>workPlanSchema.parse({reply:'x',actions:[item(1,{evidence:[]})]})).toThrow();
});
it('简短对话直接完成活动，保留状态的请求不会误完成',async()=>{
 const n=notice();applyEmailItem(n,undefined,{createIfMissing:true});
 const action={type:'complete-activity',scheduleId:1,revision:1,userQuote:'这个考完了',reason:'用户明确完成',confidence:.99,evidence:[]};
 mock.mockResolvedValue({reply:'完成该活动',actions:[action]});
 expect(await runWorkAnalysis('这个考完了',[n])).toMatchObject({status:'applied'});
 expect(getDb().prepare('SELECT COUNT(*) n FROM reminders WHERE done=0').get()).toEqual({n:0});
 const r=applyWorkPlan(workPlanSchema.parse({reply:'保留',actions:[{...action,userQuote:'不要改已完成的'}]}),'不要改已完成的',workFingerprint());expect(r.status).toBe('pending');
});
it('一封通知的面试与测评分别建日程，不把它们合为同一阶段',()=>{
 const body='样例集团邀请参加AI面试及线上测评，截止2099年11月5日14点，两项均须完成。',n=notice(body);
 const extraction={relevant:true,company:'样例集团',positionTitle:'软件岗',eventType:'interview' as const,eventTime:'2099-11-05T14:00:00',timeEvidence:'2099年11月5日14点',summary:'面试和测评',confidence:.98,schedule:{action:'create' as const,timeKind:'deadline' as const}};
 const a:WorkAction={type:'apply-notice',noticeId:n,extraction,reason:'独立活动',confidence:.98,evidence:[{noticeId:n,quote:'AI面试及线上测评'}]};
 expect(apply([a,{...a,extraction:{...extraction,eventType:'assessment'}}]).status).toBe('applied');
 expect(getDb().prepare('SELECT COUNT(*) n FROM recruitment_schedules').get()).toEqual({n:2});expect(getDb().prepare('SELECT COUNT(*) n FROM applications').get()).toEqual({n:1});
});
it('AI可以补齐活动提醒，已完成记录保持原样且需要对应来源',()=>{
 const n=notice();applyEmailItem(n,undefined,{createIfMissing:true});const db=getDb();
 const schedule=db.prepare('SELECT id,revision FROM recruitment_schedules').get() as {id:number;revision:number};
 const first=db.prepare('SELECT id FROM reminders ORDER BY id LIMIT 1').get() as {id:number};db.prepare('UPDATE reminders SET done=1 WHERE id=?').run(first.id);db.prepare('DELETE FROM reminders WHERE done=0').run();
 const action:WorkAction={type:'repair-reminders',scheduleId:schedule.id,revision:schedule.revision,reason:'补齐遗漏提醒',confidence:.99,evidence:[{noticeId:n,quote:'成绩全集团有效'}]};
 expect(apply([action]).status).toBe('applied');expect(db.prepare('SELECT done FROM reminders WHERE id=?').get(first.id)).toEqual({done:1});
 const other=notice('其他考试成绩全集团有效');expect(apply([{...action,evidence:[{noticeId:other,quote:'成绩全集团有效'}]}]).status).toBe('pending');
});
it('模型可请求按关键词检索本地旧通知后再执行',async()=>{
 const n=notice('历史预约通知：成绩全集团有效'),recent=notice('新的通知');
 mock.mockResolvedValueOnce({reply:'先查旧通知',requestedQueries:['历史预约通知'],actions:[]}).mockResolvedValueOnce({reply:'关联进度',actions:[item(n)]});
 expect(await runWorkAnalysis('自动整理',[recent])).toMatchObject({status:'applied'});
 expect(mock.mock.calls[1][1]).toContain('历史预约通知');
});
it('执行成功但模型省略学习字段时，独立归纳经验而不重复执行动作',async()=>{
 const n=notice('样例集团：请于2099年11月5日14点前完成信息填报。');
 const extraction={relevant:true,intent:'task',company:'样例集团',positionTitle:'软件岗',eventType:'other',eventTime:null,summary:'填报',confidence:.98,preparationTasks:[{title:'填报截止',scheduledAt:'2099-11-05T14:00:00',timeEvidence:'2099年11月5日14点前完成信息填报'}]};
 mock.mockResolvedValueOnce({reply:'补齐待办',actions:[{type:'apply-notice',noticeId:n,extraction,reason:'明确任务截止',confidence:.98,evidence:[{noticeId:n,quote:'完成信息填报'}]}]}).mockResolvedValueOnce({learning:[{key:'dated-task',revision:0,title:'有截止的填报任务',signals:['填报截止'],approach:'记录独立截止待办，不创建考试，核对原文时间。'}]});
 expect(await runWorkAnalysis('整理',[n])).toMatchObject({status:'applied'});
 expect(getDb().prepare('SELECT COUNT(*) n FROM reminders').get()).toEqual({n:1});
 expect(getDb().prepare('SELECT key,successes FROM work_strategies').get()).toEqual({key:'dated-task',successes:1});expect(mock).toHaveBeenCalledTimes(2);
});
