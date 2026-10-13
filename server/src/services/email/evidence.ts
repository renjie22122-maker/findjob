import type { EmailExtraction } from '../../domain/types.js';
import type { RawEmail } from './imap.client.js';
import { mailTimeToLocal, validEventTime } from './eventTime.js';

/** Confidence alone cannot authorize a dated event: require source evidence. */
export function attachEvidence(extraction: EmailExtraction, raw: RawEmail): EmailExtraction {
  const result = { ...extraction, attachments: raw.content?.attachments ?? [], reviewReasons: [...(raw.content?.warnings ?? [])] };
  const sourceText = `${raw.subject}\n${raw.content?.body ?? raw.snippet}\n${raw.content?.attachmentText ?? ''}`;
  if ((sourceText.match(/地区[^\n。]{0,40}开始时间/g) ?? []).length > 1) {
    result.eventTime = null; result.eventTimeEnd = null;
    result.reviewReasons.push('包含多个地区的考试时间，请选择本人考区后确认');
  }
  if (result.recruitmentId && !sourceText.includes(result.recruitmentId)) {
    result.recruitmentId = null;
    result.reviewReasons.push('职位编号未在原文出现，需确认申请关联');
  }
  result.preparationTasks = (result.preparationTasks ?? []).filter(task => {
    const valid = validEventTime(task.scheduledAt);
    const quote = task.timeEvidence?.replace(/\s+/gu, '');
    const dates = [...(quote ?? '').matchAll(/(?<![\d:：])(?:(20\d{2})[-年/.])?(\d{1,2})[-月/.](\d{1,2})(?!\d)/g)];
    const dateMatches = valid && dates.some(m => (!m[1] || m[1] === valid.slice(0, 4)) && Number(m[2]) === Number(valid.slice(5, 7)) && Number(m[3]) === Number(valid.slice(8, 10)));
    const clockMatches = valid && [...(quote ?? '').matchAll(/(\d{1,2})[:：](\d{2})/g)].some(m => Number(m[1]) === Number(valid.slice(11, 13)) && m[2] === valid.slice(14, 16));
    if (!valid || !quote || !sourceText.replace(/\s+/gu, '').includes(quote) || !dateMatches || !clockMatches) {
      result.reviewReasons.push('准备事项缺少有效时间或原文依据，未创建该提醒');
      return false;
    }
    task.scheduledAt = valid;
    return true;
  });
  result.eventTime = validEventTime(result.eventTime);
  result.eventTimeEnd = validEventTime(result.eventTimeEnd);
  if (result.eventType === 'applied' || result.eventType === 'reject') {
    result.eventTime = mailTimeToLocal(raw.receivedAt);
    result.eventTimeEnd = null; result.timeSource = 'received'; result.timeEvidence = null;
  } else {
    const evidence = result.timeEvidence?.trim();
    const body = raw.content?.body ?? raw.snippet;
    const attachments = raw.content?.attachmentText ?? '';
    const normalize = (text: string) => text.replace(/\s+/gu, '');
    const source = evidence && /\d/.test(evidence) ? (normalize(body).includes(normalize(evidence)) ? 'body' : normalize(attachments).includes(normalize(evidence)) ? 'attachment' : null) : null;
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
