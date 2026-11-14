import {it,expect} from 'vitest';
import {awaitingAppointment} from './preliminary.js';
import {informationalNotice,passedStageNotice} from './automationEvidence.js';
import {attachEvidence} from './evidence.js';
const raw={messageId:'test',subject:'招聘通知',sender:'HR',receivedAt:'2026-11-12T09:00:00+08:00',snippet:''};
it.each(['11月19日（周四）-11月20日（周五）其中半天（具体时间以后续正式通知为准）','【11月19-20日】其中半天（具体时间以正式通知为准）'])('preserves unassigned date ranges: %s',snippet=>{
 expect(awaitingAppointment(snippet,raw.receivedAt)).toMatchObject({dateStart:'2026-11-19',dateEnd:'2026-11-20',preliminary:true});
 const e=attachEvidence({company:'示例单位',eventType:'interview',eventTime:null,timeEvidence:snippet,confidence:.95,summary:null,positionTitle:null},{...raw,snippet});
 expect(e.eventTime).toBeNull();expect(e.reviewReasons).toEqual([]);expect(e.schedule?.preliminary).toBe(true);
});
it('recognizes passed results without fabricating another exam',()=>{
 const snippet='恭喜您顺利通过笔试，后续工作人员会电话联系您，协商确定面试时间及面试形式。';
 const e=attachEvidence({company:'示例单位',eventType:'written_test',eventTime:null,confidence:.95,summary:null,positionTitle:null},{...raw,snippet});
 expect(e).toMatchObject({eventType:'other',intent:'progress',timeSource:'received',reviewReasons:[]});expect(e.schedule).toBeUndefined();
 expect(passedStageNotice('如果您通过笔试，后续将邀请面试')).toBe(false);
 expect(passedStageNotice('很遗憾您未通过考试')).toBe(false);
 expect(passedStageNotice('您好\n原始邮件：恭喜您通过笔试')).toBe(false);
});
it('archives resend and conditional clarification without assuming completion',()=>{
 expect(informationalNotice('回复：预通知','稍后给你重新发送 原始邮件：面试时间另行通知')).toContain('补发');
 expect(informationalNotice('补充资料更正','如您已提交补充资料，请耐心关注后续流程，无需再次补充资料')).toContain('不推断已提交');
 expect(informationalNotice('补充资料','请于11月15日10点前提交补充资料')).toBeNull();
});
it('retains skipped materials without blocking explicit preliminary dates; schedule attachments still block',()=>{
 const snippet='面试时间11月19-20日，具体时间以正式通知为准。需携带的材料可提前准备，具体要求详见附件。';
 const attachment={name:'面试所需材料.zip',status:'skipped' as const,detail:'不支持的附件'};
 const e={company:'示例单位',eventType:'interview' as const,eventTime:null,confidence:.95,summary:null,positionTitle:null};
 const run=(name:string)=>attachEvidence(e,{...raw,snippet,content:{body:snippet,attachmentText:'',attachments:[{...attachment,name}],warnings:[`${name}：不支持的附件`]}});
 expect(run(attachment.name).reviewReasons).toEqual([]);
 expect(run(attachment.name).attachments?.[0].status).toBe('skipped');
 expect(run('考场安排.zip').reviewReasons).toContain('考场安排.zip：不支持的附件');
});
