import type { EmailExtraction } from '../../domain/types.js';
import type { EmailEventType } from '../../domain/status.js';
import { detectTimeRangeEnd, validEventTime } from '../email/eventTime.js';

const RULES: Array<{ pattern: RegExp; type: EmailEventType }> = [
  { pattern: /感谢信|遗憾|暂不合适|未能通过|没有通过|不匹配|haven.t met the requirements|unfortunately.{0,60}not selected/i, type: 'reject' },
  { pattern: /(?:录用|录取)(?:通知|意向|决定)|(?:获得|发放|收到|接受|您的|your|an)\s*(?:job\s+)?offer\b|offer\s*(?:letter|of employment|通知)|pleased to offer|发放意向/i, type: 'offer' },
  { pattern: /笔试|在线考试|线下考试|统一考试|机考/i, type: 'written_test' },
  { pattern: /测评|在线评估|性格测试|认知能力|coding assessment|coding test|online assessment/i, type: 'assessment' },
  { pattern: /面试|面谈/i, type: 'interview' },
  // 放在拒信之后：若邮件同时含拒绝语义，优先判为拒信
  {
    pattern: /投递成功|简历投递|感谢投递|投递确认|已投递|申请已提交|thanks for your application|thank you for your application|thank you for taking the time to submit your application|application received/i,
    type: 'applied',
  },
];

function detectEventType(text: string): EmailEventType | null {
  for (const rule of RULES) {
    if (rule.pattern.test(text)) return rule.type;
  }
  return null;
}

/** 从【公司】/「公司」形式或发件人名称提取公司 */
function detectCompany(subject: string, sender: string, body: string): string | null {
  const employer = `${subject} ${body}`.match(/中国银行(?:股份有限公司)?/);
  if (employer) return '中国银行股份有限公司';
  if (/Microsoft/i.test(subject) || /Microsoft Recruiting|^\s*Microsoft Software Engineer[^\n]*powered by HackerRank/im.test(body)) return 'Microsoft';
  const bracket = subject.match(/[【\[「]([^】\]」]{2,30})[】\]」]/);
  if (bracket) return bracket[1].trim();
  const senderName = sender.split('<')[0]?.trim();
  if (senderName) return senderName.replace(/\s*(校招|招聘|人才|HR|人事).*$/i, '').slice(0, 30);
  return null;
}

