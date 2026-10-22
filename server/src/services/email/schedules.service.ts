import { getDb } from '../../db/connection.js';
import { AppError } from '../../middleware/error.js';
import type { EmailExtraction, RecruitmentScheduleChange } from '../../domain/types.js';
import { nowIso, localIso } from '../../utils/time.js';
import { explicitActivityWindow, validEventTime } from './eventTime.js';

export const SCHEDULE_KINDS = ['interview', 'written_test', 'assessment'];

/** Older running servers may confirm mail after migration without creating a schedule. */
export function adoptUntrackedInvitations(companyId: number, requireEvidence = false) {
  const db=getDb();
  const rows=db.prepare(`SELECT m.* FROM email_items m JOIN applications a ON a.id=m.application_id WHERE a.company_id=? AND m.status='confirmed' AND NOT EXISTS(SELECT 1 FROM schedule_sources ss WHERE ss.email_id=m.id) ORDER BY m.received_at,m.id`).all(companyId) as {id:number;application_id:number;extracted:string;snippet:string;received_at:string}[];
  const groups=new Map<string,{row:typeof rows[number];e:EmailExtraction}[]>();
  for(const row of rows){
    let e:EmailExtraction;try{e=JSON.parse(row.extracted);}catch{continue;}
    if(!e || !SCHEDULE_KINDS.includes(e.eventType ?? '') || !validEventTime(e.eventTime) || e.reviewReasons?.length || (e.schedule && e.schedule.action!=='create')) continue;
    if(requireEvidence && e.timeSource!=='manual' && (!['body','attachment'].includes(e.timeSource ?? '') || !e.timeEvidence))continue;
    const explicit=explicitActivityWindow(row.snippet ?? '');
    if(requireEvidence && e.timeSource!=='manual' && explicit && (explicit.start!==e.eventTime || explicit.end!==e.eventTimeEnd))continue;
    if(db.prepare('SELECT id FROM recruitment_schedules WHERE application_id=? AND kind=?').get(row.application_id,e.eventType)) continue;
    const key=`${row.application_id}/${e.eventType}`;groups.set(key,[...(groups.get(key) ?? []),{row,e}]);
  }
  for(const group of groups.values()){
    // Ambiguous legacy rounds must be reviewed, not collapsed by company or date alone.
    if(new Set(group.map(({e})=>JSON.stringify([e.eventTime,e.eventTimeEnd,e.schedule?.round,e.schedule?.eventRef]))).size!==1) continue;
    for(const {row,e} of group){
      const window=explicitActivityWindow(row.snippet ?? '');
      if(window?.window && window.start===e.eventTime && window.end===e.eventTimeEnd) e.schedule={...e.schedule,action:'create',timeKind:'window'};
      const result=applySchedule(row.application_id,row.id,row.received_at,e);
      db.prepare("UPDATE reminders SET schedule_id=? WHERE application_id=? AND scheduled_at IN (?,?) AND title LIKE '邮件：%' AND schedule_id IS NULL AND type=?").run(result.id,row.application_id,e.eventTime,e.eventTimeEnd ?? null,e.eventType==='interview'?'interview':'written_test');
      const current=db.prepare('SELECT * FROM recruitment_schedules WHERE id=?').get(result.id) as Row;
      rebuildReminders(current,JSON.parse(current.data));
    }
  }
}
interface ScheduleData extends Partial<RecruitmentScheduleChange> {
  eventTime?: string | null;
  eventTimeEnd?: string | null;
  timeEvidence?: string | null;
  preparationTasks?: EmailExtraction['preparationTasks'];
}
interface Row { id: number; application_id: number; kind: string; status: string; data: string; last_received_at: string; revision: number }
export function listSchedules(applicationId?: number) {
  const rows = getDb().prepare(`SELECT s.*, a.position_title, c.name company_name FROM recruitment_schedules s JOIN applications a ON a.id=s.application_id JOIN companies c ON c.id=a.company_id ${applicationId ? 'WHERE application_id=?' : ''} ORDER BY s.updated_at DESC, s.id DESC`).all(...(applicationId ? [applicationId] : [])) as (Row & {position_title:string;company_name:string})[];
  return rows.map(row => ({ id: row.id, applicationId: row.application_id, companyName: row.company_name, positionTitle: row.position_title, kind: row.kind, status: row.status, revision: row.revision, data: JSON.parse(row.data) as ScheduleData,
    sources: getDb().prepare('SELECT ss.email_id emailId, ss.action, ss.snapshot, ss.received_at receivedAt, e.subject FROM schedule_sources ss LEFT JOIN email_items e ON e.id=ss.email_id WHERE schedule_id=? ORDER BY ss.id DESC').all(row.id) }));
}

