import { createHash } from 'node:crypto';
import { getDb } from '../../db/connection.js';
import { AppError } from '../../middleware/error.js';
import { nowIso } from '../../utils/time.js';
import type { EmailExtraction } from '../../domain/types.js';
import { adoptUntrackedInvitations, reconcileScheduleReminders, applicationFromEventRef, applicationFromRepeatedWindow } from './schedules.service.js';
import {matchEmailApplication} from './applicationMatch.js';
import { explicitActivityWindow, mailTimeToLocal } from './eventTime.js';
import { EMAIL_EVENT_TO_TARGET_STATUS } from '../../domain/status.js';
import { isAuthenticationMail, redactMailSecrets } from './contentSafety.js';
import {informationalNotice,reservationMidnight} from './automationEvidence.js';
import {extractWithRules} from '../llm/ruleBased.js';
import {attachEvidence} from './evidence.js';

type RecordRow = Record<string, unknown>;
type Plan = {action:'merge-app'|'merge-schedule'|'split-mail'|'review'; ids:number[]; targetId?:number; mailId?:number};
type Finding = {key:string;kind:string;title:string;detail:string;status:string;plan:string;fingerprint:string;created_at:string;updated_at:string};
const parse = <T>(value: unknown, fallback:T):T => { try{return JSON.parse(String(value)) as T;}catch{return fallback;} };
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const rows=(table:string,where='',args:unknown[]=[])=>getDb().prepare(`SELECT * FROM ${table} ${where} ORDER BY id`).all(...args) as RecordRow[];
const compactCompany=(value:unknown)=>String(value).toLowerCase().replace(/[（(]中国[)）]|股份有限公司|有限责任公司|有限公司|\s/g,'');
const normalized=(value:unknown)=>String(value ?? '').replace(/\s/g,'').toLowerCase();
function snapshot(plan:Plan) {
  const db=getDb();
  if(plan.action==='merge-app') return plan.ids.map(id=>({app:db.prepare('SELECT * FROM applications WHERE id=?').get(id),mail:rows('email_items','WHERE application_id=?',[id]),schedules:rows('recruitment_schedules','WHERE application_id=?',[id]),reminders:rows('reminders','WHERE application_id=?',[id]),timeline:rows('timeline_events','WHERE application_id=?',[id])}));
  if(plan.action==='merge-schedule') return plan.ids.map(id=>({schedule:db.prepare('SELECT * FROM recruitment_schedules WHERE id=?').get(id),sources:rows('schedule_sources','WHERE schedule_id=?',[id]),mail:db.prepare('SELECT m.* FROM email_items m JOIN schedule_sources ss ON ss.email_id=m.id WHERE ss.schedule_id=? ORDER BY m.id').all(id),reminders:rows('reminders','WHERE schedule_id=?',[id])}));
  if(plan.mailId) return {peers:plan.ids.flatMap(id=>rows('email_items','WHERE application_id=?',[id])),mail:db.prepare('SELECT * FROM email_items WHERE id=?').get(plan.mailId),apps:plan.ids.map(id=>db.prepare('SELECT * FROM applications WHERE id=?').get(id)),sources:rows('schedule_sources','WHERE email_id=?',[plan.mailId])};
  return plan.ids.map(id=>db.prepare('SELECT * FROM recruitment_schedules WHERE id=?').get(id));
}
function record(runId:number|null,key:string|null,action:string,before:unknown,after:unknown) {
  getDb().prepare('INSERT INTO email_check_changes(run_id,finding_key,action,before_state,after_state,created_at) VALUES (?,?,?,?,?,?)').run(runId,key,action,redactMailSecrets(JSON.stringify(before)),redactMailSecrets(JSON.stringify(after)),nowIso());
}
function addFinding(seen:Set<string>,key:string,kind:string,title:string,detail:string,plan:Plan) {
  seen.add(key);const db=getDb(), fingerprint=hash(snapshot(plan)), now=nowIso();
  const old=db.prepare('SELECT * FROM email_check_findings WHERE key=?').get(key) as Finding|undefined;
  if(old?.fingerprint===fingerprint) return;
  db.prepare(`INSERT INTO email_check_findings(key,kind,title,detail,status,plan,fingerprint,created_at,updated_at) VALUES (?,?,?,?,'open',?,?,?,?) ON CONFLICT(key) DO UPDATE SET kind=excluded.kind,title=excluded.title,detail=excluded.detail,status='open',plan=excluded.plan,fingerprint=excluded.fingerprint,updated_at=excluded.updated_at`).run(key,kind,title,detail,JSON.stringify(plan),fingerprint,old?.created_at ?? now,now);
}
function compatibleSchedules(a:RecordRow,b:RecordRow) {
  const x=parse<RecordRow>(a.data,{}),y=parse<RecordRow>(b.data,{});
  return a.application_id===b.application_id && a.kind===b.kind && a.status===b.status && x.eventTime===y.eventTime && x.eventTimeEnd===y.eventTimeEnd && ['eventRef','round','venue','address','room','mode','timeKind','timezone'].every(k=>!x[k] || !y[k] || x[k]===y[k]) && (!Array.isArray(x.preparationTasks) || !x.preparationTasks.length || !Array.isArray(y.preparationTasks) || !y.preparationTasks.length || hash(x.preparationTasks)===hash(y.preparationTasks));
}

