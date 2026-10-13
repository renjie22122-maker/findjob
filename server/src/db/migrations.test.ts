import Database from 'better-sqlite3';
import { describe, it, expect } from 'vitest';
import { runMigrations } from './migrations.js';

describe('日程升级保留历史数据',()=>{
  it('历史已确认时间接入一次，采用自动邮件提醒但保留手工提醒',()=>{
    const db=new Database(':memory:');runMigrations(db);
    db.exec('DROP TABLE schedule_sources; DROP INDEX idx_rem_schedule; ALTER TABLE reminders DROP COLUMN schedule_id; DROP TABLE recruitment_schedules; PRAGMA user_version=7;');
    db.prepare("INSERT INTO companies(id,name,created_at,updated_at) VALUES (1,'迁移测试','2099-01-01','2099-01-01')").run();
    db.prepare("INSERT INTO applications(id,company_id,position_title,job_type,status,priority,created_at,updated_at) VALUES (1,1,'工程师','school','INTERVIEW_1','MEDIUM','2099-01-01','2099-01-01')").run();
    for(const [id,received] of [[1,'2099-01-01T08:00:00Z'],[2,'2099-01-02T08:00:00Z']] as const) db.prepare("INSERT INTO email_items(id,message_id,subject,application_id,extracted,status,received_at,created_at) VALUES (?,?, '面试',1,?,'confirmed',?,?)").run(id,`legacy-${id}`,JSON.stringify({eventType:'interview',eventTime:'2099-01-05T10:00:00'}),received,received);
    for(const title of ['邮件：面试','个人准备']) db.prepare("INSERT INTO reminders(application_id,type,title,scheduled_at,done,created_at) VALUES (1,'interview',?,'2099-01-05T10:00:00',0,'2099-01-01')").run(title);
    runMigrations(db);runMigrations(db);
    expect(db.prepare('SELECT COUNT(*) n FROM recruitment_schedules').get()).toEqual({n:1});
    expect(db.prepare('SELECT COUNT(*) n FROM schedule_sources').get()).toEqual({n:2});
    expect(db.prepare('SELECT last_received_at FROM recruitment_schedules').get()).toEqual({last_received_at:'2099-01-02T08:00:00Z'});
    expect(db.prepare("SELECT schedule_id FROM reminders WHERE title='邮件：面试'").get()).toEqual({schedule_id:1});
    expect(db.prepare("SELECT schedule_id FROM reminders WHERE title='个人准备'").get()).toEqual({schedule_id:null});
    expect(db.pragma('foreign_key_check')).toEqual([]);db.close();
  });
});
