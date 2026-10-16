import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./imap.client.js', () => ({ fetchRecentEmails: vi.fn(), acknowledgeEmail: vi.fn(), testEmailConnection: vi.fn() }));
vi.mock('../llm/llm.client.js', () => ({ extractWithLlm: vi.fn() }));
import { fetchRecentEmails, acknowledgeEmail } from './imap.client.js';
import { extractWithLlm } from '../llm/llm.client.js';
import { analyzeEmails, listEmailItems } from './email.service.js';
import { closeDb } from '../../db/connection.js';
import { setEmailConfig, setLlmConfig } from '../settings.service.js';
import {getEmailCheckState} from './check.service.js';

const raw = { messageId: 'same-message', subject: '【测试公司】投递成功', sender: '招聘', receivedAt: '2026-10-12T08:00:00Z', snippet: '我们已收到您的投递。' };
const extraction = { relevant: true, company: '测试公司', eventType: 'applied' as const, eventTime: null, positionTitle: '后端', summary: '投递确认', confidence: 0.95 };
beforeEach(() => {
  vi.clearAllMocks(); closeDb();
  setEmailConfig({ host: 'imap.example.com', port: 993, secure: true, folder: 'INBOX', user: 'test', password: 'test-only', authMode: 'password' });
  setLlmConfig({ baseUrl: 'https://example.com', apiKey: 'test-only', model: 'test' });
});
describe('分析去重与重分析', () => {
  it('重复邮件仅调用一次模型，第二次扫描提供已知 ID 跳过正文', async () => {
    vi.mocked(fetchRecentEmails).mockResolvedValue([raw, raw]);
    vi.mocked(extractWithLlm).mockResolvedValue(extraction);
    expect((await analyzeEmails(7)).analyzed).toBe(1);
    expect(getEmailCheckState().runs).toHaveLength(1);
    expect(extractWithLlm).toHaveBeenCalledTimes(1);
    await analyzeEmails(7);
    expect(extractWithLlm).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetchRecentEmails).mock.calls.at(-1)?.[2]?.knownMessageIds?.has(raw.messageId)).toBe(true);
    expect(acknowledgeEmail).toHaveBeenCalledTimes(4);
  });
  it('无关邮件跨文件夹与下一轮都不重复调用模型', async () => {
    vi.mocked(fetchRecentEmails).mockResolvedValue([raw, raw]);
    vi.mocked(extractWithLlm).mockResolvedValue({ ...extraction, relevant: false });
    await analyzeEmails(7); await analyzeEmails(7);
    expect(extractWithLlm).toHaveBeenCalledTimes(1);
    expect(listEmailItems().total).toBe(0);
  });
  it('重分析将原先待处理但实际无关的邮件移入已忽略', async () => {
    vi.mocked(fetchRecentEmails).mockResolvedValue([raw]);
    vi.mocked(extractWithLlm).mockResolvedValue(extraction);
    await analyzeEmails(7);
    vi.mocked(extractWithLlm).mockResolvedValue({ ...extraction, relevant: false });
    await analyzeEmails(7, { reanalyzePending: true });
    expect(listEmailItems({ status: 'pending' }).total).toBe(0);
    expect(listEmailItems({ status: 'dismissed' }).total).toBe(1);
  });
});
