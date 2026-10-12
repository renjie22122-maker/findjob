import { describe, expect, it } from 'vitest';
import { emailExtractionSchema } from './llm.client.js';

describe('邮件结构化提取 schema（LLM 优先模式）', () => {
  it('接受带 relevant 的模型输出', () => {
    const parsed = emailExtractionSchema.parse({
      relevant: true,
      company: '西门子',
      eventType: 'applied',
      eventTime: null,
      positionTitle: null,
      summary: '感谢投递',
      confidence: 0.9,
    });
    expect(parsed.relevant).toBe(true);
    expect(parsed.eventType).toBe('applied');
  });

  it('支持 relevant=false（与求职无关的邮件）', () => {
    const parsed = emailExtractionSchema.parse({
      relevant: false,
      company: null,
      eventType: null,
      eventTime: null,
      positionTitle: null,
      summary: '账号安全通知',
      confidence: 0.99,
    });
    expect(parsed.relevant).toBe(false);
  });

  it('缺少 relevant 或类型不对时拒绝（避免静默把无关邮件存进来）', () => {
    const base = {
      company: null,
      eventType: null,
      eventTime: null,
      positionTitle: null,
      summary: 'x',
      confidence: 0.5,
    };
    expect(() => emailExtractionSchema.parse(base)).toThrow();
    expect(() => emailExtractionSchema.parse({ ...base, relevant: 'yes' })).toThrow();
  });
});
