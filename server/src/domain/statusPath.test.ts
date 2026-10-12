import { describe, expect, it } from 'vitest';
import type { AppStatus } from './status.js';
import {
  EMAIL_EVENT_TO_REMINDER_TYPE,
  EMAIL_EVENT_TO_TARGET_STATUS,
  STATUS,
  canTransition,
  planStatusPath,
} from './status.js';

describe('事件类型 → 目标状态', () => {
  it('测评/笔试 → 笔试阶段；面试 → 一面；Offer → Offer；拒信 → 已拒绝', () => {
    expect(EMAIL_EVENT_TO_TARGET_STATUS.assessment).toBe(STATUS.WRITTEN_TEST);
    expect(EMAIL_EVENT_TO_TARGET_STATUS.written_test).toBe(STATUS.WRITTEN_TEST);
    expect(EMAIL_EVENT_TO_TARGET_STATUS.interview).toBe(STATUS.INTERVIEW_1);
    expect(EMAIL_EVENT_TO_TARGET_STATUS.offer).toBe(STATUS.OFFER);
    expect(EMAIL_EVENT_TO_TARGET_STATUS.reject).toBe(STATUS.REJECTED);
    expect(EMAIL_EVENT_TO_TARGET_STATUS.applied).toBe(STATUS.APPLIED);
    expect(EMAIL_EVENT_TO_TARGET_STATUS.other).toBeNull();
  });

  it('测评邮件生成的是笔试类提醒（不是 other）', () => {
    expect(EMAIL_EVENT_TO_REMINDER_TYPE.assessment).toBe('written_test');
    expect(EMAIL_EVENT_TO_REMINDER_TYPE.interview).toBe('interview');
  });
});

describe('合法流转路径推导（planStatusPath）', () => {
  it('待投递 → 笔试：自动经过 已投递 与 筛选', () => {
    const path = planStatusPath(STATUS.WISHLIST, STATUS.WRITTEN_TEST);
    expect(path).toEqual([STATUS.APPLIED, STATUS.WRITTEN_TEST]);
    // 每一跳都必须是合法流转
    let current: AppStatus = STATUS.WISHLIST;
    for (const step of path) {
      expect(canTransition(current, step)).toBe(true);
      current = step;
    }
  });

  it('待投递 → Offer：路径合法且以 Offer 结束', () => {
    const path = planStatusPath(STATUS.WISHLIST, STATUS.OFFER);
    expect(path[path.length - 1]).toBe(STATUS.OFFER);
    let current: AppStatus = STATUS.WISHLIST;
    for (const step of path) {
      expect(canTransition(current, step)).toBe(true);
      current = step;
    }
  });

  it('已是同状态或已越过该阶段时返回空路径（不倒退）', () => {
    expect(planStatusPath(STATUS.WRITTEN_TEST, STATUS.WRITTEN_TEST)).toEqual([]);
    // 已到一面时再来一封测评邮件：不倒退
    expect(planStatusPath(STATUS.INTERVIEW_1, STATUS.WRITTEN_TEST)).toEqual([]);
  });

  it('终态不可再流转', () => {
    expect(planStatusPath(STATUS.REJECTED, STATUS.APPLIED)).toEqual([]);
    expect(planStatusPath(STATUS.SIGNED, STATUS.INTERVIEW_1)).toEqual([]);
  });
});