/** Plain-text evidence only: no HTML, remote images, or actionable mail links. */
function comparison(finding:Pick<Finding,'kind'|'detail'|'plan'>) {
  const plan=parse<Plan>(finding.plan,{action:'review',ids:[]}),db=getDb();
  const mailView=(m:RecordRow)=>{
    const e=parse<RecordRow>(m.extracted,{}),s=(e.schedule ?? {}) as RecordRow;
    return {id:m.id,subject:m.subject,sender:m.sender,receivedAt:m.received_at,position:e.positionTitle,jobId:e.recruitmentId,event:e.eventType,start:e.eventTime,end:e.eventTimeEnd,timeSource:e.timeSource,timeEvidence:e.timeEvidence,venue:s.venue,address:s.address,room:s.room,body:m.snippet,attachments:e.attachments};
  };
  const appView=(id:number)=>{
    const app=db.prepare('SELECT a.*,c.name company FROM applications a LEFT JOIN companies c ON c.id=a.company_id WHERE a.id=?').get(id) as RecordRow|undefined;
    return {id,label:`申请 #${id}`,company:app?.company,position:app?.position_title,status:app?.status,mails:rows('email_items','WHERE application_id=?',[id]).map(mailView)};
  };
  let columns:RecordRow[];
  if(plan.mailId){
    const mail=db.prepare('SELECT * FROM email_items WHERE id=?').get(plan.mailId) as RecordRow|undefined;
    const e=parse<RecordRow>(mail?.extracted,{});
    columns=[{label:`待核对邮件 #${plan.mailId}`,company:e.company,position:e.positionTitle,status:mail?.status,mails:mail?[mailView(mail)]:[]}];
    if(mail?.application_id){const app=appView(Number(mail.application_id));columns.push({...app,label:`当前申请 #${app.id} 的其他邮件`,mails:app.mails.filter(m=>m.id!==plan.mailId)});}
  }else if(plan.action==='merge-app')columns=plan.ids.map(appView);
  else columns=plan.ids.map(id=>{
    const row=db.prepare('SELECT * FROM recruitment_schedules WHERE id=?').get(id) as RecordRow|undefined;
    const data=parse<RecordRow>(row?.data,{}),app=row?appView(Number(row.application_id)):null;
    const mails=db.prepare('SELECT DISTINCT m.* FROM email_items m JOIN schedule_sources ss ON ss.email_id=m.id WHERE ss.schedule_id=? ORDER BY m.id').all(id) as RecordRow[];
    return {label:`日程 #${id}`,company:app?.company,position:app?.position,status:row?.status,start:data.eventTime,end:data.eventTimeEnd,venue:data.venue,address:data.address,room:data.room,round:data.round,mails:mails.map(mailView)};
  });
  const mails=columns.map(c=>(c.mails as ReturnType<typeof mailView>[]));
  const reasons=[finding.detail];
  if(plan.action==='merge-app'){
    const refs=mails.map(ms=>new Set(ms.map(m=>m.jobId).filter(Boolean)));
    const common=[...(refs[0]??[])].filter(id=>refs[1]?.has(id));
    if(common.length)reasons.push(`匹配依据：邮件中的职位编号相同（${common.join('、')}）。`);
    else reasons.push('匹配依据：同公司且岗位名称相同或同属管理培训生项目；缺少共同职位编号，名称相似不能证明是同一次申请。');
    reasons.push('不同测评／面试阶段可以属于同一申请；合并申请不会自动合并不同阶段的日程。');
  }
  if(plan.action==='split-mail')reasons.push('拆分依据：同一申请内出现不同职位编号或不同岗位回执。请核对是否不同岗位，避免把简称或岗位改名误拆。');
  if(finding.kind==='duplicate-schedule')reasons.push('匹配依据：同一申请、活动类型，且活动编号或开始时间相同；请结合轮次及原文确认是否同一场次。');
  return parse<{reasons:string[];columns:RecordRow[]}>(redactMailSecrets(JSON.stringify({reasons,columns})),{reasons:[],columns:[]});
}

