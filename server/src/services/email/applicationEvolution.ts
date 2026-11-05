import {getDb} from '../../db/connection.js';
import {AppError} from '../../middleware/error.js';
import {nowIso} from '../../utils/time.js';
import type {EmailExtraction} from '../../domain/types.js';
export const placeholderPosition=(title:string)=>/岗位待定|岗位待补充|岗位待明确|(?:测评|笔试|面试|邮件)邮件导入|Role pending/i.test(title);
export function transferEvidence(e:EmailExtraction,text:string):boolean {
 const c=e.applicationChange;if(!c)return true;
 const normalize=(s:string)=>s.replace(/\s/g,'');const quote=normalize(c.evidence);
 return !!e.positionTitle&&!!c.fromPositionTitle&&normalize(text).includes(quote)&&quote.includes(normalize(c.fromPositionTitle))&&quote.includes(normalize(e.positionTitle))&&/调剂|调整.{0,12}岗位|岗位.{0,12}调整|transferred|reassigned/i.test(quote)&&!/是否|意愿|愿意|意向|可申请|考虑|拟调剂|未调剂|尚未|不予|取消.{0,8}调剂|请确认|请回复|征求|建议|申请调剂|if you|would you|propos|not.{0,20}(?:transfer|reassign)/i.test(quote);
}
/** Preserve application identity and its activity history when the role is clarified or explicitly transferred. */
export function evolveApplication(id:number,e:EmailExtraction,body:string,received:string){
 const db=getDb(),app=db.prepare('SELECT position_title FROM applications WHERE id=?').get(id) as {position_title:string};
 if(!e.positionTitle||e.eventType==='reject'||app.position_title===e.positionTitle)return;
 const transfer=e.applicationChange;
 if(!transfer&&!placeholderPosition(app.position_title))return;
 if(transfer&&(!transferEvidence(e,body)||transfer.fromPositionTitle!==app.position_title))throw AppError.conflict('调剂通知与原岗位不一致，保留原申请');
 if(!transfer&&!body.replace(/\s/g,'').includes(e.positionTitle.replace(/\s/g,'')))return;
 const newer=db.prepare("SELECT id FROM email_items WHERE application_id=? AND status='confirmed' AND received_at>? LIMIT 1").get(id,received);
 if(newer)return;
 const next=e.recruitmentId?`${e.positionTitle} [${e.recruitmentId}]`:e.positionTitle;
 db.prepare('UPDATE applications SET position_title=?,updated_at=? WHERE id=?').run(next,nowIso(),id);
 db.prepare("INSERT INTO timeline_events(application_id,event_type,title,description,occurred_at,created_at) VALUES (?,'note',?,?,?,?)").run(id,transfer?'岗位调剂':'岗位信息补全',JSON.stringify({from:app.position_title,to:next,evidence:transfer?.evidence??e.positionTitle}),nowIso(),nowIso());
}
