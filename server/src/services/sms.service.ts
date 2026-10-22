import {createHash} from 'node:crypto';
import {getDb} from '../db/connection.js';
import {AppError} from '../middleware/error.js';
import {nowIso} from '../utils/time.js';
import {redactMailSecrets} from './email/contentSafety.js';
import {attachEvidence} from './email/evidence.js';
import {extractWithRules} from './llm/ruleBased.js';
import {extractWithLlm} from './llm/llm.client.js';
import {getLlmConfig} from './settings.service.js';
import {applyEmailItem} from './email/email.service.js';
import {checkExistingEmails} from './email/check.service.js';

let busy=false;
export async function importSms(input:{body:string;sender?:string;receivedAt?:string}) {
  if(busy)throw AppError.conflict('短信正在分析，请稍后重试');
  const text=input.body.trim();
  if(/验证码|动态密码|一次性密码|登录验证|重置密码|verification code|one.time password|\bOTP\b/i.test(text))return {id:null,status:'filtered',duplicate:false,message:'已过滤身份验证短信，未存储或发送给模型'};
  if(!/招聘|考试|笔试|面试|测评|投递|录用|应聘|资格审查|interview|assessment|application/i.test(text))return {id:null,status:'filtered',duplicate:false,message:'已过滤非招聘短信，未存储或发送给模型'};
  const body=redactMailSecrets(text).replace(/\b\d{17}[\dXx]\b/g,'[身份证号已隐藏]');
  const receivedAt=input.receivedAt?new Date(input.receivedAt).toISOString():new Date().toISOString();
  const sender=redactMailSecrets(input.sender?.trim()||'短信');
  // Content identity is independent of forwarding retries and missing phone timestamps.
  const messageId='sms:'+createHash('sha256').update(`${sender}\n${body.replace(/\s+/g,' ')}`).digest('hex');
  const db=getDb(),existing=db.prepare('SELECT id,status FROM email_items WHERE message_id=?').get(messageId) as {id:number;status:string}|undefined;
  if(existing)return {...existing,duplicate:true,message:'已接收过该短信，未重复创建提醒'};
  busy=true;
  try{
    const subject=`【短信】${body.slice(0,70)}`;
    let extraction;
    if(getLlmConfig()?.apiKey){try{extraction=await extractWithLlm(subject,sender,body,receivedAt,'');}catch{extraction=extractWithRules(subject,sender,body,receivedAt);}}
    else extraction=extractWithRules(subject,sender,body,receivedAt);
    extraction=attachEvidence(extraction,{messageId,subject,sender,receivedAt,snippet:body});
    if(extraction.relevant===false)return {id:null,status:'filtered',duplicate:false,message:'模型判定为非招聘通知，未保存招聘记录'};
    // Received time may be unknown; never turn import time into an inferred application date.
    if(!input.receivedAt && extraction.eventType==='applied')extraction.reviewReasons=[...(extraction.reviewReasons??[]),'短信收件时间未提供，请核对投递日期'];
    const id=Number(db.prepare("INSERT INTO email_items(message_id,subject,sender,received_at,snippet,extracted,status,created_at) VALUES (?,?,?,?,?,?,'pending',?)").run(messageId,subject,`短信 · ${sender}`,receivedAt,body,JSON.stringify(extraction),nowIso()).lastInsertRowid);
    let message='短信已入库，待核对';
    if(extraction.confidence>=.8 && !extraction.reviewReasons?.length && extraction.company && extraction.eventType && extraction.eventType!=='other'){
      try{applyEmailItem(id,undefined,{createIfMissing:true,markApplied:true});message='短信已自动关联并生成日程／时间线';}catch(e){message=e instanceof Error?e.message:'关联需要复核';}
    }
    checkExistingEmails('apply');
    return {id,status:(db.prepare('SELECT status FROM email_items WHERE id=?').get(id) as {status:string}).status,duplicate:false,message};
  }finally{busy=false;}
}
