import {beforeEach,describe,it,expect,vi} from 'vitest';
import {closeDb,getDb} from '../db/connection.js';
import {importSms} from './sms.service.js';
import {applyEmailItem} from './email/email.service.js';
import {listSchedules} from './email/schedules.service.js';
import type {EmailExtraction} from '../domain/types.js';
import express from 'express';
import type {AddressInfo} from 'node:net';
import {smsGateway} from '../routes/sms.js';
import {errorHandler} from '../middleware/error.js';
const model=vi.hoisted(()=>vi.fn());
vi.mock('./llm/llm.client.js',()=>({extractWithLlm:model}));
vi.mock('./settings.service.js',async original=>({...await original<typeof import('./settings.service.js')>(),getLlmConfig:()=>({apiKey:'test'})}));
const time='2099-10-25T14:00:00',end='2099-10-25T16:00:00';
const quote='2099年10月25日14:00-16:00';
const base:EmailExtraction={company:'示例科技',positionTitle:'工程师',eventType:'written_test',eventTime:time,eventTimeEnd:end,timeEvidence:quote,timeSource:'body',confidence:.95,summary:'招聘笔试',schedule:{action:'create',timeKind:'start'}};
let n=0;
function seed(e:EmailExtraction=base){const db=getDb();const id=Number(db.prepare("INSERT INTO email_items(message_id,subject,sender,snippet,received_at,extracted,status,created_at) VALUES (?,'招聘笔试','hr@example.test',?,'2099-10-01T08:00:00Z',?,'pending','2099-10-01')").run(`mail-${++n}`,quote,JSON.stringify(e)).lastInsertRowid);return applyEmailItem(id,undefined,{createIfMissing:true});}
async function sms(extra:Partial<EmailExtraction>={},body=`招聘笔试 ${quote}`,receivedAt='2099-10-02T08:00:00Z'){
 model.mockResolvedValue({...base,positionTitle:null,...extra});return importSms({body,sender:'106000',receivedAt});
}
beforeEach(()=>{closeDb();getDb();model.mockReset();});
describe('短信到邮件日程的完整接收分析关联流程',()=>{
 it('真实HTTP网关接收后自动关联邮件，重试保持同一通知和日程',async()=>{
  seed();model.mockResolvedValue({...base,positionTitle:null});
  const token='t'.repeat(40),server=express().use(smsGateway(token)).use(errorHandler).listen(0,'127.0.0.1');
  await new Promise<void>(r=>server.once('listening',r));
  try{
   const url=`http://127.0.0.1:${(server.address() as AddressInfo).port}/ingest`;
   const options={method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({content:`招聘笔试 ${quote}`,from:'106001',receivedAt:'2099-10-02T08:00:00Z'})};
   const first=await fetch(url,options);expect(first.status).toBe(200);expect(await first.json()).toMatchObject({status:'confirmed',duplicate:false});
   expect(await (await fetch(url,options)).json()).toMatchObject({status:'confirmed',duplicate:true});
   expect(listSchedules()).toHaveLength(1);expect(listSchedules()[0].sources).toHaveLength(2);
  }finally{await new Promise<void>(r=>server.close(()=>r()));}
 });
 it('无岗位短信按完整场次补充考场，保留完成状态、准备事项及提醒ID，重发不重复',async()=>{
  seed({...base,preparationTasks:[{title:'准备材料',scheduledAt:'2099-10-24T10:00:00',timeEvidence:'2099年10月24日10:00'}]});
  const db=getDb();db.prepare('UPDATE reminders SET done=1 WHERE scheduled_at=?').run(time);
  const done=db.prepare('SELECT * FROM reminders WHERE done=1').all();
  const body=`招聘笔试 ${quote}，考场东楼A101，提前20分钟登录`;
  const result=await sms({schedule:{action:'create',timeKind:'start',room:'东楼A101',evidence:body}},body);
  expect(result.status).toBe('confirmed');expect(listSchedules()).toHaveLength(1);
  expect(listSchedules()[0].data.room).toBe('东楼A101');expect(listSchedules()[0].data.preparationTasks).toHaveLength(2);
  expect(db.prepare('SELECT * FROM reminders WHERE done=1').all()).toEqual(done);
  const reminders=db.prepare('SELECT * FROM reminders ORDER BY id').all();
  expect((await sms({},body)).duplicate).toBe(true);
  expect(db.prepare('SELECT * FROM reminders ORDER BY id').all()).toEqual(reminders);
  expect((await sms({},`再次提醒 招聘笔试 ${quote}`)).status).toBe('confirmed');
  expect(db.prepare('SELECT * FROM reminders ORDER BY id').all()).toEqual(reminders);
  expect(listSchedules()[0].sources).toHaveLength(3);
 });
 it('同公司两个岗位同场时间不猜测，原因持久化且不创建第三申请',async()=>{
  seed();seed({...base,positionTitle:'产品经理'});
  const result=await sms();expect(result.status).toBe('pending');
  const row=getDb().prepare('SELECT extracted FROM email_items WHERE id=?').get(result.id) as {extracted:string};
  expect(JSON.parse(row.extracted).reviewReasons.join()).toContain('多个');expect(listSchedules()).toHaveLength(2);
  expect(getDb().prepare('SELECT COUNT(*) n FROM applications').get()).toEqual({n:2});
 });
 it('地点冲突保留原安排，不静默覆盖',async()=>{
  seed({...base,schedule:{action:'create',room:'A101'}});
  const body=`招聘笔试 ${quote} 考场B202`;
  expect((await sms({schedule:{action:'create',room:'B202',evidence:body}},body)).status).toBe('pending');
  expect(listSchedules()[0].data.room).toBe('A101');
 });
 it('只有开始时间且没有岗位或活动编号时仍需确认',async()=>{
  seed();expect((await sms({eventTimeEnd:null,timeEvidence:'2099年10月25日14:00'},'招聘笔试2099年10月25日14:00')).status).toBe('pending');expect(listSchedules()).toHaveLength(1);
 });
 it('活动编号关联无时间地点补充、改期和取消，已完成记录保留',async()=>{
  seed({...base,schedule:{action:'create',eventRef:'EV100'}});
  getDb().prepare('UPDATE reminders SET done=1 WHERE scheduled_at=?').run(time);
  const done=getDb().prepare('SELECT * FROM reminders WHERE done=1').all();
  const location='招聘笔试 EV100 考场东楼A101';
  expect((await sms({eventTime:null,eventTimeEnd:null,timeEvidence:null,schedule:{action:'update',eventRef:'EV100',room:'东楼A101',evidence:location}},location)).status).toBe('confirmed');
  const moved='招聘笔试 EV100 改期至2099年10月26日14:00-16:00';
  expect((await sms({eventTime:'2099-10-26T14:00:00',eventTimeEnd:'2099-10-26T16:00:00',timeEvidence:'2099年10月26日14:00-16:00',schedule:{action:'reschedule',eventRef:'EV100',previousTime:time,evidence:moved}},moved,'2099-10-03T08:00:00Z')).status).toBe('confirmed');
  expect(listSchedules()[0].data.eventTime).toBe('2099-10-26T14:00:00');
  const cancel='招聘笔试 EV100 已取消';
  expect((await sms({eventTime:null,eventTimeEnd:null,timeEvidence:null,schedule:{action:'cancel',eventRef:'EV100',evidence:cancel}},cancel,'2099-10-04T08:00:00Z')).status).toBe('confirmed');
  expect(listSchedules()[0].status).toBe('cancelled');expect(getDb().prepare('SELECT * FROM reminders').all()).toEqual(done);
 });
 it('旧短信仅补充来源，不回退新地点',async()=>{
  seed({...base,schedule:{action:'create',eventRef:'EV100',room:'新考场'}});
  const body='招聘笔试 EV100 考场旧考场';
  expect((await sms({eventTime:null,eventTimeEnd:null,timeEvidence:null,schedule:{action:'update',eventRef:'EV100',room:'旧考场',evidence:body}},body,'2099-09-30T08:00:00Z')).status).toBe('confirmed');
  expect(listSchedules()[0].data.room).toBe('新考场');
 });
});
