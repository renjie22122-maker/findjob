package app.careerflow.mobile
import org.junit.Assert.*
import org.junit.Test
class FlexibleTimingTest {
 @Test fun modelCanRepairOldFixedWindowWithoutCompanySpecificRules(){val old=Event(company="Example",role="Engineer",stage="interview",start="2026-11-01T08:00",end="2026-11-01T08:00");val next=old.copy(kind="window",end="2026-11-03T18:00",evidence="2026年11月1日08:00至2026年11月3日18:00内完成");assertTrue(ScheduleRules.match(next,old));assertTrue(ScheduleRules.verified(next,next.evidence));assertFalse(ScheduleRules.overlaps(next,old));assertFalse(ScheduleRules.match(next,old.copy(role="Designer")))}
 @Test fun deadlineReminderCanAttachToExistingAvailabilityWindow(){val e=Event(company="Example",role="Engineer",stage="assessment",kind="window",start="2026-11-01T08:00",end="2026-11-03T18:00");val reminder=e.copy(kind="deadline",start=e.end,evidence="2026年11月3日18:00截止");assertTrue(ScheduleRules.match(reminder,e))}
 @Test fun apiUrlValidationUsesHttpsWithoutRestrictingProvider(){assertTrue(LlmApi.validUrl("https://custom.example/v1"));assertTrue(LlmApi.validUrl("https://azure.example/openai/deployments/custom/chat/completions?api-version=2024-10-21"));assertFalse(LlmApi.validUrl("http://custom.example/v1"));assertFalse(LlmApi.validUrl("https://key@custom.example/v1"));assertFalse(LlmApi.validUrl("file:///credentials"))}
}
