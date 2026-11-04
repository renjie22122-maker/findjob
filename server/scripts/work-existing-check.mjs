// Explicit local maintenance. Does not read the mailbox or follow notice links.
import Database from 'better-sqlite3';
import {fileURLToPath} from 'node:url';
const ids=process.argv.slice(2).filter(x=>/^\d+$/.test(x)).map(Number);
if(!process.argv.includes('--apply')||!ids.length)throw new Error('Usage: node work-existing-check.mjs --apply NOTICE_ID...');
const path=fileURLToPath(new URL('../data/findjob.db',import.meta.url));
const original=new Database(path,{readonly:true});await original.backup(fileURLToPath(new URL(`../data/before-work-repair-${Date.now()}.db`,import.meta.url)));original.close();
const {runWorkAnalysis}=await import('../dist/services/work/engine.js');
const {getDb,closeDb}=await import('../dist/db/connection.js');
const {checkExistingEmails}=await import('../dist/services/email/check.service.js');
try{
 const result=await runWorkAnalysis('重新核对指定的已有通知。自动纠正旧提取结果：结果通知记录进展，不新建考试；明确截止生成待办；同一通知的不同活动分别跟踪。优先关联已存在的对应申请，保留已完成状态。不要访问链接，不执行身份操作。',ids);
 const check=checkExistingEmails('manual');
 const db=getDb();
 const notices=ids.map(id=>db.prepare('SELECT id,status,application_id FROM email_items WHERE id=?').get(id));
 console.log(JSON.stringify({status:result.status,operations:result.results?.map(r=>({type:r.type,noticeId:r.noticeId,scheduleId:r.scheduleId})),exceptions:result.questions,notices,check:{repaired:check.repaired,review:check.review}},null,2));
}finally{closeDb();}
