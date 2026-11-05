import {listReminders} from '../reminders.service.js';
import {nowIso} from '../../utils/time.js';
import {workFingerprint} from './engine.js';

/** Filter by attendance/deadline date, not the preparation notification date. */
export function workAgenda(filters:{from?:string;to?:string;done?:boolean;offset?:number;limit?:number}={}){
  const offset=filters.offset??0,limit=Math.min(100,Math.max(1,filters.limit??40));
  const items=listReminders({done:filters.done}).map(r=>{
    const a=r.activity,window=a?.timeKind==='window';
    const inactive=a&&a.status!=='scheduled';
    const primaryTime=inactive?null:a?(window?a.eventTimeEnd:a.eventTime)??null:r.scheduledAt;
    return {...r,reminderAt:r.scheduledAt,primaryTime,
      timeMeaning:inactive?'unconfirmed':window?'completion_window':a?.timeKind==='deadline'||!a&&r.type==='deadline'?'deadline':a?'fixed_session':'reminder',
      occupiesWholeInterval:!!a&&!inactive&&a.timeKind!=='window'&&a.timeKind!=='deadline',
      deadline:window?a?.eventTimeEnd??null:a?.timeKind==='deadline'?a.eventTime??null:!a&&r.type==='deadline'?r.scheduledAt:null};
  }).filter(r=>(!filters.from||!!r.primaryTime&&r.primaryTime.slice(0,10)>=filters.from)&&(!filters.to||!!r.primaryTime&&r.primaryTime.slice(0,10)<=filters.to))
    .sort((a,b)=>(a.primaryTime??'9999').localeCompare(b.primaryTime??'9999')||a.id-b.id);
  return {items:items.slice(offset,offset+limit),total:items.length,offset,limit,hasMore:offset+limit<items.length,
    dateBasis:'activity start or completion deadline; fallback to standalone reminder time',generatedAt:nowIso(),fingerprint:workFingerprint()};
}
