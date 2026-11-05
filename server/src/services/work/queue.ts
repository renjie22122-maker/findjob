import {createHash} from 'node:crypto';
import {getDb} from '../../db/connection.js';
import {getLlmConfig} from '../settings.service.js';
import {runWorkAnalysis} from './engine.js';
import {checkExistingEmails} from '../email/check.service.js';
import {reconcileOrganizationNames} from './organizations.js';

/** Durable content checkpoints. Bounded batches, retry backoff; no polling of the mailbox. */
export async function processWorkQueue(){
  if(process.env.CAREERFLOW_WORK_AUTO==='0')return;
  reconcileOrganizationNames();
  if(!getLlmConfig()?.apiKey)return;
  const db=getDb(),now=new Date().toISOString();
  const rows=db.prepare("SELECT id,subject,snippet,extracted,status FROM email_items WHERE status<>'dismissed' ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END,id").all() as {id:number;subject:string;snippet:string;extracted:string;status:string}[];
  const digest=(r:typeof rows[number])=>createHash('sha256').update(JSON.stringify({id:r.id,subject:r.subject,snippet:r.snippet,extracted:r.extracted})+(r.status==='pending'?'appointment-transfer-v2':'')).digest('hex');
  const selected=rows.filter(r=>{const checkpoint=db.prepare('SELECT * FROM work_scan WHERE notice_id=?').get(r.id) as {signature:string;attempts:number;next_attempt:string;error:string|null}|undefined;return !checkpoint||checkpoint.signature!==digest(r)||Boolean(checkpoint.error&&checkpoint.attempts<3&&checkpoint.next_attempt<=now);}).slice(0,12);
  if(!selected.length)return;
  // Include older sources for the same companies and schedules, not just the latest mail.
  const related=new Set(selected.map(r=>r.id));
  for(const r of selected){
    const peers=db.prepare(`SELECT DISTINCT m.id FROM email_items m JOIN applications a ON a.id=m.application_id
      WHERE a.company_id IN (SELECT a2.company_id FROM applications a2 JOIN email_items own ON own.application_id=a2.id WHERE own.id=?)
      ORDER BY m.id DESC LIMIT 4`).all(r.id) as {id:number}[];
    for(const p of peers)if(related.size<36)related.add(p.id);
  }
  try{
    const result=await runWorkAnalysis(undefined,[...related],true) as {status:string};
    if(result.status==='busy'||result.status==='unconfigured')return;
    if(result.status==='pending')throw new Error('部分操作尚未应用');
    for(const r of selected){const fresh=db.prepare('SELECT id,subject,snippet,extracted,status FROM email_items WHERE id=?').get(r.id) as typeof r;
      db.prepare('INSERT INTO work_scan(notice_id,signature,next_attempt) VALUES (?,?,?) ON CONFLICT(notice_id) DO UPDATE SET signature=excluded.signature,error=NULL,attempts=0,next_attempt=excluded.next_attempt').run(r.id,digest(fresh),now);
    }
    checkExistingEmails('incremental');
  }catch{
    for(const r of selected)db.prepare("INSERT INTO work_scan(notice_id,signature,attempts,next_attempt,error) VALUES (?,?,1,?,'AI分析未完成，稍后重试') ON CONFLICT(notice_id) DO UPDATE SET attempts=CASE WHEN work_scan.signature=excluded.signature THEN work_scan.attempts+1 ELSE 1 END,signature=excluded.signature,next_attempt=excluded.next_attempt,error=excluded.error").run(r.id,digest(r),new Date(Date.now()+300000).toISOString());
  }
}
