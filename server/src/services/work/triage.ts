import {getDb} from '../../db/connection.js';
import {workSources} from './graph.js';
import {informationalNotice,passedStageNotice} from '../email/automationEvidence.js';
import {awaitingAppointment} from '../email/preliminary.js';
import type {EmailExtraction} from '../../domain/types.js';

/** Read-only diagnostics: suggestions are not authorization to merge or complete. */
export function noticeTriage(offset=0,limit=20) {
 const db=getDb();
 const rows=db.prepare("SELECT id,subject,snippet,received_at,extracted,application_id FROM email_items WHERE status='pending' ORDER BY received_at DESC,id DESC LIMIT ? OFFSET ?").all(limit,offset) as {id:number;subject:string;snippet:string;received_at:string;extracted:string;application_id:number|null}[];
 const total=(db.prepare("SELECT COUNT(*) n FROM email_items WHERE status='pending'").get() as {n:number}).n;
 const items=rows.map(row=>{
  let e:Partial<EmailExtraction>={};try{e=JSON.parse(row.extracted)||{};}catch{/* Malformed legacy extraction remains visible. */}
  const info=informationalNotice(row.subject,row.snippet);
  const provisional=awaitingAppointment(row.snippet,row.received_at);
  const category=info?'information':passedStageNotice(row.snippet)?'stage_result':provisional?'awaiting_assignment':e.preparationTasks?.length?'task':e.eventType==='reject'?'rejection':'association_or_evidence';
  const activities=db.prepare('SELECT s.id,s.status,s.revision,s.data FROM recruitment_schedules s JOIN schedule_sources ss ON ss.schedule_id=s.id WHERE ss.email_id=? ORDER BY s.id').all(row.id);
  return {id:row.id,applicationId:row.application_id,category,explanation:info,provisional,reviewReasons:e.reviewReasons??[],attachments:e.attachments??[],activities,source:workSources([row.id])[0],nextStep:info?'archive_without_changing_completion':'analyze_local_sources',constraints:['Do not infer completion from conditional wording or expired deadlines','Provisional date ranges are not fixed appointments','Preserve completed activities; never open action or authentication links']};
 });
 return {items,total,offset,limit,hasMore:offset+limit<total};
}
