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
 const {processWorkQueue}=await import('../dist/services/work/queue.js');
 let cycles=0;
 for(;cycles<3;cycles++){
  await processWorkQueue();
  if(db.prepare("SELECT COUNT(*) n FROM email_items WHERE status='pending'").get().n===0)break;
  // Test clock only: skip the 5/15-minute backoff in this isolated in-memory database.
  db.prepare("UPDATE work_scan SET next_attempt='2000-01-01'").run();
 }
 const latest=db.prepare('SELECT status,result,plan FROM work_decisions ORDER BY rowid DESC LIMIT 1').get();
 const result={status:latest?.status,results:JSON.parse(latest?.result||'[]'),questions:JSON.parse(latest?.plan||'{}').actions?.map(a=>a.question)};
 console.log('Automatic cycles:',cycles+1);
 const reminders=db.prepare('SELECT scheduled_at FROM reminders').all();
 const exams=db.prepare('SELECT COUNT(*) n FROM recruitment_schedules').get().n;
 const processed=db.prepare("SELECT COUNT(*) n FROM email_items WHERE status='confirmed'").get().n;
 console.log(JSON.stringify({status:result.status,processed,reminders,exams,operations:result.results?.map(r=>r.type),exceptions:result.questions},null,2));
 if(processed!==2)console.log(db.prepare('SELECT plan FROM work_decisions ORDER BY rowid DESC LIMIT 1').get()?.plan);
 assert.ok(db.prepare('SELECT COUNT(*) n FROM work_strategies').get().n>0,'Verified results should teach a reusable category');
 assert.equal(processed,2);assert.equal(exams,0);assert.ok(reminders.some(r=>r.scheduled_at==='2099-11-05T14:00:00'));
 console.log('Live configured API passed: task deadline and progress notice classified and actually applied.');
}finally{closeDb();}
