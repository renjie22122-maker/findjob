/** Only classify explicit informational notices; never infer an application or exam completion from a conditional. */
export function informationalNotice(subject:string, body:string):string|null {
  const current=currentMessage(body);
  if (/^(?:稍后|随后|马上|已经|已|会|将).{0,12}(?:重新发送|补发|重发)/.test(current.trim()) && !/截止|\d月\d|请.*(?:完成|确认)/.test(current)) return '补发说明：等待正式通知，不创建活动';
  if (/(?:如|如果|若)您?已(?:经)?提交/.test(current) && /无需(?:再次|重复)(?:提交|补充)/.test(current) && !/截止|请于|必须于/.test(current)) return '条件式补充说明：不推断已提交，不改变已有待办';
  const text=`${subject}\n${body}`;
  if (/如果您已完成申请|if you have completed the application/i.test(text) && /如果您仍在处理申请|if you are still working on the application/i.test(text) && !/截止|deadline|预约|考试时间|面试时间/i.test(text)) return '申请状态说明：不代表已投递，无需处理';
  if (/完成通知|completion confirmation/i.test(subject) && /已经完成了?(?:AI)?(?:面试|测评|笔试)|you have completed/i.test(body) && !/如果|尚未|未完成|请.*完成|截止|deadline/i.test(body)) return '活动完成回执：不新建活动或重复提醒';
  return null;
}
/** Quoted history is not a new decision by the sender. */
export function currentMessage(body:string):string {
  return body.split(/(?:原始邮件|原邮件|Original Message|On .{0,100} wrote:)/i)[0];
}
/** Positive results update progress, not a new exam appointment. */
export function passedStageNotice(body:string):boolean {
  const text=currentMessage(body);
  return /(?:恭喜.{0,30}|您已|你已|您)(?:顺利)?通过(?:了)?[^。！!\n]{0,30}(?:笔试|考试|测评|资格审查)/.test(text)
    && !/(?:未|没有|尚未|未能)通过|(?:如果|若|如您).{0,30}通过|考试时间|面试时间[：:]|截止时间|作答有效期/.test(text);
}
export function qualificationNotice(text:string):boolean {
  return /通过了.{0,60}(?:应聘)?资格审查|通过资格审查通知/.test(text) && !/未通过|没有通过|尚未通过/.test(text);
}

/** Explicit reservation midnight deadline only; never opens or completes the reservation. */
export function reservationMidnight(text:string,receivedAt:string) {
  if(!/预约/.test(text))return null;
  const matches=[...text.matchAll(/截止时间[：:]\s*(?:(20\d{2})年)?(\d{1,2})月(\d{1,2})日(?:[（(][^）)\n]{1,10}[）)])?\s*24点/g)];
  if(matches.length!==1)return null;
  const m=matches[0],year=Number(m[1]??receivedAt.slice(0,4)),month=Number(m[2]),day=Number(m[3]);
  if(!year || month<1 || month>12 || day<1 || day>new Date(Date.UTC(year,month,0)).getUTCDate())return null;
  const date=new Date(Date.UTC(year,month-1,day+1)).toISOString().slice(0,10);
  return {title:'预约截止（需本人操作）',scheduledAt:`${date}T00:00:00`,timeEvidence:m[0]};
}
