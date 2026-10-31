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
   val automation=InstrumentationRegistry.getInstrumentation().uiAutomation
   automation.executeShellCommand("input keyevent KEYCODE_HOME").close()
   automation.executeShellCommand("input keyevent KEYCODE_SLEEP").close()
   run=batch.start(listOf(first,second));ReanalysisWorker.enqueue(c,run)
   // Interrupt after one durable result, then recover the cancelled work chain.
   val firstDeadline=System.currentTimeMillis()+180000
   while(batch.state().optInt("finished")==0&&batch.active(run)&&System.currentTimeMillis()<firstDeadline)Thread.sleep(100)
   assertEquals(batch.state().toString(),1,batch.state().optInt("finished"))
   androidx.work.WorkManager.getInstance(c).cancelUniqueWork("reanalysis-$run").result.get()
   val waitUntil=System.currentTimeMillis()+10000;while(ReanalysisWorker.executing.get()!=0L&&System.currentTimeMillis()<waitUntil)Thread.sleep(50)
   ReanalysisWorker.recover(c)
   val deadline=System.currentTimeMillis()+180000
   while(batch.state().optString("status")=="running"&&System.currentTimeMillis()<deadline)Thread.sleep(250)
   val state=batch.state();assertEquals(state.toString(),"completed",state.optString("status"));assertEquals(state.toString(),2,state.getInt("finished"));assertEquals(0,state.getInt("failed"))
   val all=local.schedules();val result=(0 until all.length()).map{all.getJSONObject(it)}.single{it.getLong("id")==sid};assertEquals("Synthetic extraction: "+local.readableDatabase.rawQuery("SELECT analysis FROM notices WHERE id IN (?,?)",arrayOf(first.toString(),second.toString())).use{q->buildString{while(q.moveToNext())append(q.getString(0))}},"window",result.getString("kind"));assertTrue(result.getBoolean("done"));assertEquals(2,result.getJSONArray("sources").length());assertEquals("线上面试平台",result.getString("location"))
  }finally{InstrumentationRegistry.getInstrumentation().uiAutomation.executeShellCommand("input keyevent KEYCODE_WAKEUP").close();if(run>0)androidx.work.WorkManager.getInstance(c).cancelUniqueWork("reanalysis-$run");secrets.save(before?:"{}","llm-config");local.writableDatabase.delete("evidence","schedule=?",arrayOf(sid.toString()));local.writableDatabase.delete("schedules","id=?",arrayOf(sid.toString()));local.writableDatabase.delete("notices","id IN (?,?)",arrayOf(first.toString(),second.toString()));local.close();batch.close()}
 }
}
