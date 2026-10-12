import { describe, expect, it } from 'vitest';
import { isRecruitmentCandidate } from './filter.js';

describe('招聘邮件初筛（放宽后）', () => {
  it('识别旧规则漏掉的真实案例：西门子「感谢您的申请」', () => {
    expect(
      isRecruitmentCandidate(
        '感谢您的申请，Renjie Thanks for your application, Renjie',
        'Siemens P&O Talent Acquisition <talent-acquisition@siemens.example.com>',
      ),
    ).toBe(true);
  });

  it('识别英文招聘邮件与 ATS 平台发件人', () => {
    expect(isRecruitmentCandidate('Thank you for your application!', 'Microsoft Careers <donotreply@email.example.com>')).toBe(true);
    expect(isRecruitmentCandidate('Your application status', 'no-reply@mokahr.com')).toBe(true);
    expect(isRecruitmentCandidate('Interview invitation', 'recruiting@greenhouse.io')).toBe(true);
    expect(isRecruitmentCandidate('邮箱验证', 'campus@quickmail.51job.com')).toBe(true);
  });

  it('识别中文招聘关键场景', () => {
    expect(isRecruitmentCandidate('【网易招聘】简历投递成功，请确认职位信息', 'NetEase_HR <ehr@service.netease.com>')).toBe(true);
    expect(isRecruitmentCandidate('恭喜你通过第一轮筛选，请查收线上测评链接', "L'Oréal Campus <no-reply@service.example.com>")).toBe(true);
    expect(isRecruitmentCandidate('关于笔试安排的通知', 'noreply@example.com')).toBe(true);
  });

  it('大小写不敏感（英文关键词不再依赖手工枚举 Offer/OFFER/offer）', () => {
    expect(isRecruitmentCandidate('OFFER LETTER attached', 'hr@example.com')).toBe(true);
    // 设计：单个弱关键词不足以判定（防误报），≥2 个弱关键词才通过
    expect(isRecruitmentCandidate('Screening result', 'someone@example.com')).toBe(false);
    expect(isRecruitmentCandidate('Screening result for your Application', 'someone@example.com')).toBe(true);
  });

  it('不误报常见非招聘邮件', () => {
    expect(isRecruitmentCandidate('Your new Azure account is ready', 'Microsoft Azure <azure-noreply@microsoft.com>')).toBe(false);
    expect(isRecruitmentCandidate('New sign-in detected for your Microsoft account', 'Microsoft account team <account-security@microsoft.com>')).toBe(false);
    expect(isRecruitmentCandidate('您的话费账单通知', 'service@example.com')).toBe(false);
    expect(isRecruitmentCandidate('限时优惠 5 折', 'promo@shop.example.com')).toBe(false);
  });
});