/** Local-only audit. Never reads credentials, fetches mail, calls a model, or follows a URL. */
export function checkExistingEmails(trigger:'manual'|'incremental'|'apply'|'confirmation'='manual') {
  return getDb().transaction(()=>{
    const db=getDb(), now=nowIso(),seen=new Set<string>();
    const runId=Number(db.prepare('INSERT INTO email_check_runs(trigger,created_at) VALUES (?,?)').run(trigger,now).lastInsertRowid);
    const beforeCount=(db.prepare('SELECT COUNT(*) n FROM email_check_changes').get() as {n:number}).n;
    for(const mail of rows('email_items',"WHERE status='pending'")){
      const raw={messageId:String(mail.message_id),subject:String(mail.subject??''),sender:String(mail.sender??''),receivedAt:String(mail.received_at),snippet:String(mail.snippet??'')};
      const info=informationalNotice(raw.subject,raw.snippet);
      if(info){db.prepare("UPDATE email_items SET status='dismissed' WHERE id=?").run(mail.id);record(runId,null,`自动归档邮件 #${mail.id}：${info}`,mail,{...mail,status:'dismissed'});continue;}
      const old=parse<EmailExtraction|null>(mail.extracted,null);if(!old || old.timeSource==='manual' || old.attachments?.length)continue;
      const rule=extractWithRules(raw.subject,raw.sender,raw.snippet,raw.receivedAt);
      const recoverable=(old.reviewReasons??[]).every(r=>/公司或事件信息不完整|未确定活动时间|准备事项缺少有效时间或原文依据/.test(r));
      const recoveredTask=reservationMidnight(raw.snippet,raw.receivedAt);
      if(!recoverable || old.reviewReasons?.some(r=>r.includes('准备事项')) && !old.preparationTasks?.length && !recoveredTask)continue;
      const candidate=rule.confidence>=0.9 && (!old.eventType || old.eventType===rule.eventType)?rule:{...old,company:old.company==='重要'?rule.company:old.company};
      if(recoveredTask && !candidate.preparationTasks?.length)candidate.preparationTasks=[recoveredTask];
      const next=attachEvidence(candidate,raw);
      // Only replace low-quality extraction with explicit rules, or revalidate existing source evidence.
      if(!next.reviewReasons?.length && (next.confidence>=0.8 || old.company==='重要' && next.company!==old.company) && hash(next)!==hash(old)){
        db.prepare('UPDATE email_items SET extracted=? WHERE id=?').run(JSON.stringify(next),mail.id);
        record(runId,null,`自动补全邮件 #${mail.id} 的可核对依据`,old,next);
      }
    }
    // Reconnect only unambiguous confirmed legacy invitations. Each company gets a savepoint.
    for(const company of rows('companies')) {
      const before={schedules:rows('recruitment_schedules'),sources:rows('schedule_sources'),reminders:rows('reminders')};
      try {
        db.transaction(()=>adoptUntrackedInvitations(Number(company.id),true))();
        const after={schedules:rows('recruitment_schedules'),sources:rows('schedule_sources'),reminders:rows('reminders')};
        if(hash(before)!==hash(after)) record(runId,null,'接入已确认的历史日程',before,after);
      } catch { /* Per-mail findings below explain unresolved historical associations. */ }
    }
    // Legacy generated reminders have no ownership column; adopt only one exact eligible match.
    for(const reminder of rows('reminders',"WHERE schedule_id IS NULL AND title LIKE '邮件：%'")){
      const matches=rows('recruitment_schedules','WHERE application_id=?',[reminder.application_id]).filter(s=>{
        const d=parse<RecordRow>(s.data,{});return reminder.type===(s.kind==='interview'?'interview':'written_test') && [d.eventTime,d.eventTimeEnd].includes(reminder.scheduled_at);
      });
      if(matches.length===1){db.prepare('UPDATE reminders SET schedule_id=? WHERE id=?').run(matches[0].id,reminder.id);record(runId,null,`关联历史自动提醒 #${reminder.id}`,reminder,db.prepare('SELECT * FROM reminders WHERE id=?').get(reminder.id));}
    }
    // Restore missing owned reminders without re-opening completed or modifying manual tasks.
    for(const schedule of rows('recruitment_schedules')) {
      const id=Number(schedule.id),before=rows('reminders','WHERE schedule_id=?',[id]);
      const data=parse<RecordRow>(schedule.data,{});
      const evidence=db.prepare('SELECT ss.action,ss.snapshot,m.extracted,m.snippet FROM schedule_sources ss LEFT JOIN email_items m ON m.id=ss.email_id WHERE ss.schedule_id=? ORDER BY ss.id DESC').all(id) as {action:string;snapshot:string;extracted:string;snippet:string}[];
      const trusted=evidence.some(source=>{
        const e=parse<EmailExtraction|null>(source.extracted,null),saved=parse<RecordRow>(source.snapshot,{});
        if(source.action.startsWith('manual:') && saved.eventTime===data.eventTime)return true;
        if(!e || e.reviewReasons?.length || !['body','attachment','manual'].includes(e.timeSource ?? '') || e.eventTime!==data.eventTime || (e.eventTimeEnd ?? null)!==(data.eventTimeEnd ?? null))return false;
        const range=e.timeSource==='manual'?null:explicitActivityWindow(source.snippet ?? '');
        return !range || (range.start===e.eventTime && range.end===e.eventTimeEnd);
      });
      if(schedule.status==='scheduled' && !trusted){addFinding(seen,`schedule-evidence:${id}`,'schedule-evidence',`日程 #${id} 缺少可确认的当前时间依据`,'未自动补建提醒。请核对原邮件，或在招聘日程中明确确认当前时间。',{action:'review',ids:[id]});continue;}
      try {
        db.transaction(()=>reconcileScheduleReminders(id))();
        // Exact duplicated owned tasks are safe to collapse; completed records always survive.
        const owned=rows('reminders','WHERE schedule_id=?',[id]);const groups=new Map<string,RecordRow[]>();
        for(const r of owned){const key=JSON.stringify([r.type,r.scheduled_at,r.type==='other'?r.title:'']);groups.set(key,[...(groups.get(key)??[]),r]);}
        for(const group of groups.values()){
          const completed=group.some(r=>r.done===1);let kept=false;
          for(const r of group.filter(r=>r.done===0)) {if(completed || kept)db.prepare('DELETE FROM reminders WHERE id=? AND done=0').run(r.id);else kept=true;}
        }
        const after=rows('reminders','WHERE schedule_id=?',[id]);if(hash(before)!==hash(after))record(runId,null,`修复日程 #${id} 的自动提醒`,before,after);
      } catch { addFinding(seen,`schedule-time:${id}`,'schedule-time',`日程 #${id} 时间待确认`,'时间缺失、非法或结束早于开始；未擅自生成提醒。',{action:'review',ids:[id]}); }
    }
    const mails=rows('email_items'), apps=rows('applications'), companies=rows('companies');
    const extraction=(m:RecordRow)=>parse<EmailExtraction|null>(m.extracted,null);
    for(const mail of mails){
      if(isAuthenticationMail(String(mail.subject)) || /激活|邮箱验证|邮箱绑定/i.test(String(mail.subject)))continue;
      const e=extraction(mail);if(!e || e.relevant===false)continue;
      const id=Number(mail.id), appId=Number(mail.application_id), plan:Plan={action:'review',ids:appId?[appId]:[],mailId:id};
      if(mail.status==='dismissed')continue;
      if(!String(mail.snippet ?? '').trim() && !e.attachments?.some(a=>a.status==='parsed')) {
        addFinding(seen,`body:${id}`,'missing-body',`邮件 #${id} 缺少正文`,'仅有旧提取结果，无法核对岗位、地点及时间。请人工查看原邮件；待处理邮件也可使用历史补扫重新分析。',plan);continue;
      }
      if(mail.status==='pending' && (e.reviewReasons?.length || e.confidence<0.8))addFinding(seen,`mail-review:${id}`,'mail-review',`邮件 #${id} 需要复核`,e.reviewReasons?.join('；') || '提取置信度不足，请在邮件确认窗口核对。',plan);
      if(mail.status==='pending' && !e.reviewReasons?.length && e.confidence>=0.8 && e.company){
        const company=companies.find(c=>c.name===e.company);
        if(company)try{
          const target=applicationFromEventRef(Number(company.id),e.schedule?.eventRef)??applicationFromRepeatedWindow(Number(company.id),e,String(mail.subject),String(mail.sender));
          matchEmailApplication(Number(company.id),e,target);
        }catch{
          addFinding(seen,`mail-association:${id}`,'mail-association',`邮件 #${id} 需要确认所属申请`,'时间信息已识别，但现有岗位或场次无法唯一关联。请在邮件确认窗口选择所属申请；不会仅凭公司名称合并。',plan);
        }
      }
      // An explicit dismissal is a decision, not an unresolved problem. Keep it in the ignored inbox.
      if(mail.status!=='confirmed')continue;
      if(['assessment','interview','written_test'].includes(e.eventType ?? '')) {
        const source=db.prepare('SELECT schedule_id FROM schedule_sources WHERE email_id=?').get(id) as {schedule_id:number}|undefined;
        if(!source)addFinding(seen,`untracked:${id}`,'untracked',`邮件 #${id} 尚未关联日程`,'已有活动邮件无法唯一接入场次；请确认申请和时间后重新应用。',plan);
        const explicit=e.timeSource!=='manual'?explicitActivityWindow(String(mail.snippet ?? '')):null;
        const current=source?parse<RecordRow>((db.prepare('SELECT data FROM recruitment_schedules WHERE id=?').get(source.schedule_id) as {data:string}|undefined)?.data,{}):{};
        if(explicit && (explicit.start!==e.eventTime || explicit.end!==e.eventTimeEnd) && (current.eventTime!==explicit.start || current.eventTimeEnd!==explicit.end))addFinding(seen,`time-conflict:${id}`,'time-conflict',`邮件 #${id} 时间与正文不一致`,`原文明示 ${explicit.start} 至 ${explicit.end}，当前记录 ${e.eventTime ?? '未知'} 至 ${e.eventTimeEnd ?? '未知'}。请核对后调整日程。`,plan);
      }
      // Split candidates require exact identifiers from confirmed mail, never infer from company alone.
      const peers=mails.filter(m=>m.status==='confirmed' && m.application_id===mail.application_id).map(extraction).filter((v):v is EmailExtraction=>Boolean(v));
      const refs=new Set(peers.map(p=>p.recruitmentId).filter(Boolean));
      if(refs.size>1 && e.recruitmentId) addFinding(seen,`split:${id}`,'mixed-jobs',`申请 #${appId} 混有不同职位编号`,`邮件 #${id} 属于 ${e.positionTitle ?? '岗位未命名'} [${e.recruitmentId}]。确认后仅将该邮件及可独立迁移的场次拆到单独申请。`,{action:'split-mail',ids:[appId],mailId:id});
      else if(!refs.size && new Set(peers.filter(p=>p.eventType==='applied').map(p=>p.positionTitle?.trim()).filter(Boolean)).size>1 && e.eventType==='applied' && e.positionTitle) addFinding(seen,`split:${id}`,'mixed-jobs',`申请 #${appId} 包含不同岗位回执`,`邮件 #${id} 的完整岗位名称为“${e.positionTitle}”；可能是不同岗位，也可能是名称变化。`,{action:'split-mail',ids:[appId],mailId:id});
    }
    for(let i=0;i<apps.length;i++)for(let j=i+1;j<apps.length;j++){
      const a=apps[i],b=apps[j];const ca=companies.find(c=>c.id===a.company_id),cb=companies.find(c=>c.id===b.company_id);
      if(compactCompany(ca?.name)!==compactCompany(cb?.name))continue;
      const refs=(id:unknown)=>new Set(mails.filter(m=>m.application_id===id && m.status==='confirmed').map(m=>extraction(m)?.recruitmentId).filter(Boolean));
      const ar=refs(a.id),br=refs(b.id);if(new Set([...ar,...br]).size>1)continue;
      const sameRef=[...ar].some(r=>br.has(r)), sameTitle=normalized(a.position_title)===normalized(b.position_title);
      const sharedProgram=String(a.position_title).includes('管理培训生') && String(b.position_title).includes('管理培训生');
      if(sameRef || sameTitle || sharedProgram)addFinding(seen,`apps:${a.id}:${b.id}`,'duplicate-app',`可能重复的申请 #${a.id} / #${b.id}`,`${ca?.name}：${a.position_title}（${a.status}） ↔ ${b.position_title}（${b.status}）。确认保留的申请后迁移邮件、日程、提醒和历史；保留目标申请的当前状态。`,{action:'merge-app',ids:[Number(a.id),Number(b.id)],targetId:Number(a.id)});
    }
    const schedules=rows('recruitment_schedules');
    for(let i=0;i<schedules.length;i++)for(let j=i+1;j<schedules.length;j++){
      const a=schedules[i],b=schedules[j],x=parse<RecordRow>(a.data,{}),y=parse<RecordRow>(b.data,{});
      if(a.application_id===b.application_id && a.kind===b.kind && ((x.eventRef && x.eventRef===y.eventRef) || (x.eventTime && x.eventTime===y.eventTime)))addFinding(seen,`schedules:${a.id}:${b.id}`,'duplicate-schedule',`可能重复的日程 #${a.id} / #${b.id}`,compatibleSchedules(a,b)?'同申请、类型和时间，未发现字段冲突。请确认是否同一场活动；保留全部来源及完成记录。':'时间、地点、状态或轮次存在冲突，请先在招聘日程中核对，不能直接合并。',{action:compatibleSchedules(a,b)?'merge-schedule':'review',ids:[Number(a.id),Number(b.id)],targetId:Number(a.id)});
    }
    for(const old of db.prepare("SELECT key FROM email_check_findings WHERE status='open'").all() as {key:string}[])if(!seen.has(old.key))db.prepare("UPDATE email_check_findings SET status='resolved',updated_at=? WHERE key=?").run(now,old.key);
    const repaired=(db.prepare('SELECT COUNT(*) n FROM email_check_changes').get() as {n:number}).n-beforeCount;
    const review=(db.prepare("SELECT COUNT(*) n FROM email_check_findings WHERE status='open'").get() as {n:number}).n;
    const result={id:runId,trigger,checked:mails.length,repaired,review,createdAt:now};db.prepare('UPDATE email_check_runs SET result=? WHERE id=?').run(JSON.stringify(result),runId);return result;
  })();
}

