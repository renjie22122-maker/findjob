import { describe, expect, it } from 'vitest';
import { detectTimeRangeEnd, eventWindowText, mailTimeToLocal } from './eventTime.js';
import { localIso } from '../../utils/time.js';

describe('邮件时间（时间线用收件时间）', () => {
  it('UTC 邮件时间 → 本地 ISO', () => {
    const utc = '2026-10-12T09:30:00.000Z';
    expect(mailTimeToLocal(utc)).toBe(localIso(new Date(utc)));
    expect(mailTimeToLocal(utc)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  });

  it('本地 ISO 原样保留；空值/非法值返回 null', () => {
    expect(mailTimeToLocal('2026-10-12T09:30:00')).toBe('2026-10-12T09:30:00');
    expect(mailTimeToLocal(null)).toBeNull();
    expect(mailTimeToLocal('')).toBeNull();
    expect(mailTimeToLocal('not-a-date')).toBeNull();
  });
});

describe('时间点 / 时间段展示', () => {
  it('时间段：同一天显示为「起-止」', () => {
    expect(eventWindowText('2026-10-15T19:00:00', '2026-10-15T21:00:00')).toBe('2026-10-15 19:00–21:00');
  });

  it('时间段：跨天显示完整起止', () => {
    expect(eventWindowText('2026-10-15T23:00:00', '2026-10-16T01:00:00')).toBe(
      '2026-10-15 23:00 – 2026-10-16 01:00',
    );
  });

  it('时间点：只显示时间点；只到日则显示日期', () => {
    expect(eventWindowText('2026-10-15T23:59:00', null)).toBe('2026-10-15 23:59');
    expect(eventWindowText('2026-10-15T00:00:00', null)).toBe('2026-10-15');
  });

  it('无时间返回 null', () => {
    expect(eventWindowText(null, null)).toBeNull();
  });
});

describe('从正文识别时间段结束时间', () => {
  it('客服或预约时间范围不能补成考试结束时间', () => {
    expect(detectTimeRangeEnd('客服工作时间 9:00-19:00', '2026-10-18T15:00:00')).toBeNull();
  });
  it('19:00-21:00 → 同一天 21:00', () => {
    expect(detectTimeRangeEnd('笔试时间 19:00-21:00，请提前登录', '2026-10-15T19:00:00')).toBe(
      '2026-10-15T21:00:00',
    );
  });

  it('中文写法「至」及跨天自动 +1 天', () => {
    expect(detectTimeRangeEnd('测评时段 23:00 至 01:00', '2026-10-15T23:00:00')).toBe('2026-10-16T01:00:00');
  });

  it('没有时间段/没有起始时间则返回 null', () => {
    expect(detectTimeRangeEnd('请在 2026-10-15 前完成', '2026-10-15T19:00:00')).toBeNull();
    expect(detectTimeRangeEnd('19:00-21:00', null)).toBeNull();
  });
});
