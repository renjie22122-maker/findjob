// Explicit opt-in. Sends synthetic mail only to the configured model; no IMAP or mail links.
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
if (!process.argv.includes('--live')) throw new Error('Use --live to test the configured model');
const original=new Database(fileURLToPath(new URL('../data/findjob.db',import.meta.url)),{readonly:true});
await original.backup(fileURLToPath(new URL(`../data/before-schedule-live-${Date.now()}.db`,import.meta.url)));original.close();
const {extractWithLlm}=await import('../dist/services/llm/llm.client.js');
const {attachEvidence}=await import('../dist/services/email/evidence.js');
const {closeDb}=await import('../dist/db/connection.js');
const cases=[
 {subject:'【远帆制造】邀请参加AI视频面试',body:'感谢投递2099管理培训生项目。正式作答时间：2099-10-15 18:16 至 2099-10-18 18:16（请在本时间段内完成AI视频面试，约需30分钟）。本次是线上AI面试，链接有效期72小时。',attachment:'',action:'create',time:'2099-10-15T18:16:00',end:'2099-10-18T18:16:00',kind:'window'},
 {subject:'【云帆实验室】AI面试截止提醒',body:'2099管理培训生项目AI面试即将截止，请在指定有效期内随时完成。面试时间：2099-10-14 22:44 至 2099-10-17 22:44。此前已发送邀请，本邮件仅再次提醒，时间不变。',attachment:'',action:'create',time:'2099-10-14T22:44:00',end:'2099-10-17T22:44:00',kind:'window'},
 {subject:'【云帆实验室】第一轮面试通知',body:'岗位：研究工程师，职位编号 JOB-730。活动编号 EVT-730，第一轮面试。时间：2099年10月18日15:00。考点：东区中心。地址：星海路88号。考场：B302。',attachment:'',action:'create',time:'2099-10-18T15:00:00'},
 {subject:'【云帆实验室】面试考场补充',body:'岗位：研究工程师，职位编号 JOB-730，活动编号 EVT-730。请查看附件的考场更新，不改变面试时间。',attachment:'活动编号 EVT-730，第一轮面试。考点：东区中心。地址：星海路88号。考场：C401。',action:'update',room:'C401'},
 {subject:'【远帆制造】线下笔试改期',body:'岗位：设备工程师，职位编号 JOB-910。活动编号 EX-910，笔试由2099年10月20日09:00调整为2099年10月22日14:00。原考点不变。',attachment:'',action:'reschedule',time:'2099-10-22T14:00:00'},
 {subject:'【云帆实验室】面试取消通知',body:'活动编号 EVT-730 的第一轮面试已取消，请勿到场。这不是拒信，后续安排另行通知。',attachment:'',action:'cancel'},
];
let failed=0;
try {
 for(const c of cases.filter(c=>!process.argv.includes('--windows') || c.kind==='window')){
  try {
   const raw={messageId:'synthetic',subject:c.subject,sender:'招聘',receivedAt:'2099-10-01T08:00:00Z',snippet:c.body,content:{body:c.body,attachmentText:c.attachment,attachments:[],warnings:[]}};
   const e=attachEvidence(await extractWithLlm(c.subject,'招聘',c.body,raw.receivedAt,c.attachment),raw);
   assert.equal(e.schedule?.action,c.action);if(c.time)assert.equal(e.eventTime,c.time);if(c.room)assert.equal(e.schedule?.room,c.room);
   if(c.end)assert.equal(e.eventTimeEnd,c.end);if(c.kind)assert.equal(e.schedule?.timeKind,c.kind);
   assert.equal(e.reviewReasons?.length,0,JSON.stringify(e.reviewReasons));
   console.log(JSON.stringify({action:c.action,ok:true,eventType:e.eventType,time:e.eventTime,location:e.schedule?.room,source:e.timeSource}));
  }catch(error){failed++;console.log(JSON.stringify({action:c.action,ok:false,error:error.message}));}
 }
}finally{closeDb();}
if(failed)process.exitCode=1;
