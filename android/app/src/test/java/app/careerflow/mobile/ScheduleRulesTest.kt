package app.careerflow.mobile
import org.junit.Test
import org.junit.Assert.*
class ScheduleRulesTest {
 private val event=Event(company="示例公司",role="工程师",ref="JOB-1",stage="written_test",start="2026-11-05T14:00:00",end="2026-11-05T16:00:00",evidence="JOB-1 2026年11月5日14:00至2026年11月5日16:00")
 @Test fun crossSourceIdentity(){assertTrue(ScheduleRules.match(event,event.copy(location="Room A")));assertFalse(ScheduleRules.match(event,event.copy(ref="JOB-2")));assertFalse(ScheduleRules.match(event,event.copy(stage="interview")))}
 @Test fun companyOnlyIsAmbiguous(){assertFalse(ScheduleRules.match(event.copy(role="",ref=""),event.copy(role="",ref="")))}
 @Test fun separateRounds(){assertFalse(ScheduleRules.match(event.copy(round="统一笔试"),event.copy(round="技术笔试")))}
 @Test fun changedTimeNeedsReschedule(){val later=event.copy(start="2026-11-06T14:00:00");assertFalse(ScheduleRules.match(later,event));assertTrue(ScheduleRules.match(later.copy(action="reschedule"),event))}
 @Test fun missingTimeCanEnrichKnownEvent(){assertTrue(ScheduleRules.match(event.copy(start="",end="",action="update"),event))}
 @Test fun windowsDoNotConflict(){assertFalse(ScheduleRules.overlaps(event.copy(kind="window"),event));assertTrue(ScheduleRules.overlaps(event,event));assertFalse(ScheduleRules.overlaps(event,event.copy(start=event.end,end="2026-11-05T17:00:00")))}
 @Test fun quoteAndTimeMustAgree(){assertTrue(ScheduleRules.verified(event,event.evidence));assertFalse(ScheduleRules.verified(event.copy(start="2026-11-06T14:00:00"),event.evidence));assertFalse(ScheduleRules.verified(event,"different text"))}
 @Test fun locationMustBeQuoted(){assertFalse(ScheduleRules.verified(event.copy(location="imagined"),event.evidence))}
 @Test fun cancellationMustBeExplicit(){assertFalse(ScheduleRules.verified(event.copy(action="cancel"),event.evidence));assertTrue(ScheduleRules.verified(event.copy(action="cancel",start="",end="",ref="",evidence="考试取消"),"考试取消"))}
 @Test fun omittedYearUsesReceiptOnly(){val e=event.copy(evidence="JOB-1 11月5日14:00至16:00");assertFalse(ScheduleRules.verified(e,e.evidence));assertTrue(ScheduleRules.verified(e,e.evidence,ScheduleRules.time("2026-10-31T12:00:00")));assertFalse(ScheduleRules.verified(e,e.evidence,ScheduleRules.time("2024-10-31T12:00:00")))}
 @Test fun windowReminderUsesEnd(){assertEquals(ScheduleRules.time(event.end),ScheduleRules.due(event.copy(kind="window")));assertEquals(ScheduleRules.time(event.start),ScheduleRules.due(event))}
}
