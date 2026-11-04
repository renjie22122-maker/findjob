import {getDb} from '../../db/connection.js';
import {redactMailSecrets} from '../email/contentSafety.js';
import type {WorkNode} from './schema.js';
import {canonicalCompany,fuzzyOrganizationMatch} from './organizations.js';

export const safeJson=<T>(raw:unknown,fallback:T):T=>{try{return JSON.parse(String(raw)) as T;}catch{return fallback;}};
export function workGraph(query='',offset=0,limit=100){
  const db=getDb();
  const nodes:WorkNode[]=[];
  const edges:{source:string;target:string;relation:string;evidence?:unknown}[]=[];
  const companies=db.prepare('SELECT id,name FROM companies').all() as {id:number;name:string}[];
  const terms=db.prepare('SELECT company_id,term,kind FROM company_terms').all() as {company_id:number;term:string;kind:string}[];
  for(const c of companies)if(canonicalCompany(c.id)===c.id)nodes.push({id:`company:${c.id}`,kind:'company',title:c.name,state:'active',revision:0,data:{aliases:companies.filter(a=>a.id!==c.id&&canonicalCompany(a.id)===c.id).map(a=>a.name),searchTerms:terms.filter(a=>a.company_id===c.id).map(a=>a.term)}});
  for(const a of db.prepare('SELECT id,company_id,position_title,status FROM applications').all() as {id:number;company_id:number;position_title:string;status:string}[]){
    nodes.push({id:`application:${a.id}`,kind:'application',title:a.position_title,state:a.status,revision:0,data:{companyId:a.company_id}});
    edges.push({source:`company:${canonicalCompany(a.company_id)}`,target:`application:${a.id}`,relation:'offers'});
  }
  for(const s of db.prepare('SELECT id,application_id,kind,status,data,revision FROM recruitment_schedules').all() as {id:number;application_id:number;kind:string;status:string;data:string;revision:number}[]){
    const data=safeJson<Record<string,unknown>>(s.data,{});
    nodes.push({id:`schedule:${s.id}`,kind:'activity',title:String(data.round||s.kind),state:s.status,revision:s.revision,data:{...data,activityKind:s.kind,applicationId:s.application_id}});
    edges.push({source:`application:${s.application_id}`,target:`schedule:${s.id}`,relation:'participates'});
    if(data.sharedWithScheduleId)edges.push({source:`schedule:${s.id}`,target:`schedule:${data.sharedWithScheduleId}`,relation:'shares_reminders'});
  }
  for(const n of db.prepare('SELECT id,subject,status,message_id FROM email_items').all() as {id:number;subject:string;status:string;message_id:string}[])nodes.push({id:`notice:${n.id}`,kind:n.message_id.startsWith('sms:')?'sms':'email',title:n.subject,state:n.status,revision:0,data:{}});
  for(const s of db.prepare('SELECT schedule_id,email_id FROM schedule_sources WHERE email_id IS NOT NULL').all() as {schedule_id:number;email_id:number}[])edges.push({source:`notice:${s.email_id}`,target:`schedule:${s.schedule_id}`,relation:'supports'});
  for(const m of db.prepare('SELECT id,application_id FROM email_items WHERE application_id IS NOT NULL').all() as {id:number;application_id:number}[])edges.push({source:`notice:${m.id}`,target:`application:${m.application_id}`,relation:'notifies'});
  for(const e of db.prepare('SELECT id,application_id,title,occurred_at,to_status FROM timeline_events ORDER BY id DESC LIMIT 300').all() as {id:number;application_id:number;title:string;occurred_at:string;to_status:string|null}[]){
    nodes.push({id:`event:${e.id}`,kind:'progress',title:e.title,state:e.to_status??'recorded',revision:0,data:{occurredAt:e.occurred_at}});
    edges.push({source:`application:${e.application_id}`,target:`event:${e.id}`,relation:'progressed'});
  }
  for(const r of db.prepare('SELECT id,application_id,schedule_id,title,scheduled_at,done FROM reminders ORDER BY done,scheduled_at LIMIT 300').all() as {id:number;application_id:number;schedule_id:number|null;title:string;scheduled_at:string;done:number}[]){
    nodes.push({id:`reminder:${r.id}`,kind:'task',title:r.title,state:r.done?'completed':'active',revision:0,data:{scheduledAt:r.scheduled_at,scheduleId:r.schedule_id}});
    edges.push({source:r.schedule_id?`schedule:${r.schedule_id}`:`application:${r.application_id}`,target:`reminder:${r.id}`,relation:'requires'});
  }
  for(const n of db.prepare('SELECT * FROM work_nodes').all() as {id:string;kind:string;title:string;state:string;revision:number;data:string}[])nodes.push({...n,data:safeJson(n.data,{})});
  edges.push(...db.prepare('SELECT source,target,relation,evidence FROM work_edges').all() as typeof edges);
  for(const e of edges)for(const k of ['source','target'] as const)if(e[k].startsWith('company:'))e[k]=`company:${canonicalCompany(Number(e[k].split(':')[1]))}`;
  const search=query.trim().toLowerCase();
  const matched=new Set(nodes.filter(n=>!search||`${n.title} ${n.id} ${JSON.stringify(n.data)}`.toLowerCase().includes(search)||n.kind==='company'&&[n.title,...(Array.isArray(n.data.aliases)?n.data.aliases.filter((v):v is string=>typeof v==='string'):[]),...(Array.isArray(n.data.searchTerms)?n.data.searchTerms.filter((v):v is string=>typeof v==='string'):[])].some(v=>fuzzyOrganizationMatch(search,v))).map(n=>n.id));
  // Expand organization hierarchy only, never infer identity from group membership.
  if(search)for(let i=0;i<nodes.length;i++){let changed=false;for(const e of edges)if(['parent_of','subsidiary_of'].includes(e.relation)&&e.source.startsWith('company:')&&e.target.startsWith('company:')&&(matched.has(e.source)||matched.has(e.target))){for(const id of [e.source,e.target])if(!matched.has(id)){matched.add(id);changed=true;}}if(!changed)break;}
  const matches=nodes.filter(n=>matched.has(n.id));
  const selected=matches.slice(offset,offset+limit);const ids=new Set(selected.map(n=>n.id));
  const touching=edges.filter(e=>ids.has(e.source)||ids.has(e.target));
  // One-hop neighbours provide context without recursively expanding the whole graph.
  const neighbours=new Set(touching.flatMap(e=>[e.source,e.target]));
  const shown=[...selected,...nodes.filter(n=>!ids.has(n.id)&&neighbours.has(n.id)).slice(0,200)];
  const shownIds=new Set(shown.map(n=>n.id));
  return safeJson(redactMailSecrets(JSON.stringify({nodes:shown,edges:touching.filter(e=>shownIds.has(e.source)&&shownIds.has(e.target)),total:matches.length,offset,limit,hasMore:offset+limit<matches.length})),{nodes:[] as WorkNode[],edges:[] as typeof edges,total:0,offset,limit,hasMore:false});
}

export function workSources(ids:number[]){
  return ids.slice(0,40).flatMap(id=>{
    const row=getDb().prepare('SELECT id,subject,snippet,received_at,extracted,status FROM email_items WHERE id=?').get(id) as {id:number;subject:string;snippet:string;received_at:string;extracted:string;status:string}|undefined;
    return row?[safeJson(redactMailSecrets(JSON.stringify({...row,snippet:(row.snippet??'').slice(0,8000),extracted:safeJson(row.extracted,{})})),{} as typeof row)]:[];
  });
}
