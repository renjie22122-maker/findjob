import {beforeEach,describe,it,expect} from 'vitest';
import {getDb,closeDb} from '../../db/connection.js';
import {applyEmailItem} from './email.service.js';
import {listSchedules,shareScheduleReminders} from './schedules.service.js';
import {extractWithRules} from '../llm/ruleBased.js';
import {attachEvidence} from './evidence.js';
import type {EmailExtraction} from '../../domain/types.js';
let seq=0;
function seed(e:EmailExtraction,body='',subject='招聘通知',sender='考试平台 <exam@example.com>'){
 const id=Number(getDb().prepare("INSERT INTO email_items(message_id,subject,sender,snippet,received_at,extracted,status,created_at) VALUES (?,?,?,?,'2099-10-20T10:00:00Z',?,'pending','2099-10-20')").run(`stages-${++seq}`,subject,sender,body,JSON.stringify(e)).lastInsertRowid);return id;
}
const base:EmailExtraction={company:'示例集团',positionTitle:null,eventType:'written_test',eventTime:'2099-10-25T09:30:00',confidence:.95,summary:'笔试',timeSource:'body',timeEvidence:'笔试将于2099年10月25日上午9:30进行。',schedule:{action:'create',mode:'offline'}};
beforeEach(()=>{closeDb();getDb();});
describe('多阶段预通知和补充来源',()=>{
 it('同发件人同时间引文的准考证通知自动关联，不重复活动提醒',()=>{
   const a=applyEmailItem(seed(base,'','示例笔试预通知'),undefined,{createIfMissing:true});const before=getDb().prepare('SELECT id,done FROM reminders').all();
   const b=applyEmailItem(seed({...base,preparationTasks:[{title:'打印准考证',scheduledAt:'2099-10-24T12:00:00',timeEvidence:'2099年10月24日12:00'}]},'','笔试准考证打印通知'),undefined,{createIfMissing:true});
   expect(b.item.applicationId).toBe(a.item.applicationId);expect(listSchedules()).toHaveLength(1);expect(getDb().prepare("SELECT id,done FROM reminders WHERE type<>'other'").all()).toEqual(before);
 });
 it('不同发件人或冲突时间不能自动按补充通知归并',()=>{
   applyEmailItem(seed(base,'','笔试预通知'),undefined,{createIfMissing:true});
   expect(()=>applyEmailItem(seed(base,'','准考证通知','其他 <other@example.com>'),undefined,{createIfMissing:true})).toThrow();
   expect(()=>applyEmailItem(seed({...base,eventTime:'2099-10-26T09:30:00'},'','准考证通知'),undefined,{createIfMissing:true})).toThrow();
 });
 it('笔试和仅日期的AI初面分别建档，正式面试补齐原日程',()=>{
   const body='感谢应聘示例科技。笔试为在线笔试形式。将于10月24日14:00-16:00开展。\n初面为AI面试形式。将于10月30-31日开展。正式笔试和AI初面通知后续发送。\n如您已经参加现场初面，后续不再安排AI初面。';
   const raw={subject:'笔试及初面预通知',sender:'示例招聘',snippet:body,receivedAt:'2099-10-20T10:00:00Z',messageId:'raw'};
   const e=attachEvidence(extractWithRules(raw.subject,raw.sender,body,raw.receivedAt),raw);
   expect(e.confidence).toBe(.9);
   const item=applyEmailItem(seed(e,body),undefined,{createIfMissing:true});
   expect(listSchedules()).toHaveLength(2);const preliminary=listSchedules().find(s=>s.kind==='interview')!;
   expect(preliminary.status).toBe('awaiting_time');expect(preliminary.data).toMatchObject({dateStart:'2099-10-30',dateEnd:'2099-10-31'});
   expect(getDb().prepare('SELECT id FROM reminders WHERE schedule_id=?').all(preliminary.id)).toHaveLength(0);
   applyEmailItem(seed({...base,company:e.company,eventType:'interview',eventTime:'2099-10-30T10:00:00',schedule:{action:'create'}}),undefined,{createIfMissing:true,targetApplicationId:item.item.applicationId!});
   expect(listSchedules()).toHaveLength(2);expect(listSchedules().find(s=>s.id===preliminary.id)?.status).toBe('scheduled');
 });
 it('确认共用考试只去重活动提醒，保留完成状态和来源',()=>{
   applyEmailItem(seed(base),undefined,{createIfMissing:true});applyEmailItem(seed({...base,company:'另一单位'}),undefined,{createIfMissing:true});
   const [a,b]=listSchedules();getDb().prepare('UPDATE reminders SET done=1 WHERE schedule_id=? AND scheduled_at=?').run(a.id,base.eventTime);
   shareScheduleReminders(a.id,b.id);expect(getDb().prepare('SELECT id FROM reminders WHERE schedule_id=? AND done=0').all(a.id)).toHaveLength(0);
   expect(getDb().prepare('SELECT id FROM reminders WHERE schedule_id=? AND done=1').all(a.id)).toHaveLength(1);
   expect(()=>shareScheduleReminders(b.id,a.id)).toThrow();
 });
});
