package app.careerflow.mobile
import android.content.ContentValues
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.*
import org.junit.Assert.*
import org.junit.runner.RunWith
@RunWith(AndroidJUnit4::class)
class AssistantConfirmationLiveTest {
 @Test fun conversationalYesConfirmsOnlySavedProposal(){
  Assume.assumeTrue(InstrumentationRegistry.getArguments().getString("confirmLive")=="true")
  val c=InstrumentationRegistry.getInstrumentation().targetContext;val file=java.io.File(c.filesDir,"api-test.json");val cfg=JSONObject(file.readText());file.delete();val secrets=Secrets(c);val old=secrets.read("llm-config");val s=LocalStore(c);val ids=mutableListOf<Long>();val sources=mutableListOf<Long>();val a=AssistantSchedules(s)
  try{LlmApi.save(c,cfg);val text="澄清示例科技开发工程师AI面试时间2026年11月9日14:00至2026年11月9日15:00。";val e=Event(company="澄清示例科技",role="开发工程师",stage="interview",start="2026-11-09T14:00",end="2026-11-09T15:00",evidence=text)
   repeat(2){i->val n=s.save("Synthetic HR",text,1793410000000L+i,"email","confirm-live-$i");sources.add(n);val id=s.writableDatabase.insertOrThrow("schedules",null,ContentValues().apply{put("data",EventJson.write(e.copy(round=if(i==0)"AI面试" else "视频初面")).toString());put("done",i)});ids.add(id);s.writableDatabase.execSQL("INSERT INTO evidence(notice,ordinal,schedule) VALUES(?,0,?)",arrayOf(n,id))}
   val action=JSONObject().put("type","merge").put("keep",ids[0]).put("remove",ids[1]).put("reason","可能为同一场，但轮次名称不同")
   a.execute(JSONObject().put("scheduleActions",JSONArray().put(action)),AssistantContext.build(s,"澄清示例科技"),"confirm-seed");assertEquals(1,a.pending().length());val pending=a.pending().getJSONObject(0)
   val prefs=c.getSharedPreferences("assistant",0);prefs.edit().putString("messages",JSONArray().put(JSONObject().put("role","user").put("content","核对澄清示例科技的重复面试，有歧义再问我")).put(JSONObject().put("role","assistant").put("content",pending.getString("question"))).toString()).commit()
   AssistantWorker.send(c,"是，同一场考试，确认合并刚才这两条，保留日程 #${ids[0]}，保留已完成状态。")
   val end=System.currentTimeMillis()+120000;while(prefs.getString("status","")!="ready"&&System.currentTimeMillis()<end)Thread.sleep(250)
   assertEquals(prefs.getString("messages",""),"ready",prefs.getString("status",""));assertEquals(prefs.getString("messages",""),0,a.pending().length());val rows=s.schedules();assertEquals(prefs.getString("messages",""),1,rows.length());assertTrue(rows.getJSONObject(0).getBoolean("done"));assertEquals(2,s.sources(ids[0]).length());assertTrue(JSONObject(s.history().getJSONObject(0).getString("detail")).getBoolean("confirmed"))
  }finally{secrets.save(old?:"{}","llm-config");for(n in sources){s.writableDatabase.delete("evidence","notice=?",arrayOf(n.toString()));s.writableDatabase.delete("notices","id=?",arrayOf(n.toString()))};for(id in ids)s.writableDatabase.delete("schedules","id=?",arrayOf(id.toString()));s.close()}
 }
}
