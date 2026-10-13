import { beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../../db/connection.js';
import { applyEmailBatch, applyEmailItem } from './email.service.js';
import { listSchedules, updateScheduleManually } from './schedules.service.js';
import { attachEvidence } from './evidence.js';
import type { EmailExtraction } from '../../domain/types.js';

const base: EmailExtraction = {company:'星河科技',positionTitle:'工程师',recruitmentId:'J-100',eventType:'interview',eventTime:'2099-10-18T15:00:00',timeSource:'body',timeEvidence:'2099年10月18日15:00',summary:'面试邀请',confidence:0.95,schedule:{action:'create',eventRef:'EV-100',round:'第一轮',mode:'offline',venue:'东区中心',evidence:'活动编号 EV-100 第一轮 东区中心'}};
let sequence = 0;
function seed(e: EmailExtraction, received='2099-10-01T08:00:00Z') {
  return Number(getDb().prepare("INSERT INTO email_items(message_id,subject,received_at,extracted,status,created_at) VALUES (?,'招聘通知',?,?,'pending',?)").run(`schedule-${++sequence}`,received,JSON.stringify(e),received).lastInsertRowid);
}
function apply(e: EmailExtraction, received?: string) {return applyEmailItem(seed(e,received),undefined,{createIfMissing:true,markApplied:true});}
function update(action: 'update'|'reschedule'|'cancel'|'restore', fields: Partial<EmailExtraction> = {}): EmailExtraction {return {...base,eventTime:null,timeEvidence:null,schedule:{action,eventRef:'EV-100',evidence:'活动编号 EV-100'},...fields};}
function reminders() {return getDb().prepare('SELECT * FROM reminders ORDER BY scheduled_at').all() as {id:number;schedule_id:number|null;scheduled_at:string;title:string;done:number}[];}
beforeEach(()=>{closeDb(); getDb();});

describe('通用招聘日程：跨邮件关联与提醒生命周期',()=>{
  it('人工调整可清除误提取地点，留下来源并受版本保护',()=>{
    apply(base,'2020-10-01T08:00:00Z');const s=listSchedules()[0];
    const changed=updateScheduleManually(s.id,s.revision,{action:'update',venue:null,address:'人工确认的新地址'},base.eventTime,null);
    expect(changed.data.venue).toBeNull();expect(changed.data.address).toBe('人工确认的新地址');
    expect(changed.sources[0]).toMatchObject({emailId:null,action:'manual:update'});
    expect(()=>updateScheduleManually(s.id,s.revision,{action:'cancel'})).toThrow('刷新');
    updateScheduleManually(s.id,changed.revision,{action:'cancel'});expect(reminders()).toHaveLength(0);
  });
  it('无活动编号但轮次在同一申请中唯一时，可关联地点补充',()=>{
    apply({...base,schedule:{action:'create',round:'技术一面'}});
    apply(update('update',{schedule:{action:'update',round:'技术一面',venue:'西区中心'}}),'2099-10-02T08:00:00Z');
    expect(listSchedules()).toHaveLength(1);expect(listSchedules()[0].data.venue).toBe('西区中心');
  });
  it('附件补充地址和考场与原通知关联，不创建新场次',()=>{
    apply(base);
    const quote='活动编号 EV-100，地址：星海路88号，考场：B302';
    const raw={messageId:'attachment',subject:'面试考场补充',sender:'招聘',receivedAt:'2099-10-02T08:00:00Z',snippet:'考场见附件',content:{body:'考场见附件',attachmentText:quote,attachments:[{name:'考场安排.pdf',status:'parsed' as const,detail:'已读取'}],warnings:[]}};
    const e=attachEvidence(update('update',{positionTitle:null,recruitmentId:null,schedule:{action:'update',eventRef:'EV-100',address:'星海路88号',room:'B302',evidence:quote}}),raw);
    expect(e.reviewReasons).toEqual([]);expect(e.timeSource).toBe('attachment');
    const id=seed(e,raw.receivedAt); expect(applyEmailBatch(0.8,{createIfMissing:true,markApplied:true}).applied).toBe(1);
    const [s]=listSchedules();expect(listSchedules()).toHaveLength(1);expect(s.data).toMatchObject({eventTime:base.eventTime,venue:'东区中心',address:'星海路88号',room:'B302'});
    expect(s.sources).toHaveLength(2);expect(JSON.stringify(s.sources)).toContain('考场安排.pdf');expect(reminders().every(r=>r.title.includes('B302'))).toBe(true);
    expect(()=>applyEmailItem(id)).toThrow('已处理');
  });
  it('改期替换本场自动提醒，保留手工提醒、已完成提醒和另一轮活动',()=>{
    const first=apply(base);const id=listSchedules()[0].id;
    const done=reminders()[0];getDb().prepare('UPDATE reminders SET done=1 WHERE id=?').run(done.id);
    getDb().prepare("INSERT INTO reminders(application_id,type,title,scheduled_at,done,created_at) VALUES (?,'other','用户自定',?,0,?)").run(first.item.applicationId,base.eventTime,'2099-10-01T08:00:00');
    apply({...base,eventTime:'2099-10-20T10:00:00',schedule:{action:'create',eventRef:'EV-200',round:'第二轮'}},'2099-10-02T08:00:00Z');
    apply(update('reschedule',{eventTime:'2099-10-19T16:00:00',schedule:{action:'reschedule',eventRef:'EV-100',previousTime:base.eventTime,room:'C401'}}),'2099-10-03T08:00:00Z');
    expect(reminders().filter(r=>r.schedule_id===id && !r.done).map(r=>r.scheduled_at)).toEqual(['2099-10-18T16:00:00','2099-10-19T16:00:00']);
    expect(reminders().find(r=>r.id===done.id)?.done).toBe(1);expect(reminders().some(r=>r.title==='用户自定')).toBe(true);
    expect(listSchedules().find(s=>s.id!==id)?.data.eventTime).toBe('2099-10-20T10:00:00');
  });
  it('取消撤销提醒但不拒绝申请，普通补充不能恢复，明确恢复可重建',()=>{
    const first=apply(base);apply(update('cancel'),'2099-10-03T08:00:00Z');
    expect(reminders()).toHaveLength(0);expect(listSchedules()[0].status).toBe('cancelled');
    expect(getDb().prepare('SELECT status FROM applications WHERE id=?').get(first.item.applicationId)).toEqual({status:'INTERVIEW_1'});
    expect(()=>apply(update('update'),'2099-10-04T08:00:00Z')).toThrow('已取消');
    apply(update('restore',{eventTime:'2099-10-21T09:00:00'}),'2099-10-05T08:00:00Z');
    expect(listSchedules()[0].status).toBe('scheduled');expect(reminders()).toHaveLength(2);
  });
  it('延期但新时间待定撤销旧提醒，随后补充时间可恢复安排',()=>{
    apply(base);apply(update('reschedule'),'2099-10-03T08:00:00Z');
    expect(listSchedules()[0].status).toBe('awaiting_time');expect(reminders()).toHaveLength(0);
    apply(update('update',{eventTime:'2099-10-25T13:00:00'}),'2099-10-04T08:00:00Z');
    expect(listSchedules()[0].data.eventTime).toBe('2099-10-25T13:00:00');expect(reminders()).toHaveLength(2);
  });
  it('旧邮件晚到只留档，不撤销新场次或回退地址',()=>{
    apply(base);apply(update('reschedule',{eventTime:'2099-10-22T15:00:00'}),'2099-10-05T08:00:00Z');
    apply(update('cancel'),'2099-10-03T08:00:00Z');
    expect(listSchedules()[0].status).toBe('scheduled');expect(listSchedules()[0].data.eventTime).toBe('2099-10-22T15:00:00');expect(listSchedules()[0].sources[0]).toMatchObject({action:'stale'});expect(reminders()).toHaveLength(2);
  });
  it('缺乏活动标识不能按唯一场次猜测，失败完整回滚',()=>{
    apply(base);const e=update('cancel',{schedule:{action:'cancel'}});const mail=seed(e,'2099-10-04T08:00:00Z');
    expect(()=>applyEmailItem(mail,undefined,{createIfMissing:true})).toThrow('原日程');
    expect(getDb().prepare('SELECT status FROM email_items WHERE id=?').get(mail)).toEqual({status:'pending'});expect(reminders()).toHaveLength(2);
    applyEmailItem(mail,undefined,{targetScheduleId:listSchedules()[0].id,expectedScheduleRevision:1});expect(reminders()).toHaveLength(0);
  });
  it('版本过期、旧时间冲突和不同活动编号不能覆盖',()=>{
    apply(base);const target=listSchedules()[0];apply(update('update'),'2099-10-02T08:00:00Z');
    expect(()=>applyEmailItem(seed(update('cancel'),'2099-10-03T08:00:00Z'),undefined,{targetScheduleId:target.id,expectedScheduleRevision:target.revision})).toThrow('刷新');
    expect(()=>apply(update('reschedule',{eventTime:'2099-10-22T15:00:00',schedule:{action:'reschedule',eventRef:'EV-100',previousTime:'2099-10-17T15:00:00'}}),'2099-10-04T08:00:00Z')).toThrow('原时间');
    expect(()=>applyEmailItem(seed(update('cancel',{schedule:{action:'cancel',eventRef:'EV-WRONG'}})),undefined,{targetScheduleId:target.id})).toThrow('活动编号');
  });
  it('线上改期清除旧线下地点；跨公司指定日程被拒绝',()=>{
    apply(base);const s=listSchedules()[0];
    apply(update('reschedule',{eventTime:'2099-10-22T15:00:00',schedule:{action:'reschedule',eventRef:'EV-100',mode:'online'}}),'2099-10-02T08:00:00Z');
    expect(listSchedules()[0].data.venue).toBeNull();
    expect(()=>applyEmailItem(seed({...update('cancel'),company:'另一雇主'}),undefined,{createIfMissing:true,targetScheduleId:s.id})).toThrow('不属于此公司');
  });
  it('无活动编号时可用原活动时间关联改期，同申请不同时间保留独立场次',()=>{
    apply({...base,schedule:{action:'create'}});
    apply({...base,eventTime:'2099-10-24T15:00:00',schedule:{action:'create'}},'2099-10-02T08:00:00Z');
    apply(update('reschedule',{eventTime:'2099-10-23T16:00:00',schedule:{action:'reschedule',previousTime:base.eventTime}}),'2099-10-03T08:00:00Z');
    expect(listSchedules().map(s=>s.data.eventTime).sort()).toEqual(['2099-10-23T16:00:00','2099-10-24T15:00:00']);
  });
});
