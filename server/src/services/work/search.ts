import {getDb} from '../../db/connection.js';
import {workSources} from './graph.js';
/** Search literal local text; wildcard characters never broaden a query. */
export function searchWorkSources(query:string,offset=0,limit=20){
 const db=getDb(),literal=query.replace(/[\\%_]/g,c=>'\\'+c),pattern=`%${literal}%`;
 const where="(subject LIKE ? ESCAPE '\\' OR snippet LIKE ? ESCAPE '\\' OR extracted LIKE ? ESCAPE '\\')";
 const args=[pattern,pattern,pattern];
 const ids=db.prepare(`SELECT id FROM email_items WHERE ${where} ORDER BY received_at DESC,id DESC LIMIT ? OFFSET ?`).all(...args,limit,offset) as {id:number}[];
 const total=(db.prepare(`SELECT COUNT(*) n FROM email_items WHERE ${where}`).get(...args) as {n:number}).n;
 return {items:workSources(ids.map(r=>r.id)),total,offset,limit,hasMore:offset+limit<total};
}
export function workFindings(){return getDb().prepare("SELECT key,kind,title,detail,fingerprint FROM email_check_findings WHERE status='open' ORDER BY updated_at DESC LIMIT 30").all();}
