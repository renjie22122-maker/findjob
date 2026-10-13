import { getDb } from '../../db/connection.js';
import { AppError } from '../../middleware/error.js';
import { EMAIL_ANALYZE_MAX_DAYS, EMAIL_ANALYZE_MODE, EMAIL_LLM_MAX_EMAILS } from '../../config.js';
import { EMAIL_EVENT_LABELS, EMAIL_EVENT_TO_REMINDER_TYPE, EMAIL_EVENT_TO_TARGET_STATUS, STATUS, STATUS_LABELS, planStatusPath } from '../../domain/status.js';
import type { AppStatus } from '../../domain/status.js';
import type { EmailExtraction, EmailItem, Paginated, TimelineEvent, Reminder } from '../../domain/types.js';
import { nowIso } from '../../utils/time.js';
import { getEmailConfig, getLlmConfig } from '../settings.service.js';
import { createCompany } from '../companies.service.js';
import { createApplication, transitionApplication } from '../applications.service.js';
import { extractWithLlm } from '../llm/llm.client.js';
import { extractWithRules } from '../llm/ruleBased.js';
import { fetchRecentEmails, testEmailConnection, acknowledgeEmail } from './imap.client.js';
import { isRecruitmentCandidate } from './filter.js';
import { eventWindowText, mailTimeToLocal, timelineTime, validEventTime } from './eventTime.js';
import { attachEvidence } from './evidence.js';
import { applySchedule, scheduleApplication, applicationFromEventRef, SCHEDULE_KINDS } from './schedules.service.js';
import { matchEmailApplication } from './applicationMatch.js';
import { isAuthenticationMail, redactMailSecrets } from './contentSafety.js';

interface EmailItemRow {
  id: number;
  message_id: string;
  subject: string;
  sender: string | null;
  received_at: string;
  snippet: string | null;
  extracted: string | null;
  status: string;
  application_id: number | null;
  created_at: string;
  applied_at: string | null;
}

function toItem(row: EmailItemRow): EmailItem {
  let extracted: EmailExtraction | null = null;
  if (row.extracted) {
    try {
      extracted = JSON.parse(row.extracted) as EmailExtraction;
      if (!extracted.timeSource && row.status === 'pending') extracted.reviewReasons = [...(extracted.reviewReasons ?? []), '旧版结果尚未核对时间来源，请重新分析或人工确认'];
    } catch {
      extracted = null;
    }
  }
  return {
    id: row.id,
    messageId: row.message_id,
    subject: row.subject,
    sender: row.sender,
    receivedAt: row.received_at,
    snippet: row.snippet,
    extracted,
    status: row.status as EmailItem['status'],
    applicationId: row.application_id,
    createdAt: row.created_at,
    appliedAt: row.applied_at,
  };
}

export interface AnalyzeResult {
  fetched: number;
  candidates: number;
  analyzed: number;
  skipped: number;
  /** LLM 判定与求职无关（安全通知/账单/营销等）而被跳过的数量 */
  irrelevant: number;
  /** 实际使用的模式：llm-first（模型读正文判定）或 keyword（无 Key 时的降级） */
  mode: 'llm-first' | 'keyword';
}

/** 拉取 + 初筛 + 去重 + 提取（LLM 优先，规则降级）→ 落库 pending */
export interface AnalyzeOptions {
  /** 是否同时扫描垃圾邮件文件夹（默认 true：招聘通知常被误判为垃圾） */
  includeJunk?: boolean;
  fullRescan?: boolean;
  reanalyzePending?: boolean;
}

let analyzing = false;
export function isEmailAnalyzing(): boolean { return analyzing; }
export async function analyzeEmails(days: number, options: AnalyzeOptions = {}): Promise<AnalyzeResult> {
  if (analyzing) throw AppError.conflict('邮件分析正在进行，请稍后刷新');
  analyzing = true;
  try { return await analyzeEmailsOnce(days, options); }
  finally { analyzing = false; }
}