export function getEmailCheckState() {
  const db=getDb();return {runs:rows('email_check_runs').slice(-30).reverse().map(r=>parse(r.result,{})),findings:(db.prepare("SELECT * FROM email_check_findings ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END,updated_at DESC LIMIT 300").all() as Finding[]).map(r=>({...r,comparison:r.status==='open'?comparison(r):undefined,plan:parse<Plan>(r.plan,{action:'review',ids:[]})})),changes:db.prepare('SELECT * FROM email_check_changes ORDER BY id DESC LIMIT 100').all()};
}
function moveReferences(from:number,to:number) {
  const db=getDb();for(const {name} of db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {name:string}[]){
    if(!/^[a-z_]+$/.test(name))continue;
    for(const fk of db.prepare(`PRAGMA foreign_key_list("${name}")`).all() as {table:string;from:string}[])if(fk.table==='applications' && /^[a-z_]+$/.test(fk.from))db.prepare(`UPDATE "${name}" SET "${fk.from}"=? WHERE "${fk.from}"=?`).run(to,from);
  }
}
export function resolveEmailCheck(key:string,fingerprint:string,decision:'confirm'|'ignore',targetId?:number) {
  getDb().transaction(()=>{
    const db=getDb(),finding=db.prepare('SELECT * FROM email_check_findings WHERE key=?').get(key) as Finding|undefined;
    if(!finding || finding.status!=='open')throw AppError.conflict('该问题已处理，请刷新');
    const plan=parse<Plan>(finding.plan,{action:'review',ids:[]}),before=snapshot(plan);let additional:unknown=null;
    if(finding.fingerprint!==fingerprint || hash(before)!==fingerprint)throw AppError.conflict('相关邮件或记录已变化，请重新检查后确认');
    const evidence={comparison:comparison(finding),records:before};
    if(decision==='ignore'){db.prepare("UPDATE email_check_findings SET status='ignored',updated_at=? WHERE key=?").run(nowIso(),key);record(null,key,'用户确认保持现状',evidence,before);return;}
    if(plan.action==='review')throw AppError.validation('此项需要先在邮件或日程页面核对信息，不能直接确认修复');
    if(plan.action==='merge-app'){
      const target=targetId ?? plan.targetId!;if(!plan.ids.includes(target))throw AppError.validation('请选择候选申请作为保留目标');
      const source=plan.ids.find(id=>id!==target)!;
      const a=db.prepare('SELECT * FROM applications WHERE id=?').get(target) as RecordRow,b=db.prepare('SELECT * FROM applications WHERE id=?').get(source) as RecordRow;
      for(const field of ['resume_id','jd_url','jd_description','job_type','deadline'])if(a[field] && b[field] && a[field]!==b[field])throw AppError.conflict('申请的简历、职位资料或截止时间冲突，请先人工整理，未合并');
      moveReferences(source,target);
      const dates=[a.applied_at,b.applied_at].filter(Boolean).map(String).sort();
      db.prepare('UPDATE applications SET applied_at=?,note=?,resume_id=?,jd_url=?,jd_description=?,updated_at=? WHERE id=?').run(dates[0]??null,[a.note,b.note,`用户确认合并申请 #${source}；源记录完整保存在核查历史`].filter(Boolean).join('\n'),a.resume_id??b.resume_id,a.jd_url??b.jd_url,a.jd_description??b.jd_description,nowIso(),target);
      db.prepare('DELETE FROM applications WHERE id=?').run(source);
    } else if(plan.action==='merge-schedule'){
      const target=plan.targetId!, source=plan.ids.find(id=>id!==target)!;
      const a=db.prepare('SELECT * FROM recruitment_schedules WHERE id=?').get(target) as RecordRow,b=db.prepare('SELECT * FROM recruitment_schedules WHERE id=?').get(source) as RecordRow;
      if(!compatibleSchedules(a,b))throw AppError.conflict('日程存在冲突，未合并');
      const data={...parse<RecordRow>(b.data,{})};for(const [k,v] of Object.entries(parse<RecordRow>(a.data,{})))if(v!==null && v!==undefined && v!=='' && (!Array.isArray(v) || v.length))data[k]=v;
      db.prepare('UPDATE schedule_sources SET schedule_id=? WHERE schedule_id=?').run(target,source);db.prepare('UPDATE reminders SET schedule_id=? WHERE schedule_id=?').run(target,source);
      db.prepare('DELETE FROM recruitment_schedules WHERE id=?').run(source);
      db.prepare('UPDATE recruitment_schedules SET data=?,revision=revision+1,last_received_at=?,updated_at=? WHERE id=?').run(JSON.stringify(data),String(a.last_received_at)>String(b.last_received_at)?a.last_received_at:b.last_received_at,nowIso(),target);
    } else {
      const m=db.prepare('SELECT * FROM email_items WHERE id=?').get(plan.mailId) as RecordRow,e=parse<EmailExtraction>(m.extracted,{} as EmailExtraction);
      const original=db.prepare('SELECT * FROM applications WHERE id=?').get(m.application_id) as RecordRow;
      if(!e.positionTitle && !e.recruitmentId)throw AppError.validation('缺少岗位标识，不能拆分');
      const linked=db.prepare('SELECT s.* FROM recruitment_schedules s JOIN schedule_sources ss ON ss.schedule_id=s.id WHERE ss.email_id=?').all(plan.mailId) as RecordRow[];
      if(linked.some(s=>(db.prepare('SELECT COUNT(*) n FROM schedule_sources WHERE schedule_id=?').get(s.id) as {n:number}).n>1))throw AppError.conflict('该邮件与其他来源共用日程，请先人工核对场次，未拆分');
      const id=Number(db.prepare('INSERT INTO applications(company_id,position_title,status,applied_at,channel,note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').run(original.company_id,`${e.positionTitle ?? '岗位'}${e.recruitmentId?` [${e.recruitmentId}]`:''}`,e.eventType?EMAIL_EVENT_TO_TARGET_STATUS[e.eventType] ?? 'WISHLIST':'WISHLIST',e.eventType==='applied'?mailTimeToLocal(String(m.received_at))?.slice(0,10)??null:null,'邮件核查',`经用户确认从申请 #${original.id} 拆分邮件 #${m.id}；原历史保留在源申请。`,nowIso(),nowIso()).lastInsertRowid);
      db.prepare('UPDATE email_items SET application_id=? WHERE id=?').run(id,m.id);
      for(const s of linked){db.prepare('UPDATE recruitment_schedules SET application_id=? WHERE id=?').run(id,s.id);db.prepare('UPDATE reminders SET application_id=? WHERE schedule_id=?').run(id,s.id);}
      db.prepare("INSERT INTO timeline_events(application_id,event_type,title,description,occurred_at,created_at) VALUES (?,'note','邮件核查拆分申请',?,?,?)").run(id,`邮件 #${m.id} 原属申请 #${original.id}，原历史未删除`,nowIso(),nowIso());
      additional=db.prepare('SELECT * FROM applications WHERE id=?').get(id);
    }
    db.prepare("UPDATE email_check_findings SET status='resolved',updated_at=? WHERE key=?").run(nowIso(),key);
    record(null,key,`用户确认：${finding.title}`,evidence,{state:snapshot(plan),additional,targetId:targetId??plan.targetId,decision});
  })();
  return checkExistingEmails('confirmation');
}
