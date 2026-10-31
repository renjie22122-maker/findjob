package app.careerflow.mobile
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.*
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.json.JSONObject
import org.json.JSONArray

@RunWith(AndroidJUnit4::class)
class ReanalysisTest {
 private val c=InstrumentationRegistry.getInstrumentation().targetContext
 private lateinit var db:LocalStore
 private lateinit var batch:ReanalysisStore
 @Before fun setup(){c.deleteDatabase("batch-notices-test.db");c.deleteDatabase("batch-test.db");db=LocalStore(c,"batch-notices-test.db");batch=ReanalysisStore(c,"batch-test.db")}
 @After fun cleanup(){db.close();batch.close();c.deleteDatabase("batch-notices-test.db");c.deleteDatabase("batch-test.db")}
 private fun parsed(vararg events:Event)=JSONObject().put("events",JSONArray(events.map{EventJson.write(it)}))
 @Test fun snapshotIncludesAllMessagesAndPersistsProgress(){
  db.writableDatabase.beginTransaction();try{repeat(1200){n->db.save("HR","招聘面试通知 $n "+"原文".repeat(800),n.toLong(),"email","batch-$n")};db.writableDatabase.setTransactionSuccessful()}finally{db.writableDatabase.endTransaction()}
  assertEquals(1200,db.allIds().size);assertEquals(1200,db.noticeCount());assertEquals(50,db.items(50,0,false).length());assertEquals("",db.items(50,0,false).getJSONObject(0).getString("body"));assertNotEquals(db.items(50,0,false).getJSONObject(0).getLong("id"),db.items(50,50,false).getJSONObject(0).getLong("id"))
  val run=batch.start(db.allIds());assertEquals(1200,batch.state().getInt("total"));assertEquals(run,batch.start(db.allIds()));val first=batch.next(run)!!;batch.claim(run,first);batch.finish(run,first);batch.pause();assertFalse(batch.active(run));batch.close();batch=ReanalysisStore(c,"batch-test.db");assertEquals(1,batch.state().getInt("finished"));assertEquals("paused",batch.state().getString("status"));batch.resume(false);assertNotEquals(first,batch.next(run))
 }
 @Test fun interruptedClaimsAndFailuresCanResumeWithoutResettingSuccess(){val run=batch.start(listOf(1,2,3,4));batch.claim(run,1);batch.finish(run,1);batch.claim(run,2);batch.close();batch=ReanalysisStore(c,"batch-test.db");assertEquals(2L,batch.next(run));batch.finish(run,2,"timeout");batch.finish(run,3,"timeout");batch.finish(run,4,"timeout");assertEquals("paused",batch.state().getString("status"));assertEquals(3,batch.state().getInt("failed"));batch.resume(true);assertEquals(1,batch.state().getInt("finished"));assertEquals(0,batch.state().getInt("failed"));assertEquals(2L,batch.next(run))}
 @Test fun correctsOldWrongTimePreservingCompletionAndSource(){val text="示例科技工程师笔试时间2026年11月2日14:00，通知发出时间2026年11月1日09:00";val id=db.save("HR",text,1);val wrong=Event(company="示例科技",role="工程师",stage="written_test",start="2026-11-01T09:00",evidence=text);db.analyzed(id,parsed(wrong));val sid=db.schedules().getJSONObject(0).getLong("id");db.complete(sid,true);db.analyzed(id,parsed(wrong.copy(start="2026-11-02T14:00")));val corrected=db.schedules().getJSONObject(0);assertEquals("2026-11-02T14:00",corrected.getString("start"));assertTrue(corrected.getBoolean("done"));assertEquals(1,corrected.getJSONArray("sources").length());assertTrue(db.history().toString().contains("before="));db.analyzed(id,parsed());assertEquals(1,db.schedules().length());assertEquals("review",db.items().getJSONObject(0).getString("state"))}
 @Test fun reversedEventOrderDoesNotSwapOrDuplicateLinkedSchedules(){val body="示例科技工程师笔试2026年11月2日14:00，面试2026年11月3日15:00";val id=db.save("HR",body,1);val exam=Event(company="示例科技",role="工程师",stage="written_test",start="2026-11-02T14:00",evidence=body);val interview=exam.copy(stage="interview",start="2026-11-03T15:00");db.analyzed(id,parsed(exam,interview));db.analyzed(id,parsed(interview,exam));assertEquals(2,db.schedules().length());for(i in 0 until 2){val s=db.schedules().getJSONObject(i);assertEquals(1,s.getJSONArray("sources").length());assertEquals(if(s.getString("stage")=="interview")"2026-11-03T15:00" else  "2026-11-02T14:00",s.getString("start"))}}
 @Test fun newerSourcesAndManualEditsWinOverReanalysis(){val text="示例科技工程师面试2026年11月2日14:00";val id=db.save("HR",text,1);val e=Event(company="示例科技",role="工程师",ref="JOB",stage="interview",start="2026-11-02T14:00",evidence=text);val safe=e.copy(ref="");db.analyzed(id,parsed(safe));val sid=db.schedules().getJSONObject(0).getLong("id");db.manual(EventJson.write(safe).put("id",sid).put("location","人工确认地点"));db.analyzed(id,parsed(safe));assertEquals("人工确认地点",db.schedules().getJSONObject(0).getString("location"))}
 @Test fun outputLimitDefaultsToOmittedAndHonorsExplicitConfiguration(){val input=JSONObject().put("max_tokens",64).put("temperature",0).put("response_format",JSONObject().put("type","json_object"));val open=LlmApi.payload(LlmConfig(),input);assertFalse(open.has("max_tokens"));assertEquals(64,input.getInt("max_tokens"));val bounded=LlmApi.payload(LlmConfig(maxTokens=8192,jsonMode=false,temperature=false),input);assertEquals(8192,bounded.getInt("max_tokens"));assertFalse(bounded.has("temperature"));assertFalse(bounded.has("response_format"))}
 @Test fun databaseVersionTwoMigratesWithoutLosingSources(){val id=db.save("HR","示例招聘面试通知",1);db.writableDatabase.version=2;db.close();db=LocalStore(c,"batch-notices-test.db");assertEquals("示例招聘面试通知",db.body(id));assertEquals(3,db.readableDatabase.version)}
}