async function analyzeEmailsOnce(days: number, options: AnalyzeOptions = {}): Promise<AnalyzeResult> {
  const cfg = getEmailConfig();
  if (!cfg) throw AppError.validation('请先在设置页配置邮箱');

  const clampedDays = Math.min(EMAIL_ANALYZE_MAX_DAYS, Math.max(1, days));
  const db = getDb();
  const knownRows = db.prepare('SELECT message_id, id, status FROM email_items').all() as { message_id: string; id: number; status: string }[];
  const existing = new Set(knownRows.filter((r) => !options.reanalyzePending || r.status !== 'pending').map((r) => r.message_id));
  const pending = new Map(knownRows.filter((r) => r.status === 'pending').map((r) => [r.message_id, r.id]));
  for (const row of db.prepare('SELECT message_id FROM email_ignored_receipts').all() as { message_id: string }[]) existing.add(row.message_id);
  const raws = await fetchRecentEmails(cfg, clampedDays, { ...options, fullRescan: options.fullRescan || options.reanalyzePending, knownMessageIds: existing });

  // LLM 优先：不靠关键词初筛，直接把主题+正文交给模型判断「是否招聘相关」；
  // 未配置 LLM Key（或显式设 EMAIL_ANALYZE_MODE=keyword）时降级为本地关键词初筛 + 规则提取。
  const llmReady = Boolean(getLlmConfig()?.apiKey);
  const mode: 'llm-first' | 'keyword' = EMAIL_ANALYZE_MODE === 'keyword' || !llmReady ? 'keyword' : 'llm-first';
  const candidates = raws;

  let analyzed = 0;
  let skipped = 0;
  let irrelevant = 0;
  for (const raw of candidates) {
    if (isAuthenticationMail(raw.subject)) { irrelevant++; acknowledgeEmail(raw); continue; }
    if (existing.has(raw.messageId)) {
      skipped++;
      acknowledgeEmail(raw);
      continue;
    }
    if (analyzed + irrelevant >= EMAIL_LLM_MAX_EMAILS) break;
    if (mode === 'keyword' && !isRecruitmentCandidate(raw.subject, raw.sender)) { irrelevant++; acknowledgeEmail(raw); continue; }
    let extraction: EmailExtraction;
    if (mode === 'llm-first' && (raw.snippet || raw.content?.attachmentText)) {
      try {
        extraction = await extractWithLlm(raw.subject, raw.sender, raw.snippet ?? '', raw.receivedAt, raw.content?.attachmentText ?? '');
      } catch (err) {
        console.warn('[email] LLM 提取失败，降级本地规则：', err instanceof Error ? err.message : err);
        extraction = extractWithRules(raw.subject, raw.sender, `${raw.snippet ?? ''}\n${raw.content?.attachmentText ?? ''}`, raw.receivedAt);
      }
      // 模型判定与求职无关（安全通知/账单/营销等）：不入库，仅计数
      if (extraction.relevant === false) {
        db.prepare('INSERT OR IGNORE INTO email_ignored_receipts (message_id, analyzed_at) VALUES (?, ?)').run(raw.messageId, nowIso());
        if (options.reanalyzePending && pending.has(raw.messageId)) db.prepare("UPDATE email_items SET status = 'dismissed', extracted = ? WHERE id = ? AND status = 'pending'").run(JSON.stringify(extraction), pending.get(raw.messageId));
        existing.add(raw.messageId);
        irrelevant++;
        acknowledgeEmail(raw);
        continue;
      }
    } else {
      extraction = extractWithRules(raw.subject, raw.sender, `${raw.snippet ?? ''}\n${raw.content?.attachmentText ?? ''}`, raw.receivedAt);
    }
    extraction = attachEvidence(extraction, raw);
    if (options.reanalyzePending && pending.has(raw.messageId)) {
      db.prepare("UPDATE email_items SET extracted = ?, snippet = ?, received_at = ? WHERE id = ? AND status = 'pending'").run(JSON.stringify(extraction), redactMailSecrets(raw.snippet), raw.receivedAt, pending.get(raw.messageId));
    } else db.prepare(
      `INSERT INTO email_items (message_id, subject, sender, received_at, snippet, extracted, status, application_id, created_at, applied_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL, ?, NULL)`,
    ).run(
      raw.messageId,
      raw.subject,
      raw.sender,
      raw.receivedAt,
      redactMailSecrets(raw.snippet),
      JSON.stringify(extraction),
      nowIso(),
    );
    analyzed++;
    existing.add(raw.messageId);
    acknowledgeEmail(raw);
  }

  return { fetched: raws.length, candidates: candidates.length, analyzed, skipped, irrelevant, mode };
}

