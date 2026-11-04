// Explicit opt-in: only the configured AI key is read; all notices and mutations are in memory.
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {fileURLToPath} from 'node:url';
if(!process.argv.includes('--live'))throw new Error('Pass --live to use the configured AI API with synthetic notices');
const original=new Database(fileURLToPath(new URL('../data/findjob.db',import.meta.url)),{readonly:true});
const config=original.prepare("SELECT value FROM settings WHERE key='llm.config'").get()?.value;original.close();
if(!config)throw new Error('No configured LLM API');
process.env.FINDJOB_DB_PATH=':memory:';
const {setSetting}=await import('../dist/services/settings.service.js');setSetting('llm.config',config);
const {getDb,closeDb}=await import('../dist/db/connection.js');
const {runWorkAnalysis}=await import('../dist/services/work/engine.js');
const db=getDb();
try{
 const sources=[['示例集团资料预审通知','示例集团：请于2099年11月5日14点前完成信息填报。'],['测试公司考试结果','测试公司：很高兴通知您，您通过了通用能力考试。后续面试另行通知。']];
 const ids=sources.map(([subject,body],i)=>Number(db.prepare("INSERT INTO email_items(message_id,subject,sender,snippet,received_at,extracted,status,created_at) VALUES (?,?,'招聘组',?,'2099-11-01','{}','pending','2099-11-01')").run(`live-${i}`,subject,body).lastInsertRowid));
 const result=await runWorkAnalysis('请直接整理这两条通知。资料填报建立截止待办，考试通过记录进展，不创建新考试。无现有申请时可建立独立待定申请。',ids);
 const reminders=db.prepare('SELECT scheduled_at FROM reminders').all();
 const exams=db.prepare('SELECT COUNT(*) n FROM recruitment_schedules').get().n;
 const processed=db.prepare("SELECT COUNT(*) n FROM email_items WHERE status='confirmed'").get().n;
 console.log(JSON.stringify({status:result.status,processed,reminders,exams,operations:result.results?.map(r=>r.type),exceptions:result.questions},null,2));
 if(processed!==2)console.log(db.prepare('SELECT plan FROM work_decisions ORDER BY rowid DESC LIMIT 1').get()?.plan);
 assert.equal(processed,2);assert.equal(exams,0);assert.ok(reminders.some(r=>r.scheduled_at==='2099-11-05T14:00:00'));
 console.log('Live configured API passed: task deadline and progress notice classified and actually applied.');
}finally{closeDb();}
