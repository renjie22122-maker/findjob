/**
 * 邮件时间与「时间窗」工具：
 * 1) 邮件 received_at（IMAP 给的是 UTC ISO）→ 项目统一的本地 ISO，
 *    投递按收件时间；考试、面试按活动时间；Offer 优先正文，否则收件时间。
 * 2) 邮件里只给时间点 → 只显示时间点；给的是时间段（如 19:00-21:00）→ 显示为「起-止」。
 */
import { localIso } from '../../utils/time.js';
import type { EmailExtraction } from '../../domain/types.js';

/** Strict calendar validation, including impossible dates and explicit offsets. */
export function validEventTime(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})?$/.test(value)) return null;
  const [y, m, d, h, min, sec] = value.slice(0, 19).split(/[-T:]/).map(Number);
  if (m < 1 || m > 12 || d < 1 || d > new Date(Date.UTC(y, m, 0)).getUTCDate() || h > 23 || min > 59 || sec > 59) return null;
  return /Z|[+-]\d{2}:\d{2}$/.test(value) ? mailTimeToLocal(value) : value;
}

export function timelineTime(extracted: EmailExtraction, receivedAt: string): string | null {
  if (extracted.eventType === 'applied') return mailTimeToLocal(receivedAt);
  if (['written_test', 'interview', 'assessment'].includes(extracted.eventType ?? '')) return validEventTime(extracted.eventTime);
  if (extracted.eventType === 'offer') return validEventTime(extracted.eventTime) ?? mailTimeToLocal(receivedAt);
  return mailTimeToLocal(receivedAt);
}

/** 邮件时间 → 本地 ISO（YYYY-MM-DDTHH:mm:ss）；无法解析返回 null */
export function mailTimeToLocal(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return localIso(d);
}

/** 展示文本：时间段 → 「2026-10-15 19:00–21:00」；时间点 → 「2026-10-15 19:00」；只精确到日则显示日期 */
export function eventWindowText(start?: string | null, end?: string | null): string | null {
  const s = start ? String(start) : null;
  const e = end ? String(end) : null;
  if (!s && !e) return null;
  const fmt = (v: string) => v.replace('T', ' ').slice(0, 16);
  if (s && e) {
    if (s.slice(0, 10) === e.slice(0, 10) && s.slice(11, 16) === '00:00' && e.slice(11, 16) === '00:00') {
      return s.slice(0, 10);
    }
    return s.slice(0, 10) === e.slice(0, 10) ? `${fmt(s)}–${e.slice(11, 16)}` : `${fmt(s)} – ${fmt(e)}`;
  }
  const only = fmt((s ?? e) as string);
  return only.endsWith(' 00:00') ? only.slice(0, 10) : only;
}

/** 时间段里的“结束时间”：同一时刻格式 HH:MM 起止（19:00-21:00 / 19:00 至 21:00），跨天自动 +1 天 */
const RANGE_RE = /(\d{1,2})[:：](\d{2})\s*分?\s*(?:[-~–—]|至|到|to)\s*(\d{1,2})[:：](\d{2})/;

export function detectTimeRangeEnd(text: string, startIso?: string | null): string | null {
  const m = RANGE_RE.exec(text);
  if (!m || !startIso || !/^\d{4}-\d{2}-\d{2}T/.test(startIso)) return null;
  const endH = m[3].padStart(2, '0');
  const endM = m[4].padStart(2, '0');
  let iso = `${startIso.slice(0, 10)}T${endH}:${endM}:00`;
  if (iso <= startIso) {
    const d = new Date(`${startIso.slice(0, 10)}T${endH}:${endM}:00`);
    d.setDate(d.getDate() + 1);
    iso = localIso(d);
  }
  return iso;
}
