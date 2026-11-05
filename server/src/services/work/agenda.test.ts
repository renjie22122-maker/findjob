import {beforeEach,it,expect} from 'vitest';
import {getDb,closeDb} from '../../db/connection.js';
import {createCompany} from '../companies.service.js';
import {createApplication} from '../applications.service.js';
import {createReminder,listReminders} from '../reminders.service.js';
import {applySchedule} from '../email/schedules.service.js';
import {workAgenda} from './agenda.js';
beforeEach(()=>{closeDb();getDb();});
function seed(timeKind:'start'|'window'|'deadline'){
 const c=createCompany({name:'示例机构'}),a=createApplication({companyId:c.id,positionTitle:'工程师'});
 applySchedule(a.id,null,'2099-11-01T12:00:00',{company:c.name,positionTitle:a.positionTitle,eventType:'written_test',eventTime:'2099-11-06T09:00:00',eventTimeEnd:timeKind==='window'?'2099-11-08T17:00:00':timeKind==='start'?'2099-11-06T11:00:00':null,summary:'考试安排',confidence:1,schedule:{action:'create',timeKind,venue:'第一考场',timezone:'Asia/Shanghai'}});
 return a;
}
it('fixed sessions expose the exact interval separately from advance reminders',()=>{
 seed('start');const rows=listReminders();expect(rows.length).toBeGreaterThan(0);
 expect(rows[0].activity).toMatchObject({eventTime:'2099-11-06T09:00:00',eventTimeEnd:'2099-11-06T11:00:00',venue:'第一考场'});
 expect(workAgenda({from:'2099-11-06',to:'2099-11-06'}).items.every(r=>r.primaryTime==='2099-11-06T09:00:00'&&r.occupiesWholeInterval)).toBe(true);
});
it('flexible windows filter and sort on completion deadline, not opening or reminder dates',()=>{
 seed('window');expect(workAgenda({from:'2099-11-06',to:'2099-11-06'}).total).toBe(0);
 const agenda=workAgenda({from:'2099-11-08',to:'2099-11-08'});expect(agenda.total).toBeGreaterThan(0);
 expect(agenda.items.every(r=>r.deadline==='2099-11-08T17:00:00'&&!r.occupiesWholeInterval)).toBe(true);
 const before=getDb().prepare('SELECT * FROM reminders').all();workAgenda();expect(getDb().prepare('SELECT * FROM reminders').all()).toEqual(before);
});
it('standalone deadlines, completion filters, pagination and cancelled times stay explicit',()=>{
 const a=seed('deadline');const r=createReminder({applicationId:a.id,type:'deadline',title:'填写材料',scheduledAt:'2099-11-07T14:00:00'});
 getDb().prepare('UPDATE reminders SET done=1 WHERE id=?').run(r.id);
 expect(workAgenda({done:true,limit:1}).items[0]).toMatchObject({id:r.id,deadline:'2099-11-07T14:00:00',timeMeaning:'deadline'});
 getDb().prepare("UPDATE recruitment_schedules SET status='cancelled'").run();
 expect(workAgenda({done:false}).items.every(r=>r.primaryTime===null&&!r.occupiesWholeInterval)).toBe(true);
});
