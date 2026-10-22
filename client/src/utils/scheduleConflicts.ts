import type { RecruitmentSchedule } from '../types';

/** Availability windows and due dates do not reserve the user's whole interval. */
export function schedulesConflict(a: RecruitmentSchedule, b: RecruitmentSchedule): boolean {
  if (a.id === b.id || a.status !== 'scheduled' || b.status !== 'scheduled') return false;
  if ([a.data.timeKind, b.data.timeKind].some(kind => kind === 'window' || kind === 'deadline')) return false;
  const sameTime = a.data.eventTime === b.data.eventTime && (a.data.eventTimeEnd ?? null) === (b.data.eventTimeEnd ?? null);
  if (sameTime && (a.data.sharedWithScheduleId === b.id || b.data.sharedWithScheduleId === a.id ||
    (a.data.sharedWithScheduleId && a.data.sharedWithScheduleId === b.data.sharedWithScheduleId))) return false;
  const startA = Date.parse(a.data.eventTime ?? ''), startB = Date.parse(b.data.eventTime ?? '');
  const endA = Date.parse(a.data.eventTimeEnd ?? a.data.eventTime ?? ''), endB = Date.parse(b.data.eventTimeEnd ?? b.data.eventTime ?? '');
  if (![startA, startB, endA, endB].every(Number.isFinite) || endA < startA || endB < startB) return false;
  return startA === startB || (startA < endB && startB < endA);
}
