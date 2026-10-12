import { ImapFlow } from 'imapflow';
import { createHash } from 'node:crypto';
import {
  EMAIL_FETCH_BUDGET_MS,
  IMAP_DEBUG,
  IMAP_FETCH_BATCH,
  IMAP_MAX_SCAN_MESSAGES,
  IMAP_MAX_SNIPPET_DOWNLOADS,
  IMAP_SOCKET_TIMEOUT_MS,
} from '../../config.js';
import { AppError } from '../../middleware/error.js';
import type { EmailConfig } from '../settings.service.js';
import { getSetting, setSetting } from '../settings.service.js';
import { ensureFreshAccessToken } from '../oauth2/outlook.js';
import { auditTimer } from '../audit.service.js';
import { MAX_MESSAGE_BYTES, parseMailContent, type MailContent } from './mime.js';
import { isAuthenticationMail, redactMailSecrets } from './contentSafety.js';

export interface RawEmail {
  messageId: string;
  subject: string;
  sender: string;
  receivedAt: string;
  snippet: string;
  content?: MailContent;
  cursor?: { key: string; uid: number };
}

export interface FetchEmailsOptions {
  /** 是否同时扫描垃圾邮件文件夹（默认 true：招聘通知常被误判为垃圾） */
  includeJunk?: boolean;
  fullRescan?: boolean;
  knownMessageIds?: Set<string>;
}

/** Cursor contains only a UID, scoped to account, folder and UIDVALIDITY. */
export function acknowledgeEmail(email: RawEmail): void {
  if (!email.cursor) return;
  const previous = Number(getSetting(email.cursor.key) ?? 0);
  if (email.cursor.uid > previous) setSetting(email.cursor.key, String(email.cursor.uid));
}

interface AuthConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass?: string; accessToken?: string };
  logger: false;
}

/** 构建 imapflow 连接配置（纯函数，便于单测）：oauth2 模式用 XOAUTH2 access token */
export function buildAuthConfig(cfg: EmailConfig, oauth2AccessToken?: string): AuthConfig {
  if (cfg.authMode === 'oauth2') {
    if (!oauth2AccessToken) throw AppError.validation('Outlook 授权已失效，请在设置页重新连接');
    return {
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, accessToken: oauth2AccessToken },
      logger: false,
    };
  }
  if (!cfg.password) throw AppError.validation('请先在设置页配置邮箱授权码');
  return {
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.password },
    logger: false,
  };
}

async function resolveAuth(cfg: EmailConfig): Promise<AuthConfig> {
  if (cfg.authMode === 'oauth2') {
    const token = await ensureFreshAccessToken(); // 过期自动刷新
    return buildAuthConfig(cfg, token?.accessToken);
  }
  return buildAuthConfig(cfg);
}

/** 可选的 imapflow 命令级日志（IMAP_DEBUG=1 时启用），用于定位“命令发出但上游不回包” */
function makeImapLogger() {
  // Never emit protocol payloads: even debug logs may contain AUTH or message text.
  const dump = (prefix: string, _obj: unknown) => console.log(prefix, 'IMAP protocol event');
  return {
    debug: (obj: unknown) => dump('[imapflow]', obj),
    info: (obj: unknown) => dump('[imapflow]', obj),
    warn: (obj: unknown) => dump('[imapflow:warn]', obj),
    error: (obj: unknown) => dump('[imapflow:error]', obj),
  };
}

/** 垃圾邮件文件夹命名（不同服务商/语言） */
const JUNK_FOLDER_PATTERN = /junk|spam|垃圾/i;

/** 待扫描文件夹：主文件夹 + （可选）垃圾箱；列目录失败时只扫主文件夹 */
export async function resolveFolders(
  client: ImapFlow,
  cfg: EmailConfig,
  includeJunk: boolean,
): Promise<string[]> {
  const primary = cfg.folder || 'INBOX';
  if (!includeJunk) return [primary];
  try {
    const boxes = await client.list();
    const extra = boxes
      .map((b) => b.path)
      .filter((p) => p !== primary && JUNK_FOLDER_PATTERN.test(p));
    return [primary, ...extra];
  } catch {
    return [primary];
  }
}

/**
 * 取单封邮件的正文摘要：用「部分 SOURCE 拉取」（maxLength）代替 BODYSTRUCTURE + download。
 * Outlook.com 对 BODYSTRUCTURE 这类重命令会不响应，靠分体拉取反而稳定。
 */
