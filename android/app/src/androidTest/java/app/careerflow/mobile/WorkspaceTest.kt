package app.careerflow.mobile
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.*
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.json.JSONObject
import org.json.JSONArray
@RunWith(AndroidJUnit4::class)
class WorkspaceTest {
 @Test fun dashboardRetainsRecordedStagesAfterRejection(){
  val name="dashboard-history-test.db";context.deleteDatabase(name)
  val store=WorkspaceStore(context,name)
  try{val d=JSONObject().put("companyName","Example").put("positionTitle","Engineer").put("status","APPLIED")
   val id=store.save("application",d);d.put("status","INTERVIEW_1");store.save("application",d,id);d.put("status","REJECTED");store.save("application",d,id)
   val row=store.list().getJSONObject(0);assertEquals("REJECTED",row.getJSONObject("data").getString("status"));val stages=row.getJSONArray("stageHistory").toString();assertTrue(stages.contains("APPLIED"));assertTrue(stages.contains("INTERVIEW_1"));assertEquals(1,store.list().length())
  }finally{store.close();context.deleteDatabase(name)}
 }

 private val context=InstrumentationRegistry.getInstrumentation().targetContext
 private lateinit var store:WorkspaceStore
 @Before fun setup(){context.deleteDatabase("workspace-test.db");store=WorkspaceStore(context,"workspace-test.db","workspace-schedules-test.db")}
 @After fun cleanup(){store.close();context.deleteDatabase("workspace-test.db");context.deleteDatabase("workspace-schedules-test.db")}
 @Test fun resumeVersionsAndRestorationPreserveOriginal(){val id=store.save("resume",JSONObject().put("name","CV").put("content","original"));store.save("resume",JSONObject().put("name","CV v2").put("content","edited"),id);val history=store.history(id);assertEquals("original",history.getJSONObject(0).getJSONObject("data").getString("content"));store.restore(id,history.getJSONObject(0).getLong("id"));assertEquals("original",store.data(id)!!.getString("content"));assertEquals(2,store.history(id).length())}
 @Test fun automaticApplicationsAdvanceAndDoNotResetManualOrCompletedStages(){val id=store.ensureApplication("Example","Engineer","interview","INTERVIEW_2");assertEquals("INTERVIEW_2",store.data(id)!!.getString("status"));assertEquals(id,store.ensureApplication("Example","Engineer","applied"));assertEquals("INTERVIEW_2",store.data(id)!!.getString("status"));val edited=store.data(id)!!.put("status","WITHDRAWN");store.save("application",edited,id);store.ensureApplication("Example","Engineer","offer");assertEquals("WITHDRAWN",store.data(id)!!.getString("status"));assertEquals(1,store.list("application").length())}
 @Test fun deadlineWithoutStartAndOldClassificationAreHandledAutomatically(){val local=LocalStore(context,"workspace-schedules-test.db");try{val body="Example Engineer AI interview 2026年11月1日08:00至2026年11月3日18:00内完成";val id=local.save("HR",body,1);val old=Event(company="Example",role="Engineer",stage="interview",start="2026-11-01T08:00",end="2026-11-03T18:00",evidence=body);local.analyzed(id,JSONObject().put("events",JSONArray().put(EventJson.write(old))));val sid=local.schedules().getJSONObject(0).getLong("id");local.complete(sid,true);local.analyzed(id,JSONObject().put("events",JSONArray().put(EventJson.write(old.copy(kind="window")))));assertEquals("window",local.schedules().getJSONObject(0).getString("kind"));assertTrue(local.schedules().getJSONObject(0).getBoolean("done"));val raw=EventJson.write(old.copy(kind="deadline",start="",evidence="2026年11月3日18:00截止"));assertEquals("2026-11-03T18:00",EventJson.read(raw).start)}finally{local.close()}}
 @Test fun informationalAndUndatedMessagesDoNotRequestManualConfirmation(){val local=LocalStore(context,"workspace-schedules-test.db");try{val first=local.save("HR","招聘流程说明",1);local.analyzed(first,JSONObject().put("events",JSONArray()));assertEquals("informational",local.items().getJSONObject(0).getString("state"));val second=local.save("HR","Example面试时间另行通知",2);local.analyzed(second,JSONObject().put("events",JSONArray().put(EventJson.write(Event(company="Example",role="Engineer",stage="interview",evidence="Example面试时间另行通知")))));assertEquals("waiting",local.items().getJSONObject(0).getString("state"));assertEquals(0,local.schedules().length())}finally{local.close()}}
 @Test fun apiConfigurationMigratesLegacyKeyAndDoesNotExposeIt(){val secrets=Secrets(context);val before=secrets.read("llm-config");val key=secrets.read();try{secrets.save("synthetic-private-key");secrets.save("{}","llm-config");assertEquals("synthetic-private-key",LlmApi.config(context).key);assertFalse(LlmApi.save(context,JSONObject().put("baseUrl","https://other.example/v1").put("model","custom")));assertTrue(LlmApi.save(context,JSONObject().put("baseUrl","https://other.example/v1").put("model","custom").put("key","different-test-key").put("jsonMode",false)));assertEquals("custom",LlmApi.config(context).model);assertFalse(LlmApi.publicState(context).toString().contains("different-test-key"));assertFalse(LlmApi.config(context).jsonMode)}finally{secrets.save(before?:"{}","llm-config");secrets.save(key?:"")}}
 @Test fun crossNoticeLocationLinkPreservesCompletionAndRejectsDifferentJobs(){
  val local=LocalStore(context,"workspace-schedules-test.db");try{
   val invite="Example Engineer interview 2026年11月2日14:00至2026年11月2日15:00";val first=local.save("HR",invite,100)
   val e=Event(company="Example",role="Engineer",stage="interview",start="2026-11-02T14:00",end="2026-11-02T15:00",evidence=invite)
   local.analyzed(first,JSONObject().put("events",JSONArray().put(EventJson.write(e))))
   val sid=local.schedules().getJSONObject(0).getLong("id");local.complete(sid,true)
   val follow="Example interview 地点为杭州会议室A";val second=local.save("HR",follow,200)
   val raw=EventJson.write(e.copy(role="",start="",end="",location="杭州会议室A",action="update",evidence=follow)).put("targetScheduleId",sid).put("contextQuote",invite).put("linkReason","同一面试的地点补充")
   local.analyzed(second,JSONObject().put("events",JSONArray().put(raw)))
   val event=local.schedules().getJSONObject(0);assertEquals(1,local.schedules().length());assertEquals("杭州会议室A",event.getString("location"));assertEquals("2026-11-02T14:00",event.getString("start"));assertTrue(event.getBoolean("done"));assertEquals(2,event.getJSONArray("sources").length())
   assertNull(AnalysisContext.target(raw,e.copy(role="Designer"),local.schedules()))
   assertNull(AnalysisContext.target(JSONObject(raw.toString()).put("contextQuote","invented source quote"),e,local.schedules()))
   assertTrue(AnalysisContext.build(local,second).getJSONArray("schedules").length()>0)
   val changed="Example Engineer interview 改期为2026年11月3日15:00";val third=local.save("HR",changed,300)
   val change=EventJson.write(e.copy(start="2026-11-03T15:00",end="",action="reschedule",evidence=changed)).put("targetScheduleId",sid).put("contextQuote",invite).put("linkReason","明确改期，同一轮次")
   local.analyzed(third,JSONObject().put("events",JSONArray().put(change)));assertEquals("2026-11-03T15:00",local.schedules().getJSONObject(0).getString("start"));assertEquals("",local.schedules().getJSONObject(0).getString("end"));assertTrue(local.schedules().getJSONObject(0).getBoolean("done"));assertEquals(1,local.schedules().length())

  }finally{local.close()}
 }
 @Test fun olderRejectionCannotOverrideLaterOfferOrManualState(){
  val offer=Event(company="Example",role="Engineer",stage="offer",evidence="Example Engineer offer")
  assertTrue(store.applicationNotice(offer,offer.evidence,200));val id=store.list("application").getJSONObject(0).getString("id")
  val rejected=offer.copy(stage="reject",evidence="Example Engineer rejected")
  store.applicationNotice(rejected,rejected.evidence,100);assertEquals("OFFER",store.data(id)!!.getString("status"))
  store.save("application",store.data(id)!!.put("status","SIGNED"),id)
  store.applicationNotice(rejected,rejected.evidence,300);assertEquals("SIGNED",store.data(id)!!.getString("status"))
 }
 @Test fun manuallyAddedWishlistAndNotesStillAllowAutomaticProgress(){val id=store.save("application",JSONObject().put("companyName","Example").put("positionTitle","Engineer").put("status","WISHLIST"));store.save("application",store.data(id)!!.put("note","notes"),id);store.ensureApplication("Example","Engineer","interview");assertEquals("INTERVIEW_1",store.data(id)!!.getString("status"))}
}
