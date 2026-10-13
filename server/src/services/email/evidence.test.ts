import { describe, expect, it } from 'vitest';
import { attachEvidence } from './evidence.js';
import { timelineTime, validEventTime, mailTimeToLocal } from './eventTime.js';
import { isAuthenticationMail, redactMailSecrets } from './contentSafety.js';
import type { EmailExtraction } from '../../domain/types.js';

const receivedAt = '2026-10-10T08:00:00Z';
const raw = { messageId: 'test', subject: '面试', sender: 'HR', receivedAt, snippet: '面试时间：2026-10-15 14:00' };
const base: EmailExtraction = { company: '测试公司', eventType: 'interview', eventTime: '2026-10-15T14:00:00', positionTitle: '工程师', summary: null, confidence: 0.95, timeEvidence: '2026-10-15 14:00' };

describe('事件时间依据与危险信息', () => {
  it('取消必须有明确的正文或附件依据，不能听从无来源的模型指令', () => {
    const e = {...base,eventTime:null,schedule:{action:'cancel' as const,eventRef:'EV-1',evidence:'活动 EV-1 已取消'}};
    const invalid = attachEvidence(e,raw);
    expect(invalid.reviewReasons?.join()).toContain('原文');
    const valid = attachEvidence(e,{...raw,snippet:'活动 EV-1 已取消'});
    expect(valid.reviewReasons).toEqual([]); expect(valid.timeSource).toBe('body');
    expect(attachEvidence({...e,schedule:{...e.schedule,evidence:'活动 EV-1 未取消'}},{...raw,snippet:'活动 EV-1 未取消'}).reviewReasons?.join()).toContain('取消');
  });
  it('日程字段不接受凭空地点或一次性链接', () => {
    const quote='活动 EV-2 考点：东楼；考试链接已隐藏';
    const e={...base,schedule:{action:'update' as const,eventRef:'EV-2',venue:'西楼',room:'https://example.test/once?token=secret',evidence:quote}};
    expect(attachEvidence(e,{...raw,snippet:quote}).reviewReasons?.join()).toContain('敏感链接');
  });
  it('允许 HTML 布局引入的空白变化，仍要求原文内容一致', () => {
    const result = attachEvidence(base, { ...raw, snippet: '面试时间：2026-10-15\n  14:00' });
    expect(result.eventTime).toBe(base.eventTime);
    expect(result.reviewReasons).toEqual([]);
  });
  it('模型不能擅选多考区、编造职位编号或准备事项原文', () => {
    const result = attachEvidence({ ...base, recruitmentId: 'fabricated', preparationTasks: [{title:'预约',scheduledAt:'2026-10-14T09:00:00',timeEvidence:'虚构 09:00'}] }, { ...raw, snippet: `${raw.snippet}\n港澳地区开始时间为15:00。悉尼地区开始时间为18:00。` });
    expect(result.eventTime).toBeNull(); expect(result.recruitmentId).toBeNull(); expect(result.preparationTasks).toEqual([]);
    expect(result.reviewReasons?.join()).toContain('考区');
  });
  it('准备事项日期和时刻必须对应引文，不能凭真实引文伪造另一天', () => {
    const quote = '请于2026年10月14日9:00-10月16日11:00预约';
    const task = {title:'预约截止',scheduledAt:'2026-10-16T11:00:00',timeEvidence:quote};
    expect(attachEvidence({...base,preparationTasks:[task]}, {...raw,snippet:`${raw.snippet}\n${quote}`}).preparationTasks).toHaveLength(1);
    expect(attachEvidence({...base,preparationTasks:[{...task,scheduledAt:'2026-10-18T11:00:00'}]}, {...raw,snippet:`${raw.snippet}\n${quote}`}).preparationTasks).toHaveLength(0);
  });
  it('投递始终使用收件时间，面试保留正文历史或未来时间', () => {
    const applied = attachEvidence({ ...base, eventType: 'applied' }, raw);
    expect(applied.timeSource).toBe('received');
    expect(timelineTime(applied, receivedAt)).toBe(mailTimeToLocal(receivedAt));
    expect(timelineTime(attachEvidence(base, raw), receivedAt)).toBe(base.eventTime);
    expect(attachEvidence(base, raw).reviewReasons).toEqual([]);
  });
  it('附件时间有独立来源，编造的证据不能自动落入时间线', () => {
    const result = attachEvidence(base, { ...raw, snippet: '', content: { body: '', attachmentText: raw.snippet, attachments: [], warnings: [] } });
    expect(result.timeSource).toBe('attachment');
    const invalid = attachEvidence({ ...base, timeEvidence: '虚构的 2026-10-15' }, raw);
    expect(invalid.eventTime).toBeNull();
    expect(invalid.reviewReasons?.length).toBeGreaterThan(0);
  });
  it('Offer 没有明确时间则使用收件时间，缺时间面试不回退', () => {
    expect(attachEvidence({ ...base, eventType: 'offer', eventTime: null }, raw).timeSource).toBe('received');
    expect(timelineTime({ ...base, eventTime: null }, receivedAt)).toBeNull();
  });
  it('拒绝不存在日期和反向时间区间', () => {
    expect(validEventTime('2026-02-30T09:00:00')).toBeNull();
    expect(validEventTime('2026-10-12T24:00:00')).toBeNull();
    expect(attachEvidence({ ...base, eventTimeEnd: '2026-10-14T12:00:00' }, raw).eventTimeEnd).toBeNull();
  });
  it('原文日期与提取日期冲突、只有日期、Offer 入职日期都需复核', () => {
    expect(attachEvidence({ ...base, eventTime: '2026-10-20T14:00:00' }, raw).reviewReasons?.join()).toContain('不一致');
    expect(attachEvidence({ ...base, timeEvidence: '2026-10-15' }, raw).reviewReasons?.join()).toContain('具体时刻');
    const offer = attachEvidence({ ...base, eventType: 'offer', timeEvidence: '入职：2026-10-15 14:00' }, { ...raw, snippet: '入职：2026-10-15 14:00' });
    expect(offer.timeSource).toBe('received');
    expect(offer.eventTime).toBe(mailTimeToLocal(receivedAt));
  });
  it('身份验证邮件在本地跳过，URL 与验证码不发送给 LLM', () => {
    expect(isAuthenticationMail('招聘系统登录验证码')).toBe(true);
    const safe = redactMailSecrets('验证码：123456 https://exam.example/once?token=secret user@example.com');
    expect(safe).not.toMatch(/123456|secret|user@example/);
    expect(safe).toContain('链接已隐藏');
  });
});
