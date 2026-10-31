package app.careerflow.mobile
import org.junit.Assert.*
import org.junit.Test
class BackgroundRulesTest {
 @Test fun midnightDeadlineUsesNextDayWithoutInventingTime(){val quote="2026年10月30日08:00至2026年10月31日24:00";val e=Event(company="Example",stage="assessment",kind="window",start="2026-10-30T08:00:00",end="2026-11-01T00:00:00",evidence=quote);assertTrue(ScheduleRules.verified(e,quote));assertFalse(ScheduleRules.verified(e.copy(end="2026-11-02T00:00:00"),quote))}
 @Test fun delayedReminderCatchesUpButDoesNotSpamOldEvents(){
  assertTrue(ReminderPolicy.deliver(100,200000,190000))
  assertTrue(ReminderPolicy.deliver(100,200,201))
  assertFalse(ReminderPolicy.deliver(100,200,200+7200001))
  assertFalse(ReminderPolicy.deliver(300,400,200))
 }
 @Test fun terseSmsMatchesUniqueOccurrenceButNotAnotherRoundOrRole(){
  val email=Event(company="Example",role="Engineer",stage="interview",kind="window",start="2026-11-01T10:00",end="2026-11-03T10:00",round="AI")
  assertTrue(ScheduleRules.match(email.copy(role=""),email))
  assertFalse(ScheduleRules.match(email.copy(role="Designer"),email))
  assertFalse(ScheduleRules.match(email.copy(round="Technical"),email))
  assertFalse(ScheduleRules.match(email.copy(end="2026-11-04T10:00"),email))
  assertTrue(ScheduleRules.match(email.copy(start="",end="",action="update"),email))
 }
}
