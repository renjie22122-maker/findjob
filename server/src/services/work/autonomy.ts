import {getDb} from '../../db/connection.js';
import {redactMailSecrets} from '../email/contentSafety.js';

const KEY='work.autonomy.status';
export type AutonomyRun={at:string;state:string;checked:number;resolved:number;remaining:number;message:string;lastAudit?:string;localRepairs?:number};
export function saveAutonomyRun(run:AutonomyRun){
 const db=getDb();db.prepare('INSERT INTO settings(key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').run(KEY,JSON.stringify(run),new Date().toISOString());
}
export function autonomyStatus(){
 const db=getDb();let last:Partial<AutonomyRun>={};try{last=JSON.parse((db.prepare('SELECT value FROM settings WHERE key=?').get(KEY) as {value:string}|undefined)?.value||'{}');}catch{/* absent legacy state */}
 const counts=db.prepare("SELECT COUNT(*) pending,SUM(CASE WHEN s.error IS NOT NULL AND s.attempts<3 THEN 1 ELSE 0 END) retrying,SUM(CASE WHEN s.error IS NOT NULL AND s.attempts>=3 THEN 1 ELSE 0 END) paused FROM email_items e LEFT JOIN work_scan s ON s.notice_id=e.id WHERE e.status='pending'").get() as {pending:number;retrying:number;paused:number};
 return {enabled:process.env.CAREERFLOW_WORK_AUTO!=='0',...last,...counts,retrying:counts.retrying||0,paused:counts.paused||0};
}
/** Successful executions are examples, never new evidence or instructions. Keep payload bounded. */
export function successfulExamples(noticeIds:number[]){
 const db=getDb(),kinds=new Set<string>();
 for(const id of noticeIds){const row=db.prepare('SELECT extracted FROM email_items WHERE id=?').get(id) as {extracted:string}|undefined;try{const e=JSON.parse(row?.extracted||'{}');if(e.eventType)kinds.add(e.eventType);}catch{/* malformed legacy extraction */}}
 const rows=db.prepare("SELECT id,result FROM work_decisions WHERE status='applied' AND result<>'[]' ORDER BY created_at DESC,rowid DESC LIMIT 60").all() as {id:string;result:string}[];
 return rows.flatMap(r=>{try{const results=JSON.parse(r.result) as Record<string,any>[];return results.filter(a=>a.type==='apply-notice'&&a.extraction&&kinds.has(a.extraction.eventType)).map(a=>({decisionId:r.id,eventType:a.extraction.eventType,intent:a.extraction.intent,timeKind:a.extraction.schedule?.timeKind,preliminary:a.extraction.schedule?.preliminary,summary:String(a.extraction.summary||'').slice(0,250)}));}catch{return [];}}).slice(0,4).map(e=>JSON.parse(redactMailSecrets(JSON.stringify(e))));
}
