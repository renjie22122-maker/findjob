package app.careerflow.mobile
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.*
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.json.JSONArray
import org.json.JSONObject
@RunWith(AndroidJUnit4::class)
class WorkflowTest {
 private val context=InstrumentationRegistry.getInstrumentation().targetContext
 private lateinit var db:LocalStore
 @Before fun setup(){context.deleteDatabase("workflow-test.db");db=LocalStore(context,"workflow-test.db")}
 @After fun cleanup(){db.close();context.deleteDatabase("workflow-test.db")}
 private val body="示例公司招聘笔试 JOB-1 2026年11月5日14:00至2026年11月5日16:00，地点东楼A301"
 private fun extraction(action:String="create",start:String="2026-11-05T14:00:00",end:String="2026-11-05T16:00:00",quote:String=body)=JSONObject().put("events",JSONArray().put(EventJson.write(Event("示例公司","工程师","JOB-1","written_test","start",start,end,"东楼A301",action,quote))))
 @Test fun emailSmsMergeCompletionRescheduleCancel(){
  val email=db.save("HR",body,1,"email","uid-1");db.analyzed(email,extraction());val sid=db.schedules().getJSONObject(0).getLong("id");db.complete(sid,true)
  val sms=db.save("sender",body,2);db.analyzed(sms,extraction());assertEquals(1,db.schedules().length());assertTrue(db.schedules().getJSONObject(0).getBoolean("done"));assertEquals(2,db.schedules().getJSONObject(0).getJSONArray("sources").length());assertEquals(-1,db.save("sender",body,2))
  val change="示例公司招聘笔试 JOB-1 改期 2026年11月6日14:00至2026年11月6日16:00，地点东楼A301";val id=db.save("HR",change,3);db.analyzed(id,extraction("reschedule","2026-11-06T14:00:00","2026-11-06T16:00:00",change));assertEquals(1,db.schedules().length());assertEquals("2026-11-06T14:00:00",db.schedules().getJSONObject(0).getString("start"));assertTrue(db.schedules().getJSONObject(0).getBoolean("done"))
  val cancel="示例公司 JOB-1 招聘笔试取消，地点东楼A301";val cid=db.save("HR",cancel,4);db.analyzed(cid,extraction("cancel","","",cancel));assertTrue(db.schedules().getJSONObject(0).getBoolean("cancelled"));assertTrue(db.history().length()>=4)
 }
 @Test fun replayDoesNotDuplicateAndAuthNeverStored(){assertEquals(-1,db.save("HR","招聘验证码 123456",1));val id=db.save("HR",body,1);db.analyzed(id,extraction());db.analyzed(id,extraction());assertEquals(1,db.schedules().length());assertEquals(1,db.schedules().getJSONObject(0).getJSONArray("sources").length())}
 @Test fun olderMessagesCannotUndoChangeOrCancellation(){
  val first=db.save("HR",body,10);db.analyzed(first,extraction())
  val change="示例公司招聘笔试 JOB-1 改期 2026年11月6日14:00至2026年11月6日16:00，地点东楼A301";val newer=db.save("HR",change,30);db.analyzed(newer,extraction("reschedule","2026-11-06T14:00:00","2026-11-06T16:00:00",change))
  val old="改期："+body;val older=db.save("HR",old,20);db.analyzed(older,extraction("reschedule",quote=old));assertEquals("2026-11-06T14:00:00",db.schedules().getJSONObject(0).getString("start"))
  val cancel="示例公司 JOB-1 招聘笔试取消，地点东楼A301";val cid=db.save("HR",cancel,40);db.analyzed(cid,extraction("cancel","","",cancel))
  val reminder=db.save("sender",change,50);db.analyzed(reminder,extraction("create","2026-11-06T14:00:00","2026-11-06T16:00:00",change));assertTrue(db.schedules().getJSONObject(0).getBoolean("cancelled"))
 }
 @Test fun terseSmsAutomaticallyPreservesCompletedState(){
  val first=db.save("HR",body,1);db.analyzed(first,extraction());val sid=db.schedules().getJSONObject(0).getLong("id");db.complete(sid,true)
  val unknown=db.save("unknown",body,2);val parsed=extraction();parsed.getJSONArray("events").getJSONObject(0).put("role","").put("ref","");db.analyzed(unknown,parsed);assertEquals("linked",db.items().getJSONObject(0).getString("state"))
  db.recheck();assertEquals(1,db.schedules().length());assertTrue(db.schedules().getJSONObject(0).getBoolean("done"));assertEquals("linked",db.items().getJSONObject(0).getString("state"))
 }
 @Test fun ambiguousSameTimeJobsStaySeparate(){
  val event=Event("示例公司","工程师","JOB-1","written_test","start","2026-11-05T14:00:00","2026-11-05T16:00:00","东楼A301","create",body)
  db.manual(EventJson.write(event));db.manual(EventJson.write(event.copy(role="设计师",ref="JOB-2")))
  val id=db.save("sender",body,2);val parsed=extraction();parsed.getJSONArray("events").getJSONObject(0).put("role","").put("ref","");db.analyzed(id,parsed)
  assertEquals(2,db.schedules().length());assertEquals("review",db.items().getJSONObject(0).getString("state"))
 }
 @Test fun manualEditsSurviveLaterAutomatedEnrichment(){
  val id=db.save("HR",body,1);db.analyzed(id,extraction());val s=db.schedules().getJSONObject(0);s.put("location","用户确认地点");db.manual(s);db.complete(s.getLong("id"),true)
  val sms=db.save("sender",body,3);db.analyzed(sms,extraction());assertEquals("用户确认地点",db.schedules().getJSONObject(0).getString("location"));assertTrue(db.schedules().getJSONObject(0).getBoolean("done"))
 }
 @Test fun migratesPreviewCompletion(){
  db.close();val raw=context.openOrCreateDatabase("workflow-test.db",0,null);raw.execSQL("CREATE TABLE notices(id INTEGER PRIMARY KEY, fingerprint TEXT UNIQUE, body TEXT, received INTEGER, analysis TEXT, state TEXT DEFAULT 'pending', done INTEGER DEFAULT 0)");raw.execSQL("INSERT INTO notices(id,fingerprint,body,received,done) VALUES (1,'old',?,1,1)",arrayOf(body));raw.version=1;raw.close();db=LocalStore(context,"workflow-test.db")
  assertTrue(db.items().getJSONObject(0).getBoolean("done"));db.analyzed(1,extraction());assertTrue(db.schedules().getJSONObject(0).getBoolean("done"))
 }
}
