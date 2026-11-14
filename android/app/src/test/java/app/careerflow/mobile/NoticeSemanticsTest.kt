package app.careerflow.mobile
import org.junit.Test
import org.junit.Assert.*

class NoticeSemanticsTest {
 @Test fun resultsAreNotAppointments(){
  val text="恭喜您顺利通过笔试，工作人员会电话联系协商面试时间及形式。"
  val e=NoticeSemantics.normalize(Event(company="示例",stage="written_test",evidence=text),text)
  assertEquals("progress",e.intent);assertEquals("other",e.stage);assertEquals("",e.start)
  assertFalse(NoticeSemantics.passed("如果您通过笔试，将邀请面试"));assertFalse(NoticeSemantics.passed("您未通过考试"))
  assertFalse(NoticeSemantics.passed("请留意来电 原始邮件：恭喜您通过笔试"))
 }
 @Test fun conditionalCorrectionsAndResendAreInformational(){
  assertTrue(NoticeSemantics.informational("如您已提交补充资料，无需再次补充资料，请耐心等待。"))
  assertTrue(NoticeSemantics.informational("稍后给你重新发送 原始邮件：参加面试"))
  assertFalse(NoticeSemantics.informational("请于11月15日提交资料"))
 }
 @Test fun provisionalDatesAreNotFlexibleWindows(){
  val text="11月19日（周四）-11月20日（周五）其中半天（具体时间以后续正式通知为准）"
  val e=NoticeSemantics.normalize(Event(company="示例",role="开发",stage="interview",kind="window",evidence=text),text)
  assertTrue(e.preliminary);assertEquals("start",e.kind);assertTrue(ScheduleRules.verified(e,text))
  assertTrue(NoticeSemantics.withinRange(e,e.copy(start="2026-11-20T09:00:00")))
  assertFalse(NoticeSemantics.withinRange(e,e.copy(start="2026-12-20T09:00:00")))
  assertFalse(ScheduleRules.match(e.copy(start="2026-12-20T09:00:00",preliminary=false),e))
 }
 @Test fun taskDeadlinesSupportChineseClocksAndMidnight(){
  val text="请于2026年11月15日14点前补充材料"
  assertTrue(ScheduleRules.verified(Event(company="示例",stage="other",kind="deadline",start="2026-11-15T14:00:00",end="2026-11-15T14:00:00",evidence=text),text))
  val midnight="请于2026年11月15日24点前完成"
  assertTrue(ScheduleRules.verified(Event(company="示例",stage="other",kind="deadline",start="2026-11-16T00:00:00",end="2026-11-16T00:00:00",evidence=midnight),midnight))
 }
}
