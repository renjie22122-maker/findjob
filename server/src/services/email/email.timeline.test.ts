import { beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../../db/connection.js';
import { applyEmailItem, applyEmailBatch } from './email.service.js';
import { createCompany } from '../companies.service.js';
import { createApplication } from '../applications.service.js';
import { mailTimeToLocal } from './eventTime.js';
import type { EmailExtraction } from '../../domain/types.js';

const base: EmailExtraction = { company: '无回执公司', eventType: 'interview', eventTime: '2026-10-15T14:00:00', positionTitle: '后端工程师', summary: '面试邀请', confidence: 0.95 };
function seed(extracted: EmailExtraction, received = '2026-10-10T08:00:00Z') {
  return Number(getDb().prepare("INSERT INTO email_items (message_id,subject,received_at,extracted,status,created_at) VALUES (?, '通知', ?, ?, 'pending', ?)").run(Math.random().toString(), received, JSON.stringify(extracted), received).lastInsertRowid);
}
beforeEach(() => { closeDb(); getDb(); });

describe('没有投递回执的申请与历史邮件', () => {
  it('首封面试补建申请：投递日期未知，面试时间来自正文', () => {
    const id = seed(base);
    const result = applyEmailItem(id, undefined, { markApplied: true, createIfMissing: true });
    expect(result.timelineEvent?.occurredAt).toBe('2026-10-15T14:00:00');
    expect(result.statusChange?.to).toBe('INTERVIEW_1');
    const app = getDb().prepare('SELECT * FROM applications WHERE id=?').get(result.item.applicationId) as { applied_at: string | null; note: string };
    expect(app.applied_at).toBeNull();
    expect(app.note).toContain('实际投递日期未知');
  });
  it('后续补入早期投递回执只补日期，不回退面试状态', () => {
    const interview = applyEmailItem(seed(base), undefined, { markApplied: true, createIfMissing: true });
    const received = '2026-10-01T08:00:00Z';
    const applied = applyEmailItem(seed({ ...base, eventType: 'applied', eventTime: '2026-10-20T14:00:00' }, received), undefined, { markApplied: true, createIfMissing: true });
    expect(applied.item.applicationId).toBe(interview.item.applicationId);
    expect(applied.timelineEvent?.occurredAt).toBe(mailTimeToLocal(received));
    expect(applied.statusChange).toBeNull();
    expect(getDb().prepare('SELECT status, applied_at FROM applications WHERE id=?').get(applied.item.applicationId)).toEqual({ status: 'INTERVIEW_1', applied_at: mailTimeToLocal(received)!.slice(0, 10) });
  });
  it('同公司多岗位不猜测，失败时保持待处理且不留下时间线', () => {
    const company = createCompany({ name: base.company! });
    createApplication({ companyId: company.id, positionTitle: '前端' });
    createApplication({ companyId: company.id, positionTitle: '后端' });
    const id = seed({ ...base, positionTitle: null });
    expect(() => applyEmailItem(id, undefined, { markApplied: true, createIfMissing: true })).toThrow('多个匹配岗位');
    expect(getDb().prepare('SELECT status FROM email_items WHERE id=?').get(id)).toEqual({ status: 'pending' });
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM timeline_events WHERE title LIKE '邮件：%'").get()).toEqual({ n: 0 });
  });
  it('笔试没有活动时间不使用收件时间代替；高置信度也跳过', () => {
    const id = seed({ ...base, eventType: 'written_test', eventTime: null });
    expect(applyEmailBatch(0.8, { createIfMissing: true }).applied).toBe(0);
    expect(() => applyEmailItem(id, undefined, { createIfMissing: true })).toThrow('活动时间');
  });
  it('单封重复应用不会重复生成时间线或提醒', () => {
    const id = seed(base);
    applyEmailItem(id, undefined, { createIfMissing: true });
    expect(() => applyEmailItem(id, undefined, { createIfMissing: true })).toThrow('已处理');
  });
});
