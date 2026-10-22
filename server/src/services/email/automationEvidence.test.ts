import {describe,it,expect} from 'vitest';
import {informationalNotice} from './automationEvidence.js';
import {attachEvidence} from './evidence.js';
import {extractWithRules} from '../llm/ruleBased.js';
const raw={messageId:'fixture',subject:'【示例技术公司2027届秋招】在线考试邀请函',sender:'示例技术公司 <test@example.com>',receivedAt:'2026-10-22T02:00:00Z',snippet:''};
describe('低打扰自动化证据',()=>{
 it('状态说明和完成回执可静默归档，带截止或未完成语义不归档',()=>{
   expect(informationalNotice('查看申请','如果您已完成申请，可查看状态。如果您仍在处理申请，请继续。')).toBeTruthy();
   expect(informationalNotice('查看申请','如果您已完成申请。如果您仍在处理申请，请于截止前完成。')).toBeNull();
   expect(informationalNotice('面试完成通知','您已经完成了AI面试，感谢参加')).toBeTruthy();
   expect(informationalNotice('面试完成通知','如果您已经完成了AI面试，请忽略')).toBeNull();
 });
 it('明确收到简历的投递回执按收件时间自动提取岗位',()=>{
   const r={...raw,subject:'同学，感谢你投递示例公司的数字化工程师（AI方向）（DC）职位',sender:'示例招聘 <test@example.com>',snippet:'您的简历我们已经收到。'};
   const e=attachEvidence(extractWithRules(r.subject,r.sender,r.snippet,r.receivedAt),r);
   expect(e).toMatchObject({eventType:'applied',positionTitle:'数字化工程师（AI方向）（DC）',timeSource:'received',confidence:0.9});expect(e.reviewReasons).toEqual([]);
 });
 it('多场概览中单独标记的考试信息不被其他日期干扰',()=>{
   const r={...raw,snippet:'邀请参加笔试。统一考试10月24日14:00-16:00。技术考试10月25日14:00-16:00。\n考试信息\n试卷名称：研发序列\n开始时间（北京时间）：2026-10-25 14:00 星期日\n结束时间（北京时间）：2026-10-25 16:00 星期日'};
   const e=attachEvidence(extractWithRules(r.subject,r.sender,r.snippet,r.receivedAt),r);
   expect(e).toMatchObject({company:'示例技术公司',eventType:'written_test',eventTime:'2026-10-25T14:00:00',eventTimeEnd:'2026-10-25T16:00:00',confidence:0.9});expect(e.reviewReasons).toEqual([]);
 });
 it('24点截止对应次日零点，不能认可同日零点',()=>{
   const r={...raw,snippet:'截止时间：10月23日（周五）24点'};
   const e={company:'示例',eventType:'applied' as const,eventTime:null,positionTitle:'岗位',confidence:0.9,summary:null,preparationTasks:[{title:'预约截止',scheduledAt:'2026-10-24T00:00:00',timeEvidence:r.snippet}]};
   expect(attachEvidence(e,r).preparationTasks).toHaveLength(1);
   expect(attachEvidence({...e,preparationTasks:[{...e.preparationTasks[0],scheduledAt:'2026-10-23T00:00:00'}]},r).preparationTasks).toHaveLength(0);
 });
 it('资格审查只记进展，不冒充笔试邀请或投递回执',()=>{
   const r={...raw,subject:'通过资格审查通知',snippet:'您通过了我公司工程师岗位应聘资格审查'};
   const e=attachEvidence({company:'示例',eventType:'other',positionTitle:'工程师',eventTime:null,summary:null,confidence:0.95},r);
   expect(e.eventType).toBe('other');expect(e.timeSource).toBe('received');expect(e.reviewReasons).toEqual([]);
 });
});
