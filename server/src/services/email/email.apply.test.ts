import { describe, expect, it } from 'vitest';
import { getDb } from '../../db/connection.js';
import { nowIso } from '../../utils/time.js';
import { applyEmailItem } from './email.service.js';

interface SeedResult {
  itemId: number;
  companyName: string;
}

/** 直接插入一条待处理邮件（模拟分析结果），避免测试依赖 IMAP */
function seedPendingEmail(companyName: string, eventType: 'applied' | 'other', subject: string): SeedResult {
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO email_items (message_id, subject, sender, received_at, snippet, extracted, status, application_id, created_at, applied_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL, ?, NULL)`,
    )
    .run(
      `test-${companyName}-${Math.random().toString(36).slice(2)}`,
      subject,
      'hr@example.com',
      nowIso(),
      '简历投递成功，请确认职位信息',
      JSON.stringify({
        company: companyName,
        eventType,
        eventTime: null,
        positionTitle: null,
        summary: `${companyName} 投递确认`,
        confidence: 0.9,
      }),
      nowIso(),
    );
  return { itemId: Number(info.lastInsertRowid), companyName };
}

function appStatus(id: number): string | undefined {
  return (getDb().prepare('SELECT status FROM applications WHERE id = ?').get(id) as { status: string } | undefined)?.status;
}

describe('邮件应用：投递确认可推进状态（可选）', () => {
  it('默认（不勾选）只写时间线笔记，不改状态 —— 保持 ADR-7 行为', () => {
    const { itemId } = seedPendingEmail('测试公司默认', 'applied', '感谢投递测试公司默认');
    const result = applyEmailItem(itemId);
    expect(result.statusChange).toBeNull();
    expect(result.warning).toContain('未在库中找到公司');
    expect(getDb().prepare('SELECT COUNT(*) AS c FROM applications').get()).toMatchObject({ c: 0 });
  });

  it('markApplied + createIfMissing：自动建公司/申请，并把状态推进为已投递', () => {
    const { itemId } = seedPendingEmail('测试公司A', 'applied', '【测试公司A】简历投递成功，请确认职位信息');
    const result = applyEmailItem(itemId, undefined, { markApplied: true, createIfMissing: true });

    expect(result.statusChange).toMatchObject({ from: 'WISHLIST', to: 'APPLIED' });
    const appId = result.statusChange!.applicationId;
    expect(appStatus(appId)).toBe('APPLIED');
    expect(result.timelineEvent).not.toBeNull();

    // 时间线应包含：创建记录 + 邮件笔记 + 状态更新
    const titles = (
      getDb().prepare('SELECT title FROM timeline_events WHERE application_id = ? ORDER BY id').all(appId) as {
        title: string;
      }[]
    ).map((r) => r.title);
    expect(titles.some((t) => t.includes('创建投递记录'))).toBe(true);
    expect(titles.some((t) => t.includes('邮件'))).toBe(true);
    expect(titles.some((t) => t.includes('状态更新'))).toBe(true);
  });

  it('同一公司第二封邮件复用已有申请（不重复建单），且不重复改状态', () => {
    const first = seedPendingEmail('测试公司B', 'applied', '【测试公司B】简历投递成功');
    const r1 = applyEmailItem(first.itemId, undefined, { markApplied: true, createIfMissing: true });
    const appId = r1.statusChange!.applicationId;

    const second = seedPendingEmail('测试公司B', 'applied', '【测试公司B】再次投递确认');
    const r2 = applyEmailItem(second.itemId, undefined, { markApplied: true, createIfMissing: true });

    expect(r2.statusChange).toBeNull(); // 已是已投递，不再重复推进
    expect(r2.warning).toContain('未改动');
    expect(getDb().prepare('SELECT COUNT(*) AS c FROM applications WHERE company_id = (SELECT company_id FROM applications WHERE id = ?)').get(appId)).toMatchObject({ c: 1 });
  });

  it('非投递确认邮件同样遵守默认不推进状态', () => {
    const { itemId } = seedPendingEmail('测试公司C', 'other', '【测试公司C】招聘信息');
    const r = applyEmailItem(itemId, undefined, { markApplied: true, createIfMissing: true });
    expect(r.statusChange).toBeNull(); // other 不是投递确认，不能凭空补成已投递
  });
});
