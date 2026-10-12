import { describe, it, expect, vi } from 'vitest';

const state = vi.hoisted(() => ({ fetching: false, lockOptions: null as unknown, fetches: [] as unknown[], searches: [] as unknown[] }));
vi.mock('imapflow', () => ({ ImapFlow: class {
  mailbox = { uidValidity: 12345n };
  async connect() {}
  async logout() {}
  async list() { return []; }
  async getMailboxLock(_folder: string, options: unknown) { state.lockOptions = options; return { release() {} }; }
  async search(query: unknown) { state.searches.push(query); return [1, 2]; }
  async *fetch(_uids: number[], query: unknown) {
    state.fetches.push(query); state.fetching = true;
    yield { uid: 1, seq: 1, size: 55, envelope: { subject: '面试通知', date: new Date('2026-09-01T00:00:00Z'), messageId: 'm1' }, internalDate: new Date('2026-10-10T08:00:00Z') };
    yield { uid: 2, seq: 2, size: 100, envelope: { subject: '招聘系统登录验证码', messageId: 'm2' }, internalDate: new Date() };
    state.fetching = false;
  }
  async fetchOne() {
    expect(state.fetching).toBe(false);
    return { source: Buffer.from('Content-Type: text/plain; charset=utf-8\r\n\r\n面试时间：2026年10月15日 14:00') };
  }
} }));

import { fetchRecentEmails, acknowledgeEmail } from './imap.client.js';
describe('IMAP 只读与收件时间', () => {
  it('只读锁、排空 FETCH 后读正文、使用 INTERNALDATE、跳过验证码', async () => {
    const result = await fetchRecentEmails({ host: 'imap.example.com', port: 993, secure: true, user: 'test', folder: 'INBOX', authMode: 'password', password: 'test-only' }, 7, { includeJunk: false });
    expect(state.lockOptions).toEqual({ readOnly: true });
    expect(state.fetches[0]).toMatchObject({ internalDate: true });
    expect(result).toHaveLength(2);
    expect(result[0].receivedAt).toBe('2026-10-10T08:00:00.000Z');
    expect(result[0].snippet).toContain('2026年10月15日 14:00');
    expect(result[1].snippet).toBe(''); // authentication mail is never downloaded
    acknowledgeEmail(result[0]);
    acknowledgeEmail(result[1]);
    const next = await fetchRecentEmails({ host: 'imap.example.com', port: 993, secure: true, user: 'test', folder: 'INBOX', authMode: 'password', password: 'test-only' }, 7, { includeJunk: false });
    expect(state.searches.at(-1)).toEqual({ uid: '3:*' });
    expect(next).toHaveLength(0); // IMAP reverse range semantics cannot replay UID 2
  });
});
