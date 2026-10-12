import { describe, expect, it, vi } from 'vitest';
import { parseMailContent } from './mime.js';

describe('MIME 与附件解析', () => {
  it('解码 Base64 中文正文，保留正文尾部的时间', async () => {
    const body = '面试通知\n' + '正文'.repeat(1000) + '\n2026年10月16日 14:00';
    const result = await parseMailContent(Buffer.from('Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n' + Buffer.from(body).toString('base64')));
    expect(result.body).toContain('2026年10月16日 14:00');
  });
  it('本地解析 HTML 和日历附件，不请求一次性链接或远程图片', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network forbidden'));
    try {
      const source = ['MIME-Version: 1.0', 'Content-Type: multipart/mixed; boundary=test', '', '--test', 'Content-Type: text/html; charset=utf-8', '', '<p>面试</p><img src="https://tracking.invalid/pixel"><a href="https://exam.invalid/once?token=secret">确认面试</a>', '--test', 'Content-Type: text/calendar; charset=utf-8', 'Content-Disposition: attachment; filename="interview.ics"', '', 'BEGIN:VCALENDAR\r\nDTSTART:20261016T060000Z\r\nEND:VCALENDAR', '--test', 'Content-Type: application/octet-stream', 'Content-Disposition: attachment; filename="run.exe"', '', 'DO NOT EXECUTE', '--test--'].join('\r\n');
      const result = await parseMailContent(Buffer.from(source));
      expect(result.body).toContain('确认面试');
      expect(result.body).not.toContain('secret');
      expect(result.attachmentText).toContain('20261016T060000Z');
      expect(result.attachments[0].status).toBe('parsed');
      expect(result.attachments[1].status).toBe('skipped');
      expect(fetch).not.toHaveBeenCalled();
    } finally { fetch.mockRestore(); }
  });
});
