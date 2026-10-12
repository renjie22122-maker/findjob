import { describe, expect, it } from 'vitest';
import { getSetting, setSetting } from '../settings.service.js';
import { isAutoAnalyzeDue, latestDueSlot, nextSlot } from './autoAnalyze.service.js';

describe('定时分析时间槽', () => {
  const hours = [8, 20];

  it('最近已到点的时间槽', () => {
    // 07:30 → 还没到今天 8 点 → 取昨天 20:00
    expect(latestDueSlot(new Date(2026, 9, 12, 7, 30, 0), hours)).toBe('2026-10-11T20:00:00');
    // 09:00 → 今天 8:00
    expect(latestDueSlot(new Date(2026, 9, 12, 9, 0, 0), hours)).toBe('2026-10-12T08:00:00');
    // 21:00 → 今天 20:00
    expect(latestDueSlot(new Date(2026, 9, 12, 21, 0, 0), hours)).toBe('2026-10-12T20:00:00');
    // 正好 20:00 → 今天 20:00
    expect(latestDueSlot(new Date(2026, 9, 12, 20, 0, 0), hours)).toBe('2026-10-12T20:00:00');
  });

  it('下一个未来时间槽（跨天）', () => {
    expect(nextSlot(new Date(2026, 9, 12, 7, 30, 0), hours)).toBe('2026-10-12T08:00:00');
    expect(nextSlot(new Date(2026, 9, 12, 9, 0, 0), hours)).toBe('2026-10-12T20:00:00');
    expect(nextSlot(new Date(2026, 9, 12, 21, 0, 0), hours)).toBe('2026-10-13T08:00:00');
  });

  it('无时间点配置时返回 null（不触发）', () => {
    expect(latestDueSlot(new Date(2026, 9, 12, 9, 0, 0), [])).toBeNull();
    expect(nextSlot(new Date(2026, 9, 12, 9, 0, 0), [])).toBeNull();
  });
});

describe('是否到期（含“服务未运行错过时段”的补跑判定）', () => {
  const now = new Date(2026, 9, 12, 9, 0, 0); // 今天 09:00，槽位 = 08:00

  it('从未执行过 → 到期', () => {
    setSetting('email.autoAnalyze.lastRunAt', '');
    expect(isAutoAnalyzeDue(now)).toBe(true);
  });

  it('上次执行早于最近槽位（服务当时没运行）→ 需要补跑', () => {
    setSetting('email.autoAnalyze.lastRunAt', '2026-10-11T20:00:00');
    expect(isAutoAnalyzeDue(now)).toBe(true);
  });

  it('本时段已执行过 → 不重复执行', () => {
    setSetting('email.autoAnalyze.lastRunAt', '2026-10-12T08:00:00');
    expect(isAutoAnalyzeDue(now)).toBe(false);
  });

  it('手动分析后也会写入时间戳，避免紧接着又自动跑', () => {
    setSetting('email.autoAnalyze.lastRunAt', '2026-10-12T08:30:00');
    expect(getSetting('email.autoAnalyze.lastRunAt')).toBe('2026-10-12T08:30:00');
    expect(isAutoAnalyzeDue(now)).toBe(false);
  });
});