function detectSchedule(text: string, receivedAt?: string): { time: string | null; evidence: string | null } {
  const deadline = /End Login Date\/Time:\s*(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(20\d{2})\s+(\d{1,2}):(\d{2})\s*(AM|PM)\s+(BST|GMT|UTC)\b/i.exec(text);
  if (deadline) {
    const month = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(deadline[2].toLowerCase()) + 1;
    const rawHour = Number(deadline[4]);
    const hour = rawHour % 12 + (deadline[6].toUpperCase() === 'PM' ? 12 : 0);
    const time = rawHour >= 1 && rawHour <= 12 ? validEventTime(`${deadline[3]}-${String(month).padStart(2,'0')}-${deadline[1].padStart(2,'0')}T${String(hour).padStart(2,'0')}:${deadline[5]}:00${deadline[7].toUpperCase() === 'BST' ? '+01:00' : 'Z'}`) : null;
    return {time, evidence: time ? deadline[0] : null};
  }
  const candidates: Array<{ time: string; evidence: string }> = [];
  const year = text.match(/(20\d{2})年\d{1,2}月\d{1,2}日/)?.[1] ?? receivedAt?.slice(0, 4);
  for (const line of text.split(/[\r\n。]/)) {
    if (/客服|工作时间|预约|打印|报名截止/.test(line)) continue;
    const re = /(?:(20\d{2})[-年/.])?(\d{1,2})[-月/.](\d{1,2})日?(?:[^\d]{0,12})(\d{1,2})[:：点时](\d{1,2})分?/g;
    for (const m of line.matchAll(re)) {
      if (!m[1] && !year) continue;
      // Foreign regional schedules require explicit timezone conversion by the model.
      if (/当地时间|新加坡|悉尼|纽约|伦敦|巴黎/.test(line)) { candidates.push({time:'', evidence:line.trim()}); continue; }
      const time = validEventTime(`${m[1] ?? year}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}T${m[4].padStart(2,'0')}:${m[5].padStart(2,'0')}:00`);
      if (time) candidates.push({time, evidence:line.trim()});
    }
  }
  return candidates.length === 1 && candidates[0].time ? {time:candidates[0].time,evidence:candidates[0].evidence} : {time:null,evidence:null};
}

/** Generic fallback stays low confidence; the explicit assessment template is deterministic. */
export function extractWithRules(subject: string, sender: string, snippet: string, receivedAt?: string): EmailExtraction {
  const text = `${subject} ${snippet}`;
  // A receipt's hiring-process overview is not an invitation to every later stage.
  const eventType = detectEventType(subject) === 'applied' ? 'applied' : detectEventType(text);
  const action = /取消|cancel(?:led|ed|lation)/i.test(subject) ? 'cancel' : /恢复|重新安排|reinstate/i.test(subject) ? 'restore' : /改期|延期|调整|reschedul|postpon/i.test(subject) ? 'reschedule' : /考场|考点|地点|地址|准考证|预约成功|location|venue|room|admission ticket/i.test(subject) ? 'update' : 'create';
  const field = (pattern: RegExp) => snippet.match(pattern)?.[1]?.trim();
  const schedule = ['written_test','interview','assessment'].includes(eventType ?? '') ? {
    action: action as 'create' | 'update' | 'reschedule' | 'cancel' | 'restore',
    eventRef: field(/(?:活动编号|场次编号|event id|session id)\s*[:：]\s*([^\s，。;；]+)/i),
    venue: field(/(?:考点|场所|venue)\s*[:：]\s*([^\n。；]+)/i),
    address: field(/(?:地址|address)\s*[:：]\s*([^\n。；]+)/i),
    room: field(/(?:考场|房间|room)\s*[:：]\s*([^\n。；]+)/i),
    evidence: snippet.slice(0, 2000),
  } : undefined;
  const company = detectCompany(subject, sender, snippet);
  const detectedTime = detectSchedule(snippet, receivedAt);
  const eventTime = eventType === 'offer' || eventType === 'applied' ? null : detectedTime.time;
  const timeEvidence = eventTime ? detectedTime.evidence : null;
  const eventTimeEnd = detectTimeRangeEnd(timeEvidence ?? '', eventTime);
  const recruitmentId = text.match(/(?:Job (?:number|id)|requisition(?: id)?|职位编号)\s*[:：#]?\s*([A-Z0-9-]{4,40})/i)?.[1]
    ?? text.match(/Microsoft Software Engineer[^\n]*?\b(\d{7,12})\b/i)?.[1] ?? null;
  const positionTitle = text.match(/application for (.+?)\s*\(Job (?:number|id)/i)?.[1]
    ?? (/Microsoft Software Engineer/i.test(text) ? 'Software Engineer' : null);
  const explicitAssessment = eventType === 'assessment' && company === 'Microsoft' && recruitmentId && positionTitle && eventTime && timeEvidence?.startsWith('End Login Date/Time:');
  const summary = explicitAssessment ? `编程测评登录截止（已换算本地时间）；具体时长及不可暂停要求请查看原邮件。` : eventType ? `本地规则识别：${eventType}` : '本地规则识别：招聘相关邮件';
  const confidence = explicitAssessment ? 0.9 : eventType ? 0.4 : 0.2;

  return { schedule, recruitmentId, company, eventType, eventTime, eventTimeEnd, timeEvidence, timeSource: eventTime ? 'body' : 'unknown', positionTitle, summary, confidence };
}