/** Resolve only within an explicitly matched application. Never choose the sole event blindly. */
function matchSchedule(appId: number, e: EmailExtraction, target?: number | null): Row | undefined {
  const rows = getDb().prepare('SELECT * FROM recruitment_schedules WHERE application_id=? AND kind=?').all(appId, e.eventType) as Row[];
  if (target === null) return undefined;
  if (target !== undefined) {
    const row = rows.find(r => r.id === target);
    if (!row) throw AppError.conflict('所选日程不属于此申请或活动类型不一致');
    return row;
  }
  const change = e.schedule;
  const matchTime = validEventTime(change?.previousTime) ?? e.eventTime;
  const candidates = rows.filter(row => {
    const d = JSON.parse(row.data) as ScheduleData;
    if (change?.eventRef) return d.eventRef === change.eventRef;
    if (!matchTime && change?.round && change.action !== 'create') return d.round === change.round;
    return Boolean(matchTime && (d.eventTime === matchTime || (change?.timeKind === 'deadline' && d.timeKind === 'window' && d.eventTimeEnd === matchTime)) && (!change?.round || !d.round || d.round === change.round));
  });
  if (candidates.length > 1) throw AppError.conflict('多个日程符合邮件信息，请明确选择场次');
  return candidates[0];
}

/** Explicit selected event can resolve its application, but the company is still verified by caller. */
export function scheduleApplication(target: number) {
  const row = getDb().prepare('SELECT application_id FROM recruitment_schedules WHERE id=?').get(target) as {application_id:number} | undefined;
  if (!row) throw AppError.notFound('招聘日程');
  return row.application_id;
}

export function applicationFromEventRef(companyId: number, eventRef?: string | null): number | undefined {
  if (!eventRef) return undefined;
  const rows = getDb().prepare('SELECT s.* FROM recruitment_schedules s JOIN applications a ON a.id=s.application_id WHERE a.company_id=?').all(companyId) as Row[];
  const ids = [...new Set(rows.filter(r => (JSON.parse(r.data) as ScheduleData).eventRef === eventRef).map(r => r.application_id))];
  if (ids.length > 1) throw AppError.conflict('活动编号关联多个申请，请人工选择');
  return ids[0];
}

/** Same sender + subject + complete window can resolve a shortened job title; never override job IDs. */
export function applicationFromRepeatedWindow(companyId: number, e: EmailExtraction, subject: string | null, sender: string | null): number | undefined {
  if (e.recruitmentId || !e.eventTime || !subject || !sender || (e.schedule && e.schedule.action !== 'create')) return undefined;
  const mailbox = (s: string) => (s.match(/<([^>]+)>/)?.[1] ?? s).trim().toLowerCase();
  const rows = getDb().prepare(`SELECT s.*, a.position_title, m.subject, m.sender FROM recruitment_schedules s JOIN applications a ON a.id=s.application_id JOIN schedule_sources ss ON ss.schedule_id=s.id JOIN email_items m ON m.id=ss.email_id WHERE a.company_id=? AND s.kind=?`).all(companyId,e.eventType) as (Row & {position_title:string;subject:string;sender:string})[];
  const matches=rows.filter(r=>{
    const d=JSON.parse(r.data) as ScheduleData;
    const title=e.positionTitle?.replace(/\s/g,'').toLowerCase(), oldTitle=r.position_title.replace(/\s/g,'').toLowerCase();
    const compatibleTitle=!title || (title.length>=4 && !/\[[^\]]+\]$/.test(oldTitle) && (oldTitle.includes(title) || title.includes(oldTitle)));
    const sameWindow=d.eventTime===e.eventTime && (d.eventTimeEnd??null)===(e.eventTimeEnd??null);
    const sameDeadline=e.schedule?.timeKind==='deadline' && d.timeKind==='window' && d.eventTimeEnd===e.eventTime && !e.eventTimeEnd;
    return compatibleTitle && r.subject===subject && r.sender && mailbox(r.sender)===mailbox(sender) && (sameWindow || sameDeadline) && (!e.schedule?.eventRef || !d.eventRef || e.schedule.eventRef===d.eventRef) && (!e.schedule?.round || !d.round || e.schedule.round===d.round);
  });
  const schedules=[...new Set(matches.map(r=>r.id))];
  if(schedules.length>1) throw AppError.conflict('相同邮件来源和时间窗口对应多个场次，请人工选择');
  return matches[0]?.application_id;
}

