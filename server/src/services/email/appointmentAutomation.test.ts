import {listReminders} from '../reminders.service.js';
import {beforeEach,expect,it} from 'vitest';
import {closeDb,getDb} from '../../db/connection.js';
import {attachEvidence} from './evidence.js';
import {applyEmailItem} from './email.service.js';
import {listSchedules} from './schedules.service.js';
import type {EmailExtraction} from '../../domain/types.js';
import {createCompany} from '../companies.service.js';
import {createApplication} from '../applications.service.js';
const raw={messageId:'booking',subject:'线下面试通知',sender:'HR',receivedAt:'2099-11-05T08:00:00Z',snippet:'面试日期2099年11月9日-11月23日，具体面试时间以您预约的时间为准。地点：测试大楼。预约截止时间：北京时间11月7日24:00。您的面试岗位：服务岗。'};
const base:EmailExtraction={company:'测试机构',positionTitle:'服务岗',eventType:'interview',eventTime:null,summary:'面试邀请',confidence:.95,timeEvidence:'面试日期2099年11月9日-11月23日，具体面试时间以您预约的时间为准',schedule:{action:'create',mode:'offline',venue:'测试大楼',evidence:raw.snippet},preparationTasks:[{title:'预约截止',scheduledAt:'2099-11-08T00:00:00',timeEvidence:'预约截止时间：北京时间11月7日24:00'}]};
function seed(e:EmailExtraction,body=raw.snippet,received=raw.receivedAt){return Number(getDb().prepare("INSERT INTO email_items(message_id,subject,sender,snippet,received_at,extracted,status,created_at) VALUES (?,'通知','HR',?,?,?,'pending',?)").run(Math.random().toString(),body,received,JSON.stringify(e),received).lastInsertRowid);}
beforeEach(()=>{closeDb();getDb();});
it('预约邀请自动入库；只提醒预约截止；正式场次补全原日程并保留完成记录',()=>{
 const e=attachEvidence({...base,eventTime:'2099-11-09T00:00:00',eventTimeEnd:'2099-11-23T23:59:00'},raw);
 expect(e.reviewReasons).toEqual([]);expect(e.eventTime).toBeNull();expect(e.schedule?.timeKind).toBe('start');
 const applied=applyEmailItem(seed(e),undefined,{createIfMissing:true,markApplied:true});const app=applied.item.applicationId!;
 const schedule=listSchedules(app)[0];expect(schedule.status).toBe('awaiting_time');expect(schedule.data.dateEnd).toBe('2099-11-23');
 expect(getDb().prepare('SELECT scheduled_at,type FROM reminders').all()).toEqual([{scheduled_at:'2099-11-08T00:00:00',type:'other'}]);
 expect(listReminders()[0].activity).toMatchObject({status:'scheduled',timeKind:'deadline',eventTime:'2099-11-08T00:00:00',eventTimeEnd:null});
 getDb().prepare('UPDATE reminders SET done=1').run();
 applyEmailItem(seed(e,raw.snippet,'2099-11-06T08:00:00Z'),undefined,{createIfMissing:true});
 expect(listSchedules(app)).toHaveLength(1);expect(getDb().prepare('SELECT done FROM reminders').all()).toEqual([{done:1}]);
 const formal={...base,preparationTasks:[],eventTime:'2099-11-12T14:00:00',eventTimeEnd:'2099-11-12T15:00:00'};
 applyEmailItem(seed(formal,'面试时间2099年11月12日14:00至15:00','2099-11-07T08:00:00Z'),undefined,{createIfMissing:true});
 expect(listSchedules(app)).toHaveLength(1);expect(listSchedules(app)[0].status).toBe('scheduled');expect(getDb().prepare('SELECT COUNT(*) n FROM reminders WHERE done=1').get()).toEqual({n:1});
});
it('没有明确待预约依据的无时间邀请仍不伪造场次',()=>{
 expect(attachEvidence({...base,schedule:{action:'create',preliminary:true}}, {...raw,snippet:'欢迎参加面试'}).reviewReasons?.length).toBeGreaterThan(0);
});
it('待定岗位自动补全；明确调剂保留申请及审计，意愿询问不改岗位',()=>{
 const c=createCompany({name:'测试机构'});const a=createApplication({companyId:c.id,positionTitle:'测评邮件导入（2099-11-03）'});
 const e=attachEvidence(base,raw);expect(applyEmailItem(seed(e),undefined,{createIfMissing:true}).item.applicationId).toBe(a.id);
 expect(getDb().prepare('SELECT position_title FROM applications WHERE id=?').get(a.id)).toEqual({position_title:'服务岗'});
 const body='现已将您从服务岗调剂至技术岗。';
 const transfer:EmailExtraction={...base,eventType:'other',intent:'progress',positionTitle:'技术岗',schedule:undefined,preparationTasks:[],applicationChange:{kind:'transfer',fromPositionTitle:'服务岗',evidence:body}};
 expect(applyEmailItem(seed(transfer,body,'2099-11-06T08:00:00Z'),undefined,{createIfMissing:true}).item.applicationId).toBe(a.id);
 expect(getDb().prepare('SELECT position_title FROM applications WHERE id=?').get(a.id)).toEqual({position_title:'技术岗'});
 expect(getDb().prepare("SELECT COUNT(*) n FROM timeline_events WHERE title='岗位调剂'").get()).toEqual({n:1});
 const proposal='请问是否愿意从技术岗调剂至管理岗？';
 const bad={...transfer,positionTitle:'管理岗',applicationChange:{kind:'transfer' as const,fromPositionTitle:'技术岗',evidence:proposal}};
 expect(()=>applyEmailItem(seed(bad,proposal,'2099-11-07T08:00:00Z'),undefined,{createIfMissing:true})).toThrow('意愿询问');
});
