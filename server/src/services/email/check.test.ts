import {beforeEach,describe,it,expect} from 'vitest';
import {getDb,closeDb} from '../../db/connection.js';
import {applyEmailItem} from './email.service.js';
import {checkExistingEmails,getEmailCheckState,resolveEmailCheck} from './check.service.js';
import type {EmailExtraction} from '../../domain/types.js';
let counter=0;
const base:EmailExtraction={company:'通用测试雇主',positionTitle:'工程师',recruitmentId:'JOB-1',eventType:'interview',eventTime:'2099-10-18T09:00:00',eventTimeEnd:null,timeSource:'body',timeEvidence:'2099-10-18 09:00',confidence:0.95,summary:'邀请',schedule:{action:'create',eventRef:'EVENT-1',mode:'online'}};
function seed(e:EmailExtraction=base){return Number(getDb().prepare("INSERT INTO email_items(message_id,subject,sender,received_at,snippet,extracted,status,created_at) VALUES (?,'面试邀请','HR','2026-10-01T08:00:00Z','面试时间：2099-10-18 09:00',?,'pending','2026-10-01')").run(`check-${++counter}`,JSON.stringify(e)).lastInsertRowid);}
function apply(e=base){const id=seed(e);return {id,...applyEmailItem(id,undefined,{createIfMissing:true})};}
function findings(){return getEmailCheckState().findings.filter(f=>f.status==='open');}
beforeEach(()=>{closeDb();getDb();});
describe('已有邮件检查及修复记录',()=>{
 it('自动归档状态说明并记录，忽略过的活动不反复要求复核',()=>{
   const id=seed({...base,eventType:'other'});getDb().prepare('UPDATE email_items SET subject=?,snippet=? WHERE id=?').run('查看申请','如果您已完成申请，可查看状态。如果您仍在处理申请，可继续。',id);
   const dismissed=seed();getDb().prepare("UPDATE email_items SET status='dismissed',snippet='' WHERE id=?").run(dismissed);
   expect(checkExistingEmails().review).toBe(0);expect(getDb().prepare('SELECT status FROM email_items WHERE id=?').get(id)).toEqual({status:'dismissed'});
   expect(getEmailCheckState().changes).toHaveLength(1);expect(checkExistingEmails().repaired).toBe(0);
 });
 it('并排证据包含原文、地点和编号依据，确认快照脱敏且不随邮件改变',()=>{
   apply();const id=seed({...base,positionTitle:'工程师（项目名）',schedule:{...base.schedule,action:'create',venue:'第一考点',room:'302'}});
   applyEmailItem(id,undefined,{createIfMissing:true,targetApplicationId:null,targetScheduleId:null});
   getDb().prepare('UPDATE email_items SET snippet=? WHERE id=?').run('原文：第一考点302。https://example.com/once?token=secret 验证码：123456',id);
   checkExistingEmails();const f=findings().find(f=>f.kind==='duplicate-app')!;
   expect(f.comparison?.columns).toHaveLength(2);
   expect(JSON.stringify(f.comparison)).toContain('第一考点');
   expect(JSON.stringify(f.comparison)).toContain('职位编号相同');
   expect(JSON.stringify(f.comparison)).not.toContain('token=secret');
   expect(JSON.stringify(f.comparison)).not.toContain('123456');
   resolveEmailCheck(f.key,f.fingerprint,'ignore');
   const change=getEmailCheckState().changes[0] as {before_state:string};
   expect(JSON.parse(change.before_state).comparison).toEqual(f.comparison);
   getDb().prepare("UPDATE email_items SET snippet='修改后的正文' WHERE id=?").run(id);
   expect((getEmailCheckState().changes[0] as {before_state:string}).before_state).toBe(change.before_state);
 });
 it('拆分展示当前邮件及其他岗位邮件，其他邮件变化会阻止过期确认',()=>{
   const a=apply();const id=seed({...base,recruitmentId:'JOB-2',positionTitle:'另一岗位'});
   getDb().prepare("UPDATE email_items SET application_id=?,status='confirmed' WHERE id=?").run(a.item.applicationId,id);
   checkExistingEmails();const f=findings().find(f=>f.plan.mailId===id && f.kind==='mixed-jobs')!;
   expect(f.comparison?.columns).toHaveLength(2);
   expect(JSON.stringify(f.comparison)).toContain('JOB-1');expect(JSON.stringify(f.comparison)).toContain('JOB-2');
   getDb().prepare("UPDATE email_items SET snippet='新的岗位依据' WHERE id=?").run(a.id);
   expect(()=>resolveEmailCheck(f.key,f.fingerprint,'confirm')).toThrow('已变化');
 });
 it('缺失提醒自动补齐，重复检查不改ID、不重复修复、不打开已完成项',()=>{
   const first=apply();const db=getDb();
   db.prepare('UPDATE reminders SET done=1,done_at=? WHERE scheduled_at=?').run('2026-10-16T12:00:00',base.eventTime);
   db.prepare('DELETE FROM reminders WHERE done=0').run();
   db.prepare("INSERT INTO reminders(application_id,type,title,scheduled_at,done,created_at) VALUES (?,'other','手工事项','2099-10-17T09:00:00',0,'2026-10-01')").run(first.item.applicationId);
   expect(checkExistingEmails().repaired).toBe(1);
   const before=db.prepare('SELECT * FROM reminders ORDER BY id').all();expect(before).toHaveLength(3);
   expect(checkExistingEmails('incremental').repaired).toBe(0);expect(db.prepare('SELECT * FROM reminders ORDER BY id').all()).toEqual(before);
   expect(getEmailCheckState().changes).toHaveLength(1);
 });
 it('同场重复待办去重、已完成与逾期待办不丢失',()=>{
   apply();const db=getDb();const schedule=(db.prepare('SELECT id FROM recruitment_schedules').get() as {id:number}).id;
   db.prepare("INSERT INTO reminders(application_id,type,title,scheduled_at,done,created_at,schedule_id) SELECT application_id,type,title,scheduled_at,done,created_at,schedule_id FROM reminders WHERE schedule_id=?").run(schedule);
   db.prepare("INSERT INTO reminders(application_id,type,title,scheduled_at,done,created_at,schedule_id) VALUES (1,'other','逾期事项','2020-01-01T09:00:00',0,'2020-01-01',?)").run(schedule);
   checkExistingEmails();expect(db.prepare('SELECT COUNT(*) n FROM reminders').get()).toEqual({n:3});
   expect(db.prepare("SELECT done FROM reminders WHERE title='逾期事项'").get()).toEqual({done:0});
 });
 it('缺少时间证据的旧邮件只提示，不自动猜日程',()=>{
   const id=seed({...base,timeSource:'unknown',timeEvidence:null});getDb().prepare("UPDATE email_items SET status='confirmed',snippet='' WHERE id=?").run(id);
   checkExistingEmails();expect(findings().some(f=>f.kind==='missing-body')).toBe(true);expect(getDb().prepare('SELECT COUNT(*) n FROM recruitment_schedules').get()).toEqual({n:0});
 });
 it('旧版确认邮件可接入，重复检查不重复建日程',()=>{
   apply();const db=getDb();db.prepare('DELETE FROM schedule_sources').run();db.prepare('DELETE FROM recruitment_schedules').run();
   expect(checkExistingEmails().repaired).toBeGreaterThan(0);checkExistingEmails();expect(db.prepare('SELECT COUNT(*) n FROM recruitment_schedules').get()).toEqual({n:1});
 });
 it('重复申请需确认，状态变化会拒绝旧确认，合并保留完成状态和日志',()=>{
   const a=apply();const id=seed({...base,positionTitle:'工程师（简称）'});const b=applyEmailItem(id,undefined,{createIfMissing:true,targetApplicationId:null,targetScheduleId:null});
   const db=getDb();db.prepare('UPDATE reminders SET done=1,done_at=?').run('2026-10-16');
   checkExistingEmails();let f=findings().find(f=>f.kind==='duplicate-app')!;expect(f).toBeTruthy();
   db.prepare("UPDATE applications SET note='新增资料' WHERE id=?").run(a.item.applicationId);
   expect(()=>resolveEmailCheck(f.key,f.fingerprint,'confirm')).toThrow('变化');checkExistingEmails();f=findings().find(f=>f.kind==='duplicate-app')!;
   resolveEmailCheck(f.key,f.fingerprint,'confirm',a.item.applicationId!);
   expect(db.prepare('SELECT COUNT(*) n FROM applications').get()).toEqual({n:1});
   expect(db.prepare('SELECT application_id FROM email_items WHERE id=?').get(id)).toEqual({application_id:a.item.applicationId});
   expect(db.prepare('SELECT COUNT(*) n FROM reminders WHERE done=1').get()).toEqual({n:4});
   expect(getEmailCheckState().changes.some(c=>String((c as {action:string}).action).includes('用户确认'))).toBe(true);
   expect(b.item.applicationId).not.toBe(a.item.applicationId);
 });
 it('日程字段冲突不能合并；保持现状不会每次重复询问',()=>{
   apply();applyEmailItem(seed({...base,schedule:{...base.schedule!,round:'第二轮'}}),undefined,{createIfMissing:true,targetScheduleId:null});
   checkExistingEmails();const f=findings().find(f=>f.kind==='duplicate-schedule')!;
   // Missing round on one source is compatible; use a conflicting venue to invalidate the old decision.
   getDb().prepare("UPDATE recruitment_schedules SET status='cancelled' WHERE id=2").run();
   expect(()=>resolveEmailCheck(f.key,f.fingerprint,'confirm')).toThrow('变化');checkExistingEmails();const updated=findings().find(f=>f.kind==='duplicate-schedule')!;
   expect(updated.plan.action).toBe('review');expect(()=>resolveEmailCheck(updated.key,updated.fingerprint,'confirm')).toThrow('核对');
   resolveEmailCheck(updated.key,updated.fingerprint,'ignore');checkExistingEmails();expect(findings().some(f=>f.kind==='duplicate-schedule')).toBe(false);
 });
 it('不同职位编号的重复公司申请不建议合并',()=>{
   apply();apply({...base,recruitmentId:'JOB-2',schedule:{action:'create',eventRef:'EVENT-2'}});checkExistingEmails();expect(findings().some(f=>f.kind==='duplicate-app')).toBe(false);
 });
 it('确认合并相同日程后保留来源、完成提醒，并去掉重复待办',()=>{
   apply();applyEmailItem(seed(),undefined,{createIfMissing:true,targetScheduleId:null});const db=getDb();
   db.prepare('UPDATE reminders SET done=1,done_at=? WHERE schedule_id=2 AND scheduled_at=?').run('2026-10-16',base.eventTime);
   checkExistingEmails();const f=findings().find(f=>f.kind==='duplicate-schedule')!;resolveEmailCheck(f.key,f.fingerprint,'confirm');
   expect(db.prepare('SELECT COUNT(*) n FROM recruitment_schedules').get()).toEqual({n:1});expect(db.prepare('SELECT COUNT(*) n FROM schedule_sources').get()).toEqual({n:2});
   expect(db.prepare('SELECT COUNT(*) n FROM reminders WHERE done=1').get()).toEqual({n:1});expect(db.prepare('SELECT COUNT(*) n FROM reminders WHERE done=0').get()).toEqual({n:1});
 });
 it('原文窗口冲突时不自动补提醒，先要求确认',()=>{
   const a=apply();const db=getDb();db.prepare('DELETE FROM reminders').run();
   db.prepare("UPDATE email_items SET snippet='面试时间：2099-10-20 09:00 至 2099-10-21 09:00' WHERE id=?").run(a.id);
   checkExistingEmails();expect(db.prepare('SELECT COUNT(*) n FROM reminders').get()).toEqual({n:0});expect(findings().some(f=>f.kind==='time-conflict')).toBe(true);
 });
 it('同一时刻的两项独立准备任务不能合成一项',()=>{
   apply({...base,preparationTasks:[{title:'打印材料',scheduledAt:'2099-10-17T08:00:00',timeEvidence:'原文'},{title:'设备自检',scheduledAt:'2099-10-17T08:00:00',timeEvidence:'原文'}]});checkExistingEmails();
   expect(getDb().prepare("SELECT COUNT(*) n FROM reminders WHERE type='other'").get()).toEqual({n:2});
 });
 it('混合职位邮件需确认后独立拆分，原历史和邮件均保留',()=>{
   const a=apply({...base,eventType:'applied',schedule:undefined});const second=seed({...base,eventType:'applied',schedule:undefined,recruitmentId:'JOB-2'});
   applyEmailItem(second,undefined,{targetApplicationId:a.item.applicationId!});checkExistingEmails();const f=findings().find(f=>f.plan.mailId===second && f.kind==='mixed-jobs')!;
   resolveEmailCheck(f.key,f.fingerprint,'confirm');expect(getDb().prepare('SELECT COUNT(*) n FROM applications').get()).toEqual({n:2});
   expect((getDb().prepare('SELECT application_id FROM email_items WHERE id=?').get(second) as {application_id:number}).application_id).not.toBe(a.item.applicationId);
 });
});
