import { describe, expect, it } from 'vitest';
import { extractWithRules } from './ruleBased.js';
import { isRecruitmentCandidate } from '../email/filter.js';

describe('本地规则提取（LLM 降级方案）', () => {
  it('中行多地区线下考试不采用客服时间、预约时间或虚构午夜', () => {
    const r = extractWithRules('中国银行统一考试安排通知', '中华英才网', '2026年10月18日举行\n中国内地、港澳地区开始时间为北京时间10月18日15:00。\n悉尼地区开始时间为当地时间10月18日18:00。\n客服工作时间9:00-19:00', '2026-10-13T03:00:00Z');
    expect(r.company).toBe('中国银行股份有限公司'); expect(r.eventType).toBe('written_test');
    expect(r.eventTime).toBeNull(); expect(r.eventTimeEnd).toBeNull();
  });
  it('预约成功线下考试保留活动时间，不使用预约和客服范围', () => {
    const r = extractWithRules('考位预约成功：线下考试', '招聘', '考试时间：2026年10月18日15:00\n客服工作时间9:00-19:00');
    expect(r.eventTime).toBe('2026-10-18T15:00:00'); expect(r.eventTimeEnd).toBeNull();
  });
  it('英文测评登录截止解析 BST 时区和职位编号，不把时长当结束时间', () => {
    const r = extractWithRules('Microsoft invites you to a short coding assessment', 'HackerRank', 'Microsoft Software Engineer China 200000001\nDuration: 75 min\nEnd Login Date/Time: 17 Oct 2026 07:24 AM BST');
    expect(r.company).toBe('Microsoft'); expect(r.recruitmentId).toBe('200000001'); expect(r.eventType).toBe('assessment');
    expect(new Date(r.eventTime!).toISOString()).toBe('2026-10-17T06:24:00.000Z'); expect(r.eventTimeEnd).toBeNull();
  });
  it('识别面试邀请：公司/事件类型/时间', () => {
    const r = extractWithRules('【字节跳动】面试邀请：后端开发工程师', '字节校招 <campus@bytedance.com>', '邀请您于 2025年9月20日 14:00 参加一面面试');
    expect(r.company).toBe('字节跳动');
    expect(r.eventType).toBe('interview');
    expect(r.eventTime).toBe('2025-09-20T14:00:00');
    expect(r.confidence).toBeLessThanOrEqual(0.5);
  });

  it('识别拒信与 Offer', () => {
    const reject = extractWithRules('感谢信', '腾讯招聘 <noreply@tencent.com>', '很遗憾，您未能通过本次面试');
    expect(reject.eventType).toBe('reject');

    const offer = extractWithRules('录用通知', 'HR <hr@corp.com>', '恭喜您获得 Offer');
    expect(offer.eventType).toBe('offer');
  });

  it('时间格式兼容中文日期与时分', () => {
    const r = extractWithRules('笔试通知', 'HR <hr@corp.com>', '笔试时间：2025-09-25 19:30');
    expect(r.eventType).toBe('written_test');
    expect(r.eventTime).toBe('2025-09-25T19:30:00');
  });
});

describe('招聘邮件初筛', () => {
  it('命中关键词的邮件为候选', () => {
    expect(isRecruitmentCandidate('【美团】笔试邀请', 'noreply@meituan.com')).toBe(true);
    expect(isRecruitmentCandidate('您的 Offer 已发放', 'hr@corp.com')).toBe(true);
    expect(isRecruitmentCandidate('感谢信：简历未通过', 'noreply@corp.com')).toBe(true);
  });

  it('无关邮件被过滤', () => {
    expect(isRecruitmentCandidate('您的外卖订单已送达', 'delivery@meituan.com')).toBe(false);
    expect(isRecruitmentCandidate('周末聚会通知', 'friend@qq.com')).toBe(false);
  });
});