/** 拉取单个文件夹：SEARCH 取最近 N 封 UID → 分批 FETCH 只拉 ENVELOPE → 少量正文摘要 */
async function fetchFolder(
  client: ImapFlow,
  folder: string,
  days: number,
  cfg: EmailConfig,
  options: FetchEmailsOptions,
): Promise<{ emails: RawEmail[]; withoutSnippet: number }> {
  const lock = await client.getMailboxLock(folder, { readOnly: true });
  try {
    const since = new Date(Date.now() - days * 86400_000);
    const validity = client.mailbox && client.mailbox.uidValidity ? String(client.mailbox.uidValidity) : null;
    const cursorKey = validity ? `email.uid.${createHash('sha256').update(JSON.stringify([cfg.host, cfg.user, folder, validity])).digest('hex')}` : null;
    const lastUid = options.fullRescan || !cursorKey ? 0 : Number(getSetting(cursorKey) ?? 0);
    const found = await client.search(lastUid > 0 ? { uid: `${lastUid + 1}:*` } : { since }, { uid: true });
    // Oldest unseen first, so capped batches never jump over unprocessed messages.
    const available = (Array.isArray(found) ? found : []).filter((uid) => uid > lastUid).sort((a, b) => a - b);
    const uids = options.fullRescan ? available.slice(-IMAP_MAX_SCAN_MESSAGES) : available.slice(0, Math.min(IMAP_MAX_SCAN_MESSAGES, Math.max(1, IMAP_MAX_SNIPPET_DOWNLOADS)));
    if (uids.length === 0) return { emails: [], withoutSnippet: 0 };

    const emails: RawEmail[] = [];
    let snippetDownloads = 0;
    let withoutSnippet = 0;
    const startedAt = Date.now();

    // 分批抓取：上游对“一次要一大批 UID”的重命令可能不回包，小批更稳
    const batches: number[][] = [];
    for (let i = 0; i < uids.length; i += IMAP_FETCH_BATCH) {
      batches.push(uids.slice(i, i + IMAP_FETCH_BATCH));
    }

    for (const batch of batches) {
      // Drain FETCH before issuing another command: nested fetchOne deadlocks ImapFlow.
      const messages = [];
      for await (const msg of client.fetch(batch, { envelope: true, uid: true, internalDate: true, size: true }, { uid: true })) messages.push(msg);
      for (const msg of messages.sort((a, b) => a.uid - b.uid)) {
        if (!msg.envelope) throw new Error('邮件头读取不完整，保留游标等待重试');
        const uid = typeof msg.uid === 'number' ? msg.uid : null;
        const messageId = msg.envelope.messageId ?? `fallback:${folder}:${validity}:${uid ?? msg.seq}`;
        const alreadyKnown = options.knownMessageIds?.has(messageId) || isAuthenticationMail(msg.envelope.subject ?? '');
        let snippet = '';
        let content: MailContent = { body: '', attachmentText: '', attachments: [], warnings: [] };
        const missingReceiptTime = !msg.internalDate;

        const withinBudget = Date.now() - startedAt < EMAIL_FETCH_BUDGET_MS;
        if (!alreadyKnown && uid !== null && snippetDownloads < IMAP_MAX_SNIPPET_DOWNLOADS && withinBudget && (msg.size ?? Infinity) <= MAX_MESSAGE_BYTES) {
          snippetDownloads++;
          try {
            // Socket timeout terminates stalled commands; do not leave an orphan FETCH queued.
            const source = await client.fetchOne(String(uid), { source: { maxLength: MAX_MESSAGE_BYTES + 1 } }, { uid: true });
            if (process.env.EMAIL_DIAGNOSTICS === '1') console.log('[mail-read-metrics]', { expectedBytes: msg.size, downloadedBytes: source && source.source ? source.source.length : 0 });
            // Exchange may synthesize MIME whose length differs from RFC822.SIZE.
            // Validate the bounded source and MIME closing boundary, not size equality.
            if (!source || !source.source?.length) throw new Error('正文为空');
            content = await parseMailContent(source.source);
            snippet = content.body;
          } catch (err) {
            if (process.env.EMAIL_DIAGNOSTICS === '1') console.log('[mail-read-error]', { name: err instanceof Error ? err.name : 'Unknown', code: (err as { code?: string })?.code });
            snippet = '';
            content.warnings.push('正文或附件读取失败，需要重试或人工复核');
          }
        } else if (!alreadyKnown) {
          content.warnings.push('邮件超出本轮下载预算或 8 MiB 大小限制，未解析正文和附件');
        }
        if (!snippet) withoutSnippet++;
        if (missingReceiptTime) content.warnings.push('服务器未返回收件时间，暂用邮件日期，需人工确认');

        emails.push({
          messageId,
          subject: redactMailSecrets(msg.envelope.subject ?? '(无主题)'),
          sender: msg.envelope.from?.length
            ? `${msg.envelope.from[0].name ?? ''} <${msg.envelope.from[0].address ?? ''}>`
            : '(未知发件人)',
          receivedAt: (msg.internalDate instanceof Date ? msg.internalDate : new Date(msg.internalDate || msg.envelope.date || Date.now())).toISOString(),
          snippet,
          content,
          ...(cursorKey && uid !== null && !options.fullRescan ? { cursor: { key: cursorKey, uid } } : {}),
        });
      }
    }
    return { emails, withoutSnippet };
  } finally {
    lock.release();
  }
}

