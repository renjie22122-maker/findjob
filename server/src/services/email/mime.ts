import { simpleParser } from 'mailparser';
import { load } from 'cheerio';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { redactMailSecrets, sensitiveContentWarnings } from './contentSafety.js';

export interface AttachmentEvidence { name: string; status: 'parsed' | 'skipped'; detail: string }
export interface MailContent { body: string; attachmentText: string; attachments: AttachmentEvidence[]; warnings: string[] }
export const MAX_MESSAGE_BYTES = 8 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;

function htmlText(html: string): string {
  const $ = load(html);
  $('script,style,iframe,object,svg,img,link,meta').remove();
  $('br').replaceWith('\n');
  $('p,div,tr,li').append('\n');
  return $.text();
}

async function extractAttachment(content: Buffer, extension: string): Promise<string> {
  // Built worker is also used by tsx development; build the server once before dev.
  const local = new URL('./attachment.worker.js', import.meta.url);
  const workerUrl = existsSync(local) ? local : new URL('../../../dist/services/email/attachment.worker.js', import.meta.url);
  return new Promise((resolve, reject) => {
    // Separate process: a PDF native-addon crash must never terminate the mailbox server.
    // Only OS runtime variables are inherited; no API keys / mailbox credentials.
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|SystemRoot|WINDIR|TEMP|TMP)$/i.test(key)));
    const child = spawn(process.execPath, ['--max-old-space-size=128', fileURLToPath(workerUrl)], { env, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], serialization: 'advanced' });
    let result: { text?: string; error?: string } | undefined;
    const timer = setTimeout(() => { child.kill(); reject(new Error('附件解析超时')); }, 8000);
    child.once('message', (message) => { result = message as typeof result; });
    child.once('error', () => { clearTimeout(timer); child.kill(); reject(new Error('附件解析失败')); });
    child.once('exit', (code) => {
      clearTimeout(timer);
      if (code !== 0 || !result) reject(new Error('附件解析中断'));
      else if (result.error) reject(new Error(result.error));
      else resolve(result.text ?? '');
    });
    child.send({ content, extension }, error => { if (error) { clearTimeout(timer); child.kill(); reject(new Error('附件解析失败')); } });
  });
}

export async function parseMailContent(source: Buffer): Promise<MailContent> {
  if (source.length > MAX_MESSAGE_BYTES) throw new Error('邮件超过 8 MiB，需人工查看');
  const parsed = await simpleParser(source, { skipHtmlToText: true, skipTextToHtml: true, skipImageLinks: true });
  const rawBody = parsed.text || (parsed.html ? htmlText(parsed.html) : '');
  const result: MailContent = { body: redactMailSecrets(rawBody).slice(0, 16000), attachmentText: '', attachments: [], warnings: sensitiveContentWarnings(rawBody) };
  const sourceText = source.toString('utf8');
  const headers = sourceText.split(/\r?\n\r?\n/, 1)[0].replace(/\r?\n\s+/g, ' ');
  const boundary = /boundary\s*=\s*(?:"([^"]+)"|([^;\s]+))/i.exec(headers);
  if (boundary && !sourceText.includes(`--${boundary[1] ?? boundary[2]}--`)) result.warnings.push('MIME 结束标记缺失，内容可能不完整，需复核');
  if (rawBody.length > 16000) result.warnings.push('正文超过长度限制，已截断，需复核');
  for (const [index, attachment] of parsed.attachments.entries()) {
    const name = redactMailSecrets(attachment.filename || `附件${index + 1}`).slice(0, 120);
    const ext = name.split('.').pop()?.toLowerCase() || '';
    const record: AttachmentEvidence = { name, status: 'skipped', detail: '' };
    result.attachments.push(record);
    if (index >= 5 || attachment.size > MAX_ATTACHMENT_BYTES) {
      record.detail = '超过附件数量（5）或大小（2 MiB）限制';
    } else if (!['pdf', 'docx', 'xlsx', 'xls', 'txt', 'csv', 'ics', 'html', 'htm'].includes(ext)) {
      record.detail = '不支持的附件（图片、压缩包、程序等需人工查看）';
    } else {
      try {
        const text = ['txt', 'csv', 'ics', 'html', 'htm'].includes(ext)
          ? attachment.content.toString('utf8') : await extractAttachment(attachment.content, ext);
        const safe = redactMailSecrets(ext === 'html' || ext === 'htm' ? htmlText(text) : text).trim();
        if (!safe) throw new Error('未提取到文本，可能是扫描件');
        result.warnings.push(...sensitiveContentWarnings(text));
        if (safe.length >= 16000 || result.attachmentText.length + safe.length > 24000) throw new Error('附件文本超过限额，需人工查看');
        result.attachmentText += `\n[附件：${name}]\n${safe}\n`;
        record.status = 'parsed'; record.detail = `已提取 ${safe.length} 字符`;
      } catch (err) { record.detail = err instanceof Error ? err.message : '解析失败'; }
    }
    if (record.status === 'skipped') result.warnings.push(`${name}：${record.detail}`);
  }
  return result;
}
