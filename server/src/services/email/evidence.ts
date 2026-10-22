import type { EmailExtraction } from '../../domain/types.js';
import type { RawEmail } from './imap.client.js';
import { explicitActivityWindow, mailTimeToLocal, validEventTime } from './eventTime.js';
import {qualificationNotice} from './automationEvidence.js';
import {localIso} from '../../utils/time.js';

/** Confidence alone cannot authorize a dated event: require source evidence. */
export function attachEvidence(extraction: EmailExtraction, raw: RawEmail): EmailExtraction {
  const result = { ...extraction, schedule: extraction.schedule ? {...extraction.schedule} : undefined, attachments: raw.content?.attachments ?? [], reviewReasons: [...(raw.content?.warnings ?? [])] };
  const sourceText = `${raw.subject}\n${raw.content?.body ?? raw.snippet}\n${raw.content?.attachmentText ?? ''}`;
  const recovered = ['interview','assessment','written_test'].includes(result.eventType ?? '') && (!result.schedule || ['create','update'].includes(result.schedule.action)) ? explicitActivityWindow(sourceText) : null;
  if (recovered) {
    if ((result.eventTime && validEventTime(result.eventTime) !== recovered.start) || (result.eventTimeEnd && validEventTime(result.eventTimeEnd) !== recovered.end)) result.reviewReasons.push('模型时间与明确活动时间段冲突，请复核');
    else {
      result.eventTime=recovered.start; result.eventTimeEnd=recovered.end; result.timeEvidence=recovered.evidence;
      if (recovered.window) result.schedule={...result.schedule,action:result.schedule?.action ?? 'create',timeKind:'window'};
    }
  }
  const change = result.schedule;
  // A fixed exam with a late-login exclusion is not a freely selectable completion window.
  if(change?.timeKind==='window' && result.eventType==='written_test' && /考试开始[^。\n]{0,45}(?:未登录|缺考)/.test(sourceText))change.timeKind='start';
  // Activity format is not a round identifier. Avoid invented rounds splitting reminders.
  if (change?.round && /^(?:线上|在线)?AI(?:视频)?面试(?:[（(]正式作答[）)])?$/i.test(change.round)) delete change.round;
  const changeOnly = change && change.action !== 'create';
  if (change) {
    const normalize = (value: string) => value.replace(/\s+/gu, '');
    const quote = change.evidence?.trim();
    const hasQuote = Boolean(quote && normalize(sourceText).includes(normalize(quote)));
    if ((changeOnly || change.venue || change.address || change.room || change.eventRef || change.round) && !hasQuote) result.reviewReasons.push('日程关联或变更缺少原文依据，请人工确认');
    if (change.round && !normalize(sourceText).includes(normalize(change.round))) result.reviewReasons.push('轮次无法从邮件原文核对，请人工确认');
    for (const value of [change.eventRef, change.venue, change.address, change.room]) {
      if (value && (!hasQuote || !normalize(quote!).includes(normalize(value)) || /https?:|www\.|链接已隐藏|验证码|密码|token=/i.test(value))) result.reviewReasons.push('活动标识或地点无法从引文核对，或含敏感链接，请人工确认');
    }
    if (change.action === 'cancel' && (!quote || !/取消|作废|cancel/i.test(quote) || /未取消|不取消|not cancelled|not canceled/i.test(quote))) result.reviewReasons.push('未确认明确取消通知，不能自动撤销提醒');
    if (change.action === 'reschedule' && (!quote || !/改期|调整|变更|延期|推迟|提前|reschedul|postpon|moved|changed/i.test(quote))) result.reviewReasons.push('未确认明确改期通知，请复核');
    if (change.action === 'restore' && (!quote || !/恢复|重新安排|reinstate|resume/i.test(quote))) result.reviewReasons.push('未确认明确恢复通知，请复核');
    if (change.previousTime && !validEventTime(change.previousTime)) result.reviewReasons.push('原活动时间格式无效');
  }
  if ((sourceText.match(/地区[^\n。]{0,40}开始时间/g) ?? []).length > 1) {
    result.eventTime = null; result.eventTimeEnd = null;
    result.reviewReasons.push('包含多个地区的考试时间，请选择本人考区后确认');
  }
  if (result.recruitmentId && !sourceText.includes(result.recruitmentId)) {
    result.recruitmentId = null;
    result.reviewReasons.push('职位编号未在原文出现，需确认申请关联');
  }
  const early=[...new Map([...sourceText.matchAll(/提前(\d{1,2})分钟(?:登录|进入笔试|打开笔试链接)/g)].map(match=>[match[1],match])).values()];
  if(validEventTime(result.eventTime) && early.length===1 && Number(early[0][1])>0 && ['written_test','interview','assessment'].includes(result.eventType??'')){
    const at=localIso(new Date(new Date(result.eventTime!).getTime()-Number(early[0][1])*60000));
    if(!(result.preparationTasks??[]).some(t=>t.scheduledAt===at))result.preparationTasks=[...(result.preparationTasks??[]),{title:'提前登录／设备准备（需本人操作）',scheduledAt:at,timeEvidence:early[0][0]}];
  }
  result.preparationTasks = (result.preparationTasks ?? []).filter(task => {
    const valid = validEventTime(task.scheduledAt);
    const quote = task.timeEvidence?.replace(/\s+/gu, '');
    const dates = [...(quote ?? '').matchAll(/(?<!\d)(?<!\d[:：])(?:(20\d{2})[-年/.])?(\d{1,2})[-月/.](\d{1,2})(?!\d)/g)];
    const midnight=Boolean(valid?.endsWith('T00:00:00') && /24(?:点|时|[:：]00)/.test(quote??''));
    const reference=midnight?new Date(new Date(`${valid!.slice(0,10)}T00:00:00Z`).getTime()-86400000).toISOString():valid;
    const dateMatches = reference && dates.some(m => (!m[1] || m[1] === reference.slice(0, 4)) && Number(m[2]) === Number(reference.slice(5, 7)) && Number(m[3]) === Number(reference.slice(8, 10)));
    const clockMatches = midnight || (valid && [...(quote ?? '').matchAll(/(\d{1,2})(?:[:：](\d{2})|[点时](?:(\d{1,2})分?)?)/g)].some(m => Number(m[1]) === Number(valid.slice(11, 13)) && Number(m[2]??m[3]??0) === Number(valid.slice(14, 16))));
    const lead=quote?.match(/提前(\d{1,2})分钟(?:登录|进入笔试|打开笔试链接)/);
    const relative=lead && validEventTime(result.eventTime) && valid===localIso(new Date(new Date(result.eventTime!).getTime()-Number(lead[1])*60000));
    if (!valid || !quote || !sourceText.replace(/\s+/gu, '').includes(quote) || (!relative && (!dateMatches || !clockMatches))) {
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
      const dates = [...evidence.matchAll(/(20\d{2})[-年/.](\d{1,2})[-月/.](\d{1,2})/g)].map(m=>`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`);
      if (dates.length && !dates.includes(result.eventTime.slice(0,10))) result.reviewReasons.push('提取日期与原文日期不一致，需复核时区或日期');
      if (change?.action === 'reschedule' && change.previousTime && validEventTime(change.previousTime) === result.eventTime) result.reviewReasons.push('改期后的时间仍等于原时间，请复核');
      if (['written_test', 'interview', 'assessment'].includes(result.eventType ?? '') && !/\d[:：点时]\d|T\d{6}|\d点/.test(evidence)) result.reviewReasons.push('原文未明确具体时刻，需人工确认活动时间');
      if (result.eventType === 'offer' && /入职|报到|截止|回复|deadline|start date/i.test(evidence)) {
        result.eventTime = null; result.eventTimeEnd = null;
        result.reviewReasons.push('原文可能是报到或回复日期，Offer 时间暂用收件时间');
      }
    }
    if (!result.eventTime && result.eventType === 'offer') {
      result.eventTime = mailTimeToLocal(raw.receivedAt); result.timeSource = 'received';
    }
    if (!result.eventTime && !changeOnly && ['written_test', 'interview', 'assessment'].includes(result.eventType ?? '')) {
      result.reviewReasons.push('未确定活动时间，请核对原邮件或附件后填写');
    }
  }
  if (changeOnly && !result.eventTime && change?.evidence && !result.reviewReasons.length) {
    result.timeSource = (raw.content?.body ?? raw.snippet).replace(/\s+/gu, '').includes(change.evidence.replace(/\s+/gu, '')) ? 'body' : 'attachment';
  }
  if (result.eventTimeEnd && (!result.eventTime || result.eventTimeEnd <= result.eventTime)) {
    result.eventTimeEnd = null; result.reviewReasons.push('结束时间不晚于开始时间，需复核');
  }
  if(result.eventType==='other' && result.company && result.positionTitle && qualificationNotice(sourceText)){
    result.eventTime=mailTimeToLocal(raw.receivedAt);result.timeSource='received';result.timeEvidence=null;
  } else if (!result.company || !result.eventType || result.eventType === 'other') result.reviewReasons.push('公司或事件信息不完整，需人工确认');
  result.reviewReasons = [...new Set(result.reviewReasons)];
  return result;
}