export function testEmail(): Promise<{ ok: boolean; message: string }> {
  const cfg = getEmailConfig();
  if (!cfg) throw AppError.validation('请先在设置页配置邮箱');
  return testEmailConnection(cfg);
}

export function listEmailItems(filters: { status?: string; page?: number; pageSize?: number } = {}): Paginated<EmailItem> {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filters.status) {
    conditions.push('status = ?');
    params.push(filters.status);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM email_items ${where}`).get(...params) as { c: number }).c;
  const rows = db
    .prepare(`SELECT * FROM email_items ${where} ORDER BY received_at DESC, id DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, (page - 1) * pageSize) as EmailItemRow[];
  return { items: rows.map(toItem), total, page, pageSize };
}

export function countPendingEmailItems(): number {
  return (getDb().prepare("SELECT COUNT(*) AS c FROM email_items WHERE status = 'pending'").get() as { c: number }).c;
}

/** 应用邮件时的可选项（ADR-7 的扩展：默认不碰状态机，悬选后才推进） */
export interface ApplyOptions {
  targetScheduleId?: number | null;
  expectedScheduleRevision?: number;
  targetApplicationId?: number | null;
  /** 投递确认类邮件：匹配到的申请若处于「待投递」，一并推进为「已投递」 */
  markApplied?: boolean;
  /** 库中缺少公司/岗位时自动创建申请记录（默认关闭，避免脏数据） */
  createIfMissing?: boolean;
}

