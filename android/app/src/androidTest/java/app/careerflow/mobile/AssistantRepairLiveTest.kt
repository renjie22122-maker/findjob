package app.careerflow.mobile
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.*
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.json.JSONObject
@RunWith(AndroidJUnit4::class)
class AssistantRepairLiveTest {
 @Test fun conversationExecutesAndRecordsReminderRepair(){
  Assume.assumeTrue(InstrumentationRegistry.getArguments().getString("repairLive")=="true")
  val c=InstrumentationRegistry.getInstrumentation().targetContext;val file=java.io.File(c.filesDir,"api-test.json");val cfg=JSONObject(file.readText());file.delete();val secrets=Secrets(c);val old=secrets.read("llm-config");val prefs=c.getSharedPreferences("assistant",0);val history=prefs.getString("messages","[]")
  try{LlmApi.save(c,cfg);prefs.edit().putString("messages","[]").commit();AssistantWorker.send(c,"请立即重新检查本地提醒，不要修改日程、不要分析通知。执行后告诉我实际处理结果。");val end=System.currentTimeMillis()+120000;while(prefs.getString("status","")!="ready"&&System.currentTimeMillis()<end)Thread.sleep(200);assertEquals("ready",prefs.getString("status",""));assertTrue(prefs.getString("messages","")!!.contains("Action result"));val local=LocalStore(c);try{assertTrue(local.history().toString().contains("Assistant repair: refresh_reminders"))}finally{local.close()}}
  finally{secrets.save(old?:"{}","llm-config");prefs.edit().putString("messages",history).putString("status","idle").commit()}
 }
}
