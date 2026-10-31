package app.careerflow.mobile
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.*
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.json.JSONObject
import org.json.JSONArray

@RunWith(AndroidJUnit4::class)
class ReanalysisLiveTest {
 @Test fun actualWorkerUpdatesProgressAndLinksSmsWithoutResettingDone(){
  Assume.assumeTrue(InstrumentationRegistry.getArguments().getString("liveBatch")=="true")
  val c=InstrumentationRegistry.getInstrumentation().targetContext;val file=java.io.File(c.filesDir,"api-test.json");val cfg=JSONObject(file.readText()).put("maxTokens",0);file.delete();val secrets=Secrets(c);val before=secrets.read("llm-config");val local=LocalStore(c);val batch=ReanalysisStore(c);var run=0L;var sid=0L;var first=0L;var second=0L
  try{assertTrue(LlmApi.save(c,cfg));val text="合成测试公司邀请工程师参加AI面试，时间为2026年11月2日14:00至2026年11月4日18:00，期间任选时间完成。";first=local.save("HR",text,1,"email","live-batch-first");val wrong=Event(company="合成测试公司",role="工程师",stage="interview",start="2026-11-02T14:00",evidence=text);local.analyzed(first,JSONObject().put("events",JSONArray().put(EventJson.write(wrong))));sid=local.schedules().getJSONObject(0).getLong("id");local.complete(sid,true)
   second=local.save("HR","合成测试公司提醒工程师：之前通知的AI面试地点为线上面试平台，时间不变。",2,"sms","live-batch-second")
   run=batch.start(listOf(first,second));ReanalysisWorker.enqueue(c,run)
   val deadline=System.currentTimeMillis()+120000
   while(batch.state().optString("status")=="running"&&System.currentTimeMillis()<deadline)Thread.sleep(250)
   val state=batch.state();assertEquals(state.toString(),"completed",state.optString("status"));assertEquals(state.toString(),2,state.getInt("finished"));assertEquals(0,state.getInt("failed"))
   val all=local.schedules();val result=(0 until all.length()).map{all.getJSONObject(it)}.single{it.getLong("id")==sid};assertEquals("window",result.getString("kind"));assertTrue(result.getBoolean("done"));assertEquals(2,result.getJSONArray("sources").length());assertEquals("线上面试平台",result.getString("location"))
  }finally{if(run>0)androidx.work.WorkManager.getInstance(c).cancelUniqueWork("reanalysis-$run");secrets.save(before?:"{}","llm-config");local.writableDatabase.delete("evidence","schedule=?",arrayOf(sid.toString()));local.writableDatabase.delete("schedules","id=?",arrayOf(sid.toString()));local.writableDatabase.delete("notices","id IN (?,?)",arrayOf(first.toString(),second.toString()));local.close();batch.close()}
 }
}
