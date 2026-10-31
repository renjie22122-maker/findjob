package app.careerflow.mobile
import android.content.ContentValues
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.*
import org.junit.Assert.*
import org.junit.runner.RunWith

/** Explicit opt-in: configured API, synthetic sources only. Run in a clean emulator. */
@RunWith(AndroidJUnit4::class)
class AssistantSchedulesLiveTest {
 @Test fun conversationCrossChecksSmsMergesDuplicatesAndCreatesMissingReminder(){
  Assume.assumeTrue(InstrumentationRegistry.getArguments().getString("scheduleLive")=="true")
  val c=InstrumentationRegistry.getInstrumentation().targetContext;val file=java.io.File(c.filesDir,"api-test.json");val cfg=JSONObject(file.readText());file.delete();val secrets=Secrets(c);val old=secrets.read("llm-config");val s=LocalStore(c);val notices=mutableListOf<Long>();val scheduleIds=mutableListOf<Long>()
  fun notice(text:String,index:Int):Long=s.save("Synthetic HR",text,1793410000000L+index*1000L,if(index==3)"sms" else "email","conversation-live-$index").also{notices.add(it)}
  fun schedule(n:Long,e:Event,done:Boolean):Long {val id=s.writableDatabase.insertOrThrow("schedules",null,ContentValues().apply{put("data",EventJson.write(e).toString());put("done",if(done)1 else 0)});s.writableDatabase.execSQL("INSERT INTO evidence(notice,ordinal,schedule) VALUES(?,0,?)",arrayOf(n,id));scheduleIds.add(id);return id}
  try{
   assertTrue(LlmApi.save(c,cfg));val text="对话验证科技软件工程师面试时间：2026年11月7日14:00至2026年11月7日15:00。";val e=Event(company="对话验证科技",role="软件工程师",stage="interview",start="2026-11-07T14:00",end="2026-11-07T15:00",evidence=text)
   val keep=schedule(notice(text,1),e,false);val duplicate=schedule(notice(text,2),e,true)
   val location=notice("对话验证科技软件工程师面试地点补充：杭州会议室B；时间不变。",3)
   val missing=notice("新程测试有限公司数据工程师笔试时间2026年11月8日09:00至2026年11月8日11:00，地点线上考试。",4)
   c.getSharedPreferences("assistant",0).edit().putString("messages","[]").commit()
   AssistantWorker.send(c,"请实际核查并修复：对话验证科技软件工程师日程 #$keep 和 #$duplicate 是重复记录，合并并保留 #$keep；根据通知 #$location 补充面试地点；根据通知 #$missing 补齐新程测试有限公司遗漏的笔试日程和提醒。保留已完成状态，不要打开链接。")
   val prefs=c.getSharedPreferences("assistant",0);val until=System.currentTimeMillis()+180000;while(prefs.getString("status","")!="ready"&&System.currentTimeMillis()<until)Thread.sleep(250)
   assertEquals(prefs.getString("messages",""),"ready",prefs.getString("status",""));val rows=s.schedules();assertEquals(prefs.getString("messages",""),2,rows.length());val result=(0 until rows.length()).map{rows.getJSONObject(it)}.single{it.getLong("id")==keep}
   assertTrue("Completion: "+prefs.getString("messages","")+" Result="+result.toString(),result.getBoolean("done"));assertEquals("杭州会议室B",result.getString("location"));assertEquals(3,s.sources(keep).length());assertTrue("Audit: "+prefs.getString("messages","")+" History="+s.history().toString(),s.history().toString().contains("beforeRemove"));val exam=(0 until rows.length()).map{rows.getJSONObject(it)}.single{it.optString("company")=="新程测试有限公司"};assertTrue("Exam="+exam.toString(),exam.getString("start").startsWith("2026-11-08T09:00"));assertNotNull(ScheduleRules.due(EventJson.read(exam)))
  }finally{androidx.work.WorkManager.getInstance(c).cancelUniqueWork("assistant").result.get();secrets.save(old?:"{}","llm-config");for(n in notices){s.writableDatabase.delete("evidence","notice=?",arrayOf(n.toString()));s.writableDatabase.delete("notices","id=?",arrayOf(n.toString()))};s.writableDatabase.delete("schedules","data LIKE ? OR data LIKE ?",arrayOf("%对话验证科技%","%新程测试有限公司%"));s.close()}
 }
}