/** 应用提取结果：生成时间线笔记 + 未来时间提醒（默认不改状态机，除非显式 markApplied） */
function applyEmailItemInternal(
  id: number,
  extractedOverride?: EmailExtraction,
  options: ApplyOptions = {},
): {
  item: EmailItem;
  timelineEvent: TimelineEvent | null;
  reminder: Reminder | null;
  warning: string | null;
  statusChange: { applicationId: number; from: AppStatus; to: AppStatus } | null;
} {
  const db = getDb();
  const row = db.prepare('SELECT * FROM email_items WHERE id = ?').get(id) as EmailItemRow | undefined;
  if (options.targetApplicationId === null && !options.createIfMissing) throw AppError.validation('选择新建独立申请时，请开启缺记录则创建');
  if (!row) throw AppError.notFound('邮件记录');
  if (row.status !== 'pending') throw AppError.conflict('该邮件已处理');

  let extracted: EmailExtraction | null;
  if (extractedOverride) {
    extracted = extractedOverride;
  } else {
    try {
      extracted = row.extracted ? (JSON.parse(row.extracted) as EmailExtraction) : null;
    } catch {
      extracted = null;
    }
  }

  if (extracted?.eventType === 'applied' || extracted?.eventType === 'reject') {
    extracted = { ...extracted, eventTime: mailTimeToLocal(row.received_at), eventTimeEnd: null, timeSource: 'received', timeEvidence: null };
  }
  if (extracted?.schedule && !SCHEDULE_KINDS.includes(extracted.eventType ?? '')) throw AppError.validation('日程变更必须指定考试、测评或面试类型，取消活动不等于拒信');
  if (extracted?.eventTime && !validEventTime(extracted.eventTime)) throw AppError.validation('事件时间格式或日期无效');
  if (extracted?.eventTimeEnd && (!validEventTime(extracted.eventTimeEnd) || !extracted.eventTime || extracted.eventTimeEnd <= extracted.eventTime)) throw AppError.validation('结束时间必须晚于开始时间');
  if (extracted && ['written_test', 'interview', 'assessment'].includes(extracted.eventType ?? '') && !extracted.eventTime && (!extracted.schedule || extracted.schedule.action === 'create')) throw AppError.validation('请先填写正文或附件中的活动时间，不能使用收件时间代替');

  let applicationId: number | null = null;
  let timelineEvent: TimelineEvent | null = null;
  let reminder: Reminder | null = null;
  let warning: string | null = null;
  let statusChange: { applicationId: number; from: AppStatus; to: AppStatus } | null = null;

  if (extracted?.company) {
    // 公司名称精确匹配；开启 createIfMissing 时允许自动建公司。
    // Exact names only: fuzzy company matching may merge unrelated employers.
    let company = db.prepare('SELECT id, name FROM companies WHERE name = ?').get(extracted.company.trim()) as { id: number; name: string } | undefined;
    if (!company && options.createIfMissing) {
      try {
        company = createCompany({ name: extracted.company });
      } catch {
        company = db.prepare('SELECT id, name FROM companies WHERE name = ?').get(extracted.company.trim()) as { id: number; name: string } | undefined;
      }
    }

    if (!company) {
      warning = `未在库中找到公司「${extracted.company}」，本次仅记录邮件；可在应用时勾选「不存在则创建记录」，或先在申请列表添加该公司。`;
    } else {
      const selectedApp = typeof options.targetScheduleId === 'number' ? scheduleApplication(options.targetScheduleId) : undefined;
      if (selectedApp && options.targetApplicationId !== undefined && options.targetApplicationId !== selectedApp) throw AppError.conflict('所选申请与日程不一致');
      const eventApp = selectedApp ?? applicationFromEventRef(company.id, extracted.schedule?.eventRef);
      if (!selectedApp && options.targetApplicationId === undefined && eventApp && extracted.recruitmentId) {
        const byJob = matchEmailApplication(company.id, extracted);
        if (!byJob || byJob.id !== eventApp) throw AppError.conflict('职位编号与活动编号指向不同申请，请人工核对');
      }
      let appRow = matchEmailApplication(company.id, extracted, options.targetApplicationId !== undefined ? options.targetApplicationId : eventApp);
      if (!appRow && extracted.schedule && extracted.schedule.action !== 'create') throw AppError.conflict('变更通知无法确认原申请，请先选择原日程');
      // 开启 createIfMissing 且无匹配时：自动建一条「待投递」记录（后续可推进为已投递）
      if (!appRow && options.createIfMissing) {
        const title =
          extracted.positionTitle?.trim() ||
          `${EMAIL_EVENT_LABELS[extracted.eventType ?? 'other']}邮件导入（${nowIso().slice(0, 10)}）`;
        try {
          const created = createApplication({
            companyId: company.id,
            positionTitle: extracted.recruitmentId ? `${title} [${extracted.recruitmentId}]` : title,
            status: STATUS.WISHLIST,
            // 投递确认类邮件：投递日期用邮件收到日期，而不是导入/分析日期
            appliedAt:
              extracted.eventType === 'applied'
                ? (mailTimeToLocal(row.received_at)?.slice(0, 10) ?? null)
                : null,
            channel: '邮件导入',
            note: `${row.subject ? `由邮件导入：${row.subject}` : '由邮件导入'}${extracted.eventType !== 'applied' ? '；未收到投递回执，实际投递日期未知' : ''}`,
          });
          appRow = { id: created.id };
        } catch { throw AppError.conflict('无法创建匹配的申请，请在投递管理中核对岗位'); }
      }
      applicationId = appRow?.id ?? null;
    }
  } else {
    warning = '未识别到公司信息，仅记录邮件内容。';
  }

  const managedSchedule = Boolean(extracted && SCHEDULE_KINDS.includes(extracted.eventType ?? ''));
  if (managedSchedule && !applicationId) throw AppError.validation('请先关联申请，再创建或更新日程');
  const scheduleResult = managedSchedule && applicationId && extracted ? applySchedule(applicationId, id, row.received_at, extracted, options.targetScheduleId, options.expectedScheduleRevision) : null;
  if (scheduleResult?.stale) warning = '旧邮件已留档，未覆盖更新的日程和提醒';
  if (scheduleResult?.cancelled) warning = '日程已取消，已撤销该日程自动生成的未完成提醒';
  const now = nowIso();
  // 保留收件时间，并按事件类型选择真实的事件时间。
  const mailTime = mailTimeToLocal(row.received_at) ?? now;
  const occurredAt = extracted ? timelineTime(extracted, row.received_at) ?? mailTime : mailTime;
  if (extracted?.eventType === 'applied' && applicationId) {
    db.prepare('UPDATE applications SET applied_at = ? WHERE id = ? AND applied_at IS NULL').run(mailTime.slice(0, 10), applicationId);
  }
  // 时间点 → 显示时间点；时间段 → 显示「起-止」
  const windowText = extracted ? eventWindowText(extracted.eventTime, extracted.eventTimeEnd ?? null) : null;
  db.transaction(() => {
    if (applicationId && extracted) {
      for (const task of managedSchedule ? [] : extracted.preparationTasks ?? []) {
        const at = validEventTime(task.scheduledAt);
        if (!at) throw AppError.validation('准备事项时间无效');
        const taskTitle = `准备：${task.title}`;
        if (at > now && !db.prepare('SELECT id FROM reminders WHERE application_id=? AND title=? AND scheduled_at=? AND done=0').get(applicationId, taskTitle, at)) {
          db.prepare("INSERT INTO reminders(application_id,type,title,scheduled_at,done,created_at) VALUES (?,'other',?,?,0,?)").run(applicationId, taskTitle, at, now);
        }
        db.prepare("INSERT INTO timeline_events(application_id,event_type,title,description,occurred_at,created_at) VALUES (?,'note',?,?,?,?)").run(applicationId, taskTitle, task.timeEvidence, at, now);
      }
      const eventLabel = extracted.eventType ? EMAIL_EVENT_LABELS[extracted.eventType] : '邮件';
      const title = `邮件：${extracted.schedule ? {create:'安排',update:'补充',reschedule:'改期',cancel:'取消',restore:'恢复'}[extracted.schedule.action] + ' · ' : ''}${eventLabel}${extracted.positionTitle ? `（${extracted.positionTitle}）` : ''}${windowText ? ` · ${windowText}` : ''}`;
      const description = [
        extracted.summary,
        extracted.schedule ? [extracted.schedule.venue, extracted.schedule.address, extracted.schedule.room].filter(Boolean).join(' · ') : null,
        extracted.schedule?.evidence,
        windowText ? `时间：${windowText}` : null,
        row.subject ? `主题：${row.subject}` : null,
        `收件时间：${mailTime}`,
        `时间依据：${extracted.eventType === 'applied' || extracted.timeSource === 'received' ? '收件时间' : extracted.timeSource === 'attachment' ? '附件' : extracted.timeSource === 'manual' ? '人工确认' : '正文'}`,
        extracted.timeEvidence ? `原文：${extracted.timeEvidence}` : null,
      ]
        .filter(Boolean)
        .join('；');
      const ev = db
        .prepare(
          `INSERT INTO timeline_events (application_id, event_type, from_status, to_status, title, description, occurred_at, created_at)
           VALUES (?, 'note', NULL, NULL, ?, ?, ?, ?)`,
        )
        .run(applicationId, title, description || null, occurredAt, now);
      timelineEvent = {
        id: Number(ev.lastInsertRowid),
        applicationId,
        eventType: 'note',
        fromStatus: null,
        toStatus: null,
        title,
        description: description || null,
        occurredAt,
        createdAt: now,
      };

      // 提醒时间：时间段取开始时间；开始已过但结束未到则取结束时间；都没有则不建提醒
      const remindAt =
        extracted.eventType && extracted.eventTime && extracted.eventTime > now
          ? extracted.eventTime
          : extracted.eventType && extracted.eventTimeEnd && extracted.eventTimeEnd > now
            ? extracted.eventTimeEnd
            : null;
      if (!managedSchedule && extracted.eventType && remindAt) {
        const remType = EMAIL_EVENT_TO_REMINDER_TYPE[extracted.eventType] ?? 'other';
        // 提醒去重：同申请 + 同类型 + 同时间且未完成的提醒不重复创建
        const existingRem = db
          .prepare(
            'SELECT id FROM reminders WHERE application_id = ? AND type = ? AND scheduled_at = ? AND done = 0',
          )
          .get(applicationId, remType, remindAt) as { id: number } | undefined;
        if (existingRem) {
          warning = warning ? `${warning}（提醒已存在，未重复创建）` : '提醒已存在，未重复创建';
        } else {
          const rem = db
            .prepare(
              `INSERT INTO reminders (application_id, type, title, scheduled_at, done, done_at, created_at)
               VALUES (?, ?, ?, ?, 0, NULL, ?)`,
            )
            .run(applicationId, remType, title, remindAt, now);
          reminder = {
            id: Number(rem.lastInsertRowid),
            applicationId,
            type: remType as Reminder['type'],
            title,
            scheduledAt: remindAt,
            done: 0,
            doneAt: null,
            createdAt: now,
          };
        }
      }
    }
    db.prepare(
      "UPDATE email_items SET extracted = ?, status = 'confirmed', application_id = ?, applied_at = ? WHERE id = ?",
    ).run(JSON.stringify(extracted), applicationId, now, id);
  })();

  if (scheduleResult && !scheduleResult.stale && !scheduleResult.cancelled) {
    reminder = db.prepare('SELECT id, application_id applicationId, type, title, scheduled_at scheduledAt, done, done_at doneAt, created_at createdAt FROM reminders WHERE schedule_id=? AND done=0 ORDER BY scheduled_at DESC LIMIT 1').get(scheduleResult.id) as Reminder | undefined ?? null;
  }
  // 状态推进（默认关闭；按邮件事件类型沿「合法流转路径」推进，不绕过状态机）
  const newerMail = applicationId ? (db.prepare("SELECT received_at FROM email_items WHERE application_id = ? AND status = 'confirmed' AND id <> ?").all(applicationId, id) as { received_at: string }[]).some((mail) => new Date(mail.received_at).getTime() > new Date(row.received_at).getTime()) : false;
  if (newerMail) warning = '已补充历史时间线；已有更新的邮件，保留当前申请状态';
  if (options.markApplied && applicationId && !newerMail && !scheduleResult?.stale && (!extracted?.schedule || extracted.schedule.action === 'create' || extracted.schedule.action === 'restore')) {
    const current = db.prepare('SELECT status FROM applications WHERE id = ?').get(applicationId) as
      | { status: AppStatus }
      | undefined;
    if (current) {
      const eventType = extracted?.eventType ?? null;
      const byEvent = eventType ? EMAIL_EVENT_TO_TARGET_STATUS[eventType] : null;
      // other/null 不代表发生投递，不推断状态。
      const desired: AppStatus | null = byEvent ?? null;

      if (!desired || current.status === desired) {
        warning = warning
          ? `${warning}（当前状态「${STATUS_LABELS[current.status]}」已包含该阶段，未改动）`
          : `当前状态「${STATUS_LABELS[current.status]}」已包含该阶段，未改动状态`;
      } else {
        const path = planStatusPath(current.status, desired);
        if (path.length === 0) {
          warning = warning
            ? `${warning}（无法从「${STATUS_LABELS[current.status]}」流转到「${STATUS_LABELS[desired]}」，未改动）`
            : `无法从「${STATUS_LABELS[current.status]}」流转到「${STATUS_LABELS[desired]}」，未改动状态`;
        } else {
          try {
            for (const step of path) {
              const transition = transitionApplication(applicationId, {
                toStatus: step,
                // 状态变更时间同样用邮件时间，保证时间线与看板顺序与真实进度一致
                occurredAt: step === STATUS.APPLIED ? mailTime : occurredAt,
                note: `${step !== desired ? '为满足状态机补充中间阶段（实际发生时间未知）。' : ''}根据邮件「${eventType ? EMAIL_EVENT_LABELS[eventType] : '邮件'}」推进状态${windowText ? `（时间：${windowText}）` : ''}`,
              });
              if (step !== desired) {
                // Preserve the inference as a note, not a dated real-world application event.
                db.prepare("UPDATE timeline_events SET event_type = 'note', from_status = NULL, to_status = NULL, title = ? WHERE id = ?")
                  .run(`阶段补全：${STATUS_LABELS[step]}（实际发生时间未知）`, transition.event.id);
              }
            }
            statusChange = { applicationId, from: current.status, to: desired };
            // 投递日期同样以邮件时间为准：仅在原值为空时补写（不覆盖用户手填的日期）
            if (eventType === 'applied') {
              db.prepare('UPDATE applications SET applied_at = ? WHERE id = ? AND applied_at IS NULL').run(
                mailTime.slice(0, 10),
                applicationId,
              );
            }
          } catch (err) {
            throw AppError.conflict(`状态推进失败，已回滚本次应用：${err instanceof Error ? err.message : '未知错误'}`);
          }
        }
      }
    }

    // 带事件类型但没识别到时间：无法自动生成提醒，明确告知用户
    if (
      extracted?.eventType &&
      extracted.eventType !== 'applied' &&
      extracted.eventType !== 'reject' &&
      !extracted.eventTime &&
      !extracted.eventTimeEnd
    ) {
      warning = warning
        ? `${warning}（未识别到时间，未生成提醒）`
        : '未识别到时间，未生成提醒：可在申请详情手动添加';
    }
  }

  const updated = db.prepare('SELECT * FROM email_items WHERE id = ?').get(id) as EmailItemRow;
  return { item: toItem(updated), timelineEvent, reminder, warning, statusChange };
}

