import {it,expect} from 'vitest';
import {awaitingAppointment} from './preliminary.js';
import {informationalNotice,passedStageNotice} from './automationEvidence.js';
import {attachEvidence} from './evidence.js';
const raw={messageId:'test',subject:'招聘通知',sender:'HR',receivedAt:'2026-11-12T09:00:00+08:00',snippet:''};
it('uses full-body later-notice evidence when the model quoted only the date',()=>{
 const date='我们将于2026年11月24日在北京、深圳两地开展现场面试';
 const snippet=date+'。请于2026年11月17日12:00反馈。在反馈后，我们将通过另一份正式通知邮件告知您准确的面试时段及地点。';
 const e=attachEvidence({company:'示例单位',eventType:'interview',eventTime:null,timeEvidence:date,confidence:.95,summary:null,positionTitle:'工程师'},{...raw,snippet});
 expect(e.schedule).toMatchObject({preliminary:true,dateStart:'2026-11-24',dateEnd:'2026-11-24'});expect(e.reviewReasons).toEqual([]);expect(e.eventTime).toBeNull();
});
it('keeps admission-document limitations while applying independently stated venue/time and arrival lead',()=>{
 const snippet='考试时间：2026年11月22日09:30。考试地点：A楼403教室。请提前30分钟抵达考场，提前自行打印附件入校凭证。';
 const attachment={name:'入校凭证及考点地图.doc',status:'skipped' as const,detail:'不支持的附件'};
 const e=attachEvidence({company:'示例单位',eventType:'written_test',eventTime:'2026-11-22T09:30:00',timeEvidence:'2026年11月22日09:30',confidence:.98,summary:null,positionTitle:null},{...raw,snippet,content:{body:snippet,attachmentText:'',attachments:[attachment],warnings:[`${attachment.name}：${attachment.detail}`]}});
 expect(e.reviewReasons).toEqual([]);expect(e.attachments?.[0].status).toBe('skipped');
 expect(e.preparationTasks?.[0]).toMatchObject({scheduledAt:'2026-11-22T09:00:00',title:'提前到场／签到（需本人操作）'});
});
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