/**
 * 单次拉取（由上层重试）：扫描主文件夹（+ 可选垃圾箱），合并去重。
 * 不再请求 BODYSTRUCTURE（重量级且在上游容易挂住），所有重活都有上限与超时。
 */
async function fetchOnce(
  cfg: EmailConfig,
  days: number,
  options: FetchEmailsOptions,
): Promise<{ emails: RawEmail[]; withoutSnippet: number; folders: string[] }> {
  const client = new ImapFlow({
    ...(await resolveAuth(cfg)),
    socketTimeout: IMAP_SOCKET_TIMEOUT_MS,
    connectionTimeout: IMAP_SOCKET_TIMEOUT_MS,
    greetingTimeout: IMAP_SOCKET_TIMEOUT_MS,
    ...(IMAP_DEBUG ? { logger: makeImapLogger() } : {}),
  });
  try {
    await client.connect();
    const folders = await resolveFolders(client, cfg, options.includeJunk ?? true);
    const merged: RawEmail[] = [];
    const seen = new Set<string>();
    let withoutSnippet = 0;

    for (const folder of folders) {
      const part = await fetchFolder(client, folder, days, cfg, { ...options, knownMessageIds: new Set([...(options.knownMessageIds ?? []), ...seen]) });
      withoutSnippet += part.withoutSnippet;
      for (const email of part.emails) {
        seen.add(email.messageId);
        merged.push(email);
      }
    }
    return { emails: merged, withoutSnippet, folders };
  } finally {
    await client.logout().catch(() => undefined);
  }
}

/** 拉取最近 N 天邮件（失败自动重试一次），记录出站审计 */
export async function fetchRecentEmails(
  cfg: EmailConfig,
  days: number,
  options: FetchEmailsOptions = {},
): Promise<RawEmail[]> {
  const timer = auditTimer({
    kind: 'imap',
    target: `${cfg.host}:${cfg.port}（${cfg.folder || 'INBOX'}）`,
    detail: `账号=${cfg.user}；拉取最近 ${days} 天邮件（最多 ${IMAP_MAX_SCAN_MESSAGES} 封${options.includeJunk === false ? '' : '，含垃圾箱'}）`,
  });

  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { emails, withoutSnippet, folders } = await fetchOnce(cfg, days, options);
      timer.ok(
        `拉取 ${emails.length} 封（${folders.join('+')}）${withoutSnippet ? `（${withoutSnippet} 封无正文摘要）` : ''}${attempt > 1 ? '（重试后成功）' : ''}`,
      );
      return emails;
    } catch (err) {
      lastError = err;
      if (err instanceof AppError) {
        timer.fail(err.message);
        throw err;
      }
      if (attempt === 1) {
        // 记录原始错因（命令名/响应/堆栈），便于排查上游行为（如限流、半开连接）
        console.error('[imap] 拉取失败，准备重试（上游响应不写入日志）');
        // 上游首连无响应/被抑断时，重建会话再试一次
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } else {
        console.error('[imap] 重试后仍失败');
      }
    }
  }

  const message = lastError instanceof Error && lastError.message.toLowerCase().includes('auth') ? '邮箱认证失败，请检查授权配置' : '邮箱连接或读取失败';
  timer.fail(message);
  throw AppError.badGateway(`邮件拉取失败：${message}（常见于邮箱服务商限流或连接中断，可稍后重试或缩短分析天数）`);
}

/** 测试 IMAP 连接（设置页「测试连接」，两种认证模式通用），记录出站审计 */
export async function testEmailConnection(cfg: EmailConfig): Promise<{ ok: boolean; message: string }> {
  const timer = auditTimer({
    kind: 'imap',
    target: `${cfg.host}:${cfg.port}（${cfg.folder || 'INBOX'}）`,
    detail: `账号=${cfg.user}；测试连接`,
  });
  try {
    const client = new ImapFlow({ ...(await resolveAuth(cfg)), connectionTimeout: IMAP_SOCKET_TIMEOUT_MS, greetingTimeout: IMAP_SOCKET_TIMEOUT_MS, socketTimeout: IMAP_SOCKET_TIMEOUT_MS });
    try {
      await client.connect();
      const status = await client.status(cfg.folder || 'INBOX', { messages: true });
      timer.ok(`连接成功，收件箱 ${status.messages} 封`);
      return { ok: true, message: `连接成功，收件箱共 ${status.messages} 封邮件` };
    } finally {
      await client.logout().catch(() => undefined);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    timer.fail(msg);
    return { ok: false, message: `连接失败：${msg}` };
  }
}
