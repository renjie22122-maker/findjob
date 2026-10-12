import type { EmailExtraction } from '../../domain/types.js';
import type { RawEmail } from './imap.client.js';
import { mailTimeToLocal, validEventTime } from './eventTime.js';

/** Confidence alone cannot authorize a dated event: require source evidence. */
export function attachEvidence(extraction: EmailExtraction, raw: RawEmail): EmailExtraction {
  const result = { ...extraction, attachments: raw.content?.attachments ?? [], reviewReasons: [...(raw.content?.warnings ?? [])] };
  result.eventTime = validEventTime(result.eventTime);
  result.eventTimeEnd = validEventTime(result.eventTimeEnd);
  if (result.eventType === 'applied' || result.eventType === 'reject') {
    result.eventTime = mailTimeToLocal(raw.receivedAt);
    result.eventTimeEnd = null; result.timeSource = 'received'; result.timeEvidence = null;
  } else {
    const evidence = result.timeEvidence?.trim();
    const body = raw.content?.body ?? raw.snippet;
    const attachments = raw.content?.attachmentText ?? '';
    const source = evidence && /\d/.test(evidence) ? (body.includes(evidence) ? 'body' : attachments.includes(evidence) ? 'attachment' : null) : null;
    if (result.eventTime && !source) {
      result.eventTime = null; result.eventTimeEnd = null;
      result.reviewReasons.push('模型提供的时间缺少可核对原文，需人工确认');
    }
    result.timeSource = source ?? 'unknown';
    if (source && evidence && result.eventTime) {
      const explicitDate = /(20\d{2})[-年/.](\d{1,2})[-月/.](\d{1,2})/.exec(evidence);
      const date = explicitDate ? `${explicitDate[1]}-${explicitDate[2].padStart(2, '0')}-${explicitDate[3].padStart(2, '0')}` : null;
      if (date && date !== result.eventTime.slice(0, 10)) result.reviewReasons.push('提取日期与原文日期不一致，需复核时区或日期');
      if (['written_test', 'interview', 'assessment'].includes(result.eventType ?? '') && !/\d[:：点时]\d|T\d{6}|\d点/.test(evidence)) result.reviewReasons.push('原文未明确具体时刻，需人工确认活动时间');
      if (result.eventType === 'offer' && /入职|报到|截止|回复|deadline|start date/i.test(evidence)) {
        result.eventTime = null; result.eventTimeEnd = null;
        result.reviewReasons.push('原文可能是报到或回复日期，Offer 时间暂用收件时间');
      }
    }
    if (!result.eventTime && result.eventType === 'offer') {
      result.eventTime = mailTimeToLocal(raw.receivedAt); result.timeSource = 'received';
    }
    if (!result.eventTime && ['written_test', 'interview', 'assessment'].includes(result.eventType ?? '')) {
      result.reviewReasons.push('未确定活动时间，请核对原邮件或附件后填写');
    }
  }
  if (result.eventTimeEnd && (!result.eventTime || result.eventTimeEnd <= result.eventTime)) {
    result.eventTimeEnd = null; result.reviewReasons.push('结束时间不晚于开始时间，需复核');
  }
  if (!result.company || !result.eventType || result.eventType === 'other') result.reviewReasons.push('公司或事件信息不完整，需人工确认');
  result.reviewReasons = [...new Set(result.reviewReasons)];
  return result;
}