/** All local mutations commit together; a failed match leaves the mail pending. */
export function applyEmailItem(id: number, extractedOverride?: EmailExtraction, options: ApplyOptions = {}) {
  return getDb().transaction(() => applyEmailItemInternal(id, extractedOverride, options))();
}

export function dismissEmailItem(id: number): EmailItem {
  const db = getDb();
  const row = db.prepare('SELECT id, status FROM email_items WHERE id = ?').get(id) as { id: number; status: string } | undefined;
  if (!row) throw AppError.notFound('邮件记录');
  if (row.status !== 'pending') throw AppError.conflict('该邮件已处理');
  db.prepare("UPDATE email_items SET status = 'dismissed' WHERE id = ?").run(id);
  const updated = db.prepare('SELECT * FROM email_items WHERE id = ?').get(id) as EmailItemRow;
  return toItem(updated);
}

export interface ApplyBatchResult {
  applied: number;
  skipped: number;
  results: Array<{ id: number; ok: boolean; message: string }>;
}

/** 批量应用高置信度提取结果（≥ minConfidence），逐条容错（文档 01 F16） */
export function applyEmailBatch(minConfidence = 0.8, options: ApplyOptions = {}): ApplyBatchResult {
  const db = getDb();
  const rows = db
    .prepare("SELECT id, extracted FROM email_items WHERE status = 'pending' ORDER BY received_at ASC, id ASC")
    .all() as { id: number; extracted: string | null }[];

  const results: ApplyBatchResult['results'] = [];
  let applied = 0;
  let skipped = 0;

  for (const row of rows) {
    let extraction: EmailExtraction | null = null;
    try {
      extraction = row.extracted ? (JSON.parse(row.extracted) as EmailExtraction) : null;
    } catch {
      extraction = null;
    }
    if (!extraction || !extraction.timeSource || extraction.timeSource === 'unknown' || extraction.confidence < minConfidence || extraction.reviewReasons?.length || !extraction.company || !extraction.eventType || extraction.eventType === 'other' || (['interview', 'written_test', 'assessment'].includes(extraction.eventType) && !extraction.eventTime && (!extraction.schedule || extraction.schedule.action === 'create'))) {
      skipped++;
      continue;
    }
    try {
      const r = applyEmailItem(row.id, undefined, options);
      applied++;
      results.push({
        id: row.id,
        ok: true,
        message: r.timelineEvent
          ? `已生成时间线笔记${r.reminder ? '与提醒' : ''}${r.statusChange ? `，状态更新为${STATUS_LABELS[r.statusChange.to]}` : ''}${r.warning ? `（${r.warning}）` : ''}`
          : r.warning ?? (r.statusChange ? '已标记为已投递' : '已应用'),
      });
    } catch (err) {
      results.push({ id: row.id, ok: false, message: err instanceof Error ? err.message : '应用失败' });
    }
  }

  return { applied, skipped, results };
}