function rebuildReminders(row: Row, data: ScheduleData, keepOverdue = false) {
  const db = getDb(); const now = nowIso();
  const retained = new Set<number>();
  // Reconcile in place: repeated checks must not churn reminder IDs or completion state.
  if (row.status !== 'scheduled') { db.prepare('DELETE FROM reminders WHERE schedule_id=? AND done=0').run(row.id); return; }
  const location = [data.venue, data.address, data.room].filter(Boolean).join(' · ');
  const type = row.kind === 'interview' ? 'interview' : 'written_test';
  const title = `${row.kind === 'interview' ? '面试' : '考试'}${data.round ? ` · ${data.round}` : ''}${data.timeKind === 'deadline' ? ' · 截止' : ''}${location ? ` · ${location}` : ''}`;
  const add = (at: string | null | undefined, label: string, kind: string) => {
    if (!at || at <= now) return;
    if (db.prepare('SELECT id FROM reminders WHERE application_id=? AND type=? AND scheduled_at=? AND schedule_id IS NULL AND done=0').get(row.application_id,kind,at)) return;
    if (db.prepare("SELECT id FROM reminders WHERE schedule_id=? AND scheduled_at=? AND type=? AND done=1 AND (type<>'other' OR title=?)").get(row.id, at, kind,label)) return;
    const existing = db.prepare("SELECT id FROM reminders WHERE schedule_id=? AND scheduled_at=? AND type=? AND done=0 AND (type<>'other' OR title=?) ORDER BY id LIMIT 1").get(row.id,at,kind,label) as {id:number}|undefined;
    if (existing) {
      retained.add(existing.id);
      if(!keepOverdue)db.prepare('UPDATE reminders SET title=?,application_id=? WHERE id=? AND (title<>? OR application_id<>?)').run(label,row.application_id,existing.id,label,row.application_id);
      else db.prepare('UPDATE reminders SET application_id=? WHERE id=? AND application_id<>?').run(row.application_id,existing.id,row.application_id);
    }
    else retained.add(Number(db.prepare('INSERT INTO reminders(application_id,type,title,scheduled_at,done,created_at,schedule_id) VALUES (?,?,?,?,0,?,?)').run(row.application_id, kind, label, at, now, row.id).lastInsertRowid));
  };
  const window = data.timeKind === 'window' && data.eventTimeEnd;
  const at = window ? data.eventTimeEnd : data.eventTime && data.eventTime > now ? data.eventTime : data.eventTimeEnd;
  add(at, window ? `完成截止：${title}` : title, type);
  if (at) add(localIso(new Date(new Date(at).getTime() - 86400000)), `提前一天准备：${title}`, type);
  if (window) add(data.eventTime, `开放作答：${title}`, type);
  for (const task of data.preparationTasks ?? []) add(validEventTime(task.scheduledAt), `准备：${task.title}`, 'other');
  for (const pending of db.prepare('SELECT id,scheduled_at FROM reminders WHERE schedule_id=? AND done=0').all(row.id) as {id:number;scheduled_at:string}[]) {
    // Keep overdue tasks visible; a check must not silently dismiss a missed reminder.
    if (!retained.has(pending.id) && (!keepOverdue || pending.scheduled_at > now)) db.prepare('DELETE FROM reminders WHERE id=?').run(pending.id);
  }
}

