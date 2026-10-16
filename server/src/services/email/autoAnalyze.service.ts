import { EMAIL_AUTO_APPLY, EMAIL_AUTO_APPLY_MIN_CONFIDENCE, EMAIL_AUTO_ANALYZE_DAYS, EMAIL_AUTO_ANALYZE_ENABLED, EMAIL_AUTO_ANALYZE_HOURS } from '../../config.js';
import { AppError } from '../../middleware/error.js';
import { getSetting, setSetting } from '../settings.service.js';
import { localIso, nowIso } from '../../utils/time.js';
import { analyzeEmails, applyEmailBatch, isEmailAnalyzing } from './email.service.js';
import { checkExistingEmails } from './check.service.js';

/**
 * 邮件定时分析（默认每天 08:00 / 20:00，本地时区）：
 * - 到点执行：拉取最近 N 天邮件 → 初筛 → AI 提取（无 Key 时规则降级）→ 可选自动应用高置信度结果；
 * - 服务未在运行错过时间点时，启动后首次检查会补跑一次（记在 settings 里，避免重复）。
 */

const LAST_RUN_KEY = 'email.autoAnalyze.lastRunAt';
const LAST_RESULT_KEY = 'email.autoAnalyze.lastResult';

/** 最近一个「已到点」的时间槽（今天某小时；今天还没到则取昨天最后一个时间点） */
export function latestDueSlot(now: Date = new Date(), hours: number[] = EMAIL_AUTO_ANALYZE_HOURS): string | null {
  if (hours.length === 0) return null;
  const sorted = [...hours].sort((a, b) => a - b);
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  for (let i = sorted.length - 1; i >= 0; i--) {
    const slot = new Date(y, m, d, sorted[i], 0, 0, 0);
    if (slot.getTime() <= now.getTime()) return localIso(slot);
  }
  return localIso(new Date(y, m, d - 1, sorted[sorted.length - 1], 0, 0, 0));
}

/** 下一个未来时间槽 */
export function nextSlot(now: Date = new Date(), hours: number[] = EMAIL_AUTO_ANALYZE_HOURS): string | null {
  if (hours.length === 0) return null;
  const sorted = [...hours].sort((a, b) => a - b);
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  for (const h of sorted) {
    const slot = new Date(y, m, d, h, 0, 0, 0);
    if (slot.getTime() > now.getTime()) return localIso(slot);
  }
  return localIso(new Date(y, m, d + 1, sorted[0], 0, 0, 0));
}

/** 是否到期：最后一个时间槽晚于上次执行时间（字符串比较即本地时间比较） */
export function isAutoAnalyzeDue(now: Date = new Date()): boolean {
  if (!EMAIL_AUTO_ANALYZE_ENABLED) return false;
  const slot = latestDueSlot(now);
  if (!slot) return false;
  const last = getSetting(LAST_RUN_KEY);
  return !last || last < slot;
}

export interface AutoAnalyzeStatus {
  running: boolean;
  enabled: boolean;
  hours: number[];
  days: number;
  autoApply: boolean;
  minConfidence: number;
  lastRunAt: string | null;
  lastResult: string | null;
  nextRunAt: string | null;
  due: boolean;
}

export function getAutoAnalyzeStatus(now: Date = new Date()): AutoAnalyzeStatus {
  return {
    running: isEmailAnalyzing(),
    enabled: EMAIL_AUTO_ANALYZE_ENABLED,
    hours: EMAIL_AUTO_ANALYZE_HOURS,
    days: EMAIL_AUTO_ANALYZE_DAYS,
    autoApply: EMAIL_AUTO_APPLY,
    minConfidence: EMAIL_AUTO_APPLY_MIN_CONFIDENCE,
    lastRunAt: getSetting(LAST_RUN_KEY),
    lastResult: getSetting(LAST_RESULT_KEY),
    nextRunAt: EMAIL_AUTO_ANALYZE_ENABLED ? nextSlot(now) : null,
    due: isAutoAnalyzeDue(now),
  };
}

/** 标记一次执行（手动分析也会调用，避免紧接着又自动跑一遍） */
export function markAutoAnalyzeRan(summary: string): void {
  setSetting(LAST_RUN_KEY, nowIso());
  setSetting(LAST_RESULT_KEY, summary);
}

export interface AutoAnalyzeOutcome {
  ran: boolean;
  trigger: 'schedule' | 'catch-up' | 'manual' | 'skipped';
  message: string;
  fetched?: number;
  candidates?: number;
  analyzed?: number;
  skipped?: number;
  applied?: number;
}

/** 执行一次自动分析（含可选自动应用）；无论成功失败都记录时间戳，避免每分钟重试 */
export async function runAutoEmailAnalyze(
  trigger: 'schedule' | 'catch-up' | 'manual',
): Promise<AutoAnalyzeOutcome> {
  if (isEmailAnalyzing()) return { ran: false, trigger: 'skipped', message: '邮件分析正在进行' };
  try {
    const result = await analyzeEmails(EMAIL_AUTO_ANALYZE_DAYS, { includeJunk: true });
    let applied = 0;
    let review = 0;
    let failure = '';
    if (EMAIL_AUTO_APPLY) {
      const batch = applyEmailBatch(EMAIL_AUTO_APPLY_MIN_CONFIDENCE, { markApplied: true, createIfMissing: true });
      applied = batch.applied;
      review = batch.skipped + batch.results.filter(r => !r.ok).length;
      failure = batch.results.find(r => !r.ok)?.message ?? '';
    }
    const summary = `拉取 ${result.fetched} / 候选 ${result.candidates} / 新分析 ${result.analyzed}（去重跳过 ${result.skipped}）/ 自动应用 ${applied} / 待复核 ${review}${failure ? `（${failure}）` : ''}`;
    const checked=checkExistingEmails('apply');
    markAutoAnalyzeRan(`${nowIso().slice(0, 16)} ${trigger} 成功：${summary}；核查修复 ${checked.repaired} 项，待确认 ${checked.review} 项`);
    console.log(`[email-auto] ${trigger} 成功：${summary}`);
    return { ran: true, trigger, message: summary, ...result, applied };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    markAutoAnalyzeRan(`${nowIso().slice(0, 16)} ${trigger} 失败：${message}`);
    if (err instanceof AppError) {
      console.warn('[email-auto] 跳过：', message);
      return { ran: false, trigger: 'skipped', message };
    }
    console.error('[email-auto] 失败：', message);
    throw err;
  }
}
