// Explicit opt-in: uses stored IMAP and LLM credentials, reads at most 5 recent mails.
// No email items/applications are changed. Only audit entries / OAuth refresh may be saved.
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (!process.argv.includes('--live')) throw new Error('Pass --live to authorize configured mailbox/API access');
const dataDir = fileURLToPath(new URL('../data/', import.meta.url));
const dbPath = process.env.FINDJOB_DB_PATH || path.join(dataDir, 'findjob.db');
mkdirSync(dataDir, { recursive: true });
const original = new Database(dbPath, { readonly: true });
await original.backup(path.join(dataDir, `before-email-upgrade-${Date.now()}.db`));
original.close();
process.env.IMAP_MAX_SCAN_MESSAGES = '5';
process.env.IMAP_MAX_SNIPPET_DOWNLOADS = '5';
process.env.IMAP_SOCKET_TIMEOUT_MS = '15000';
process.env.EMAIL_AUTO_ANALYZE = '0';
const { getEmailConfig, getLlmConfig } = await import('../dist/services/settings.service.js');
const { fetchRecentEmails } = await import('../dist/services/email/imap.client.js');
const { extractWithLlm, testLlm } = await import('../dist/services/llm/llm.client.js');
const { attachEvidence } = await import('../dist/services/email/evidence.js');
const { isRecruitmentCandidate } = await import('../dist/services/email/filter.js');
const { closeDb } = await import('../dist/db/connection.js');
const report = { mailboxConfigured: Boolean(getEmailConfig()), llmConfigured: Boolean(getLlmConfig()?.apiKey) };
try {
  if (report.llmConfigured && !process.argv.includes('--mail-only')) {
    report.llm = await testLlm();
    if (report.llm.ok) {
      const test = await extractWithLlm('【测试公司】面试邀请', '招聘', '面试时间：2026年10月15日 14:00，岗位：后端工程师。', '2026-10-12T08:00:00Z');
      report.syntheticExtraction = { eventType: test.eventType, eventTime: test.eventTime, hasEvidence: Boolean(test.timeEvidence) };
    }
  }
  if (report.mailboxConfigured) {
    try {
      const mails = await fetchRecentEmails(getEmailConfig(), 7, { includeJunk: false });
      report.mailbox = { fetched: mails.length, decoded: mails.filter((m) => m.snippet).length, attachments: mails.reduce((n, m) => n + (m.content?.attachments.length || 0), 0) };
      report.mailbox.warnings = mails.flatMap((m) => m.content?.warnings ?? []).filter((v) => !v.includes('：'));
      report.realExtractions = [];
      for (const mail of mails.filter((m) => m.snippet && isRecruitmentCandidate(m.subject, m.sender)).slice(0, 2)) {
        if (!report.llm?.ok) break;
        const extracted = attachEvidence(await extractWithLlm(mail.subject, mail.sender, mail.snippet, mail.receivedAt, mail.content?.attachmentText), mail);
        report.realExtractions.push({ relevant: extracted.relevant, eventType: extracted.eventType, timeSource: extracted.timeSource, needsReview: Boolean(extracted.reviewReasons?.length) });
      }
    } catch { report.mailbox = { ok: false, message: 'Mailbox read failed; see local audit. No verification links were opened.' }; }
  }
  console.log(JSON.stringify(report, null, 2));
} finally { closeDb(); }