export function reconcileScheduleReminders(id: number) {
  const row=getDb().prepare('SELECT * FROM recruitment_schedules WHERE id=?').get(id) as Row|undefined;
  if (!row) throw AppError.notFound('招聘日程');
  const data=JSON.parse(row.data) as ScheduleData;
  if (row.status==='scheduled' && (!validEventTime(data.eventTime) || (data.eventTimeEnd && (!validEventTime(data.eventTimeEnd) || data.eventTimeEnd<=data.eventTime!)))) throw AppError.validation('日程时间不完整或冲突，请先确认');
  rebuildReminders(row,data,true);
}

/** Caller wraps this and email application in one transaction. */
export function applySchedule(appId: number, emailId: number | null, receivedAt: string, e: EmailExtraction, target?: number | null, expectedRevision?: number) {
  const db = getDb(); const now = nowIso();
  let change = e.schedule ?? { action: 'create' as const };
  let row = matchSchedule(appId, e, target);
  if (target === null && change.action !== 'create') throw AppError.validation('改期、取消和补充通知必须关联已有日程');
  if (!row && change.action !== 'create') throw AppError.conflict('未找到可确认的原日程，请选择场次；不会猜测或修改其他提醒');
  if (row && expectedRevision !== undefined && row.revision !== expectedRevision) throw AppError.conflict('日程已被其他邮件更新，请刷新后重新确认');
  if (row && target === undefined && change.action !== 'create' && new Date(receivedAt).getTime() === new Date(row.last_received_at).getTime()) throw AppError.conflict('通知收件时间相同，无法判断变更先后，请人工选择日程并确认');
  const old: ScheduleData = row ? JSON.parse(row.data) : {};
  if (row && change.action === 'create' && change.timeKind === 'deadline' && old.timeKind === 'window' && old.eventTimeEnd === e.eventTime && !e.eventTimeEnd) {
    change={...change,timeKind:'window'};
    e={...e,eventTime:old.eventTime ?? null,eventTimeEnd:old.eventTimeEnd};
  }
  if (row && change.eventRef && old.eventRef && change.eventRef !== old.eventRef) throw AppError.conflict('活动编号与所选日程不一致，请核对原文');
  if (row && change.round && old.round && change.round !== old.round) throw AppError.conflict('轮次与所选日程不一致，请为不同轮次创建新场次');
  if (row && new Date(receivedAt).getTime() < new Date(row.last_received_at).getTime()) {
    db.prepare("INSERT INTO schedule_sources(schedule_id,email_id,action,snapshot,received_at,created_at) VALUES (?,?,'stale',?,?,?)").run(row.id,emailId,JSON.stringify(e),receivedAt,now);
    return { id:row.id, stale:true, cancelled:row.status==='cancelled' };
  }
  if (row?.status === 'cancelled' && !['restore','cancel'].includes(change.action)) throw AppError.conflict('日程已取消，仅明确恢复通知或人工选择恢复才会重新提醒');
  if (change.previousTime && old.eventTime !== validEventTime(change.previousTime)) throw AppError.conflict('邮件原时间与当前日程不一致，请复核改期链');
  if (row && change.action === 'create' && e.eventTime && old.eventTime !== e.eventTime) throw AppError.conflict('同一活动编号出现不同时间，请确认是改期还是另一场活动');
  if (row && ['create','update'].includes(change.action) && e.eventTimeEnd && old.eventTimeEnd && old.eventTimeEnd !== e.eventTimeEnd) throw AppError.conflict('活动截止时间发生变化，请确认改期后更新');
  if (row && change.action === 'update' && e.eventTime && old.eventTime && old.eventTime !== e.eventTime) throw AppError.conflict('补充信息含不同活动时间，请明确选择改期');
  if (change.action === 'restore' && !e.eventTime) throw AppError.validation('恢复日程必须确认活动时间');
  const data: ScheduleData = { ...old };
  for (const key of ['eventRef','round','mode','venue','address','room','timezone','timeKind','evidence'] as const) {
    const value = change[key];
    if (value !== undefined && value !== null && value !== '') Object.assign(data, { [key]: value });
    if (emailId === null && value === null) Object.assign(data,{[key]:null});
  }
  if (data.mode === 'online' && old.mode !== 'online') { data.venue = null; data.address = null; data.room = null; }
  if (change.action === 'reschedule' || change.action === 'restore') {
    data.eventTime = validEventTime(e.eventTime); data.eventTimeEnd = validEventTime(e.eventTimeEnd);
    // Previous booking deadlines are not assumed valid after a reschedule.
    data.preparationTasks = e.preparationTasks ?? [];
  } else {
    if (e.eventTime) data.eventTime = validEventTime(e.eventTime);
    if (e.eventTimeEnd) data.eventTimeEnd = validEventTime(e.eventTimeEnd);
    else if (emailId === null) data.eventTimeEnd = null;
    if (e.preparationTasks?.length) data.preparationTasks = e.preparationTasks;
  }
  if (e.timeEvidence) data.timeEvidence = e.timeEvidence;
  if (!row && !data.eventTime) throw AppError.validation('新日程需要确认活动时间');
  if (data.eventTimeEnd && (!data.eventTime || data.eventTimeEnd <= data.eventTime)) throw AppError.validation('日程结束时间必须晚于开始时间');
  const status = change.action === 'cancel' ? 'cancelled' : data.eventTime ? 'scheduled' : 'awaiting_time';
  if (!row) {
    const id = Number(db.prepare('INSERT INTO recruitment_schedules(application_id,kind,status,data,last_received_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(appId,e.eventType,status,JSON.stringify(data),receivedAt,now,now).lastInsertRowid);
    row = {id,application_id:appId,kind:e.eventType!,status,data:JSON.stringify(data),last_received_at:receivedAt,revision:1};
  } else {
    db.prepare('UPDATE recruitment_schedules SET status=?,data=?,last_received_at=?,revision=revision+1,updated_at=? WHERE id=?').run(status,JSON.stringify(data),receivedAt,now,row.id);
    row = {...row,status,data:JSON.stringify(data)};
  }
  db.prepare('INSERT INTO schedule_sources(schedule_id,email_id,action,snapshot,received_at,created_at) VALUES (?,?,?,?,?,?)').run(row.id,emailId,emailId === null ? `manual:${change.action}` : change.action,JSON.stringify({...data,attachments:e.attachments ?? [],timeSource:e.timeSource}),receivedAt,now);
  rebuildReminders(row,data);
  return {id:row.id,stale:false,cancelled:status==='cancelled'};
}

export function updateScheduleManually(id: number, revision: number, change: RecruitmentScheduleChange, eventTime?: string | null, eventTimeEnd?: string | null) {
  return getDb().transaction(()=>{
    const row = getDb().prepare('SELECT * FROM recruitment_schedules WHERE id=?').get(id) as Row | undefined;
    if (!row) throw AppError.notFound('招聘日程');
    if (change.action === 'create') throw AppError.validation('已有日程不能选择首次创建');
    const received = new Date().toISOString();
    const result = applySchedule(row.application_id,null,received,{company:null,positionTitle:null,eventType:row.kind as EmailExtraction['eventType'],eventTime:eventTime ?? null,eventTimeEnd:eventTimeEnd ?? null,summary:'人工调整日程',confidence:1,timeSource:'manual',schedule:change},id,revision);
    if (result.stale) throw AppError.conflict('日程记录的收件时间晚于当前时间，请核对系统时间后重试');
    getDb().prepare("INSERT INTO timeline_events(application_id,event_type,title,description,occurred_at,created_at) VALUES (?,'note','人工调整招聘日程',?,?,?)").run(row.application_id,`${change.action} · 日程 #${id}`,nowIso(),nowIso());
    return listSchedules(row.application_id).find(s=>s.id===id)!;
  })();
}
