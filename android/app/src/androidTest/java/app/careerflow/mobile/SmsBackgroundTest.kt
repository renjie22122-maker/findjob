package app.careerflow.mobile
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.*
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.json.JSONObject
import org.json.JSONArray
@RunWith(AndroidJUnit4::class)
class SmsBackgroundTest {
 @Test fun consoleSmsReceivedInBackgroundLinksExistingEmail(){
  Assume.assumeTrue(InstrumentationRegistry.getArguments().getString("smsSmoke")=="true")
  val i=InstrumentationRegistry.getInstrumentation();val c=i.targetContext
  i.uiAutomation.grantRuntimePermission(c.packageName,"android.permission.RECEIVE_SMS")
  c.getSharedPreferences("preferences",0).edit().putBoolean("auto",true).commit()
  val live=InstrumentationRegistry.getArguments().getString("smsLive")=="true";val secrets=Secrets(c);val previous=secrets.read("llm-config")
  if(live){val file=java.io.File(c.filesDir,"api-test.json");val config=JSONObject(file.readText());file.delete();assertTrue(LlmApi.save(c,config))}
  val db=LocalStore(c);val body="Smoke Engineer interview 2026-11-05 14:00 to 2026-11-05 16:00 Room A"
  val e=Event("Smoke","Engineer","","interview","start","2026-11-05T14:00:00","2026-11-05T16:00:00","Room A","create",body)
  val extraction=JSONObject().put("events",JSONArray().put(EventJson.write(e)))
  val email=db.save("HR",body,1,"email","sms-background-test");db.analyzed(email,extraction);val sid=db.schedules().getJSONObject(0).getLong("id");db.complete(sid,true)
  try{
   i.uiAutomation.executeShellCommand("input keyevent KEYCODE_HOME").close()
   val deadline=System.currentTimeMillis()+50000;var sms:JSONObject?=null
   while(System.currentTimeMillis()<deadline){val rows=db.items();sms=(0 until rows.length()).map{rows.getJSONObject(it)}.firstOrNull{it.optString("source")=="sms"&&it.optString("body")==body};if(sms!=null)break;Thread.sleep(500)}
   assertNotNull("SMS_RECEIVED receiver must persist the modem-injected message in background",sms)
   if(live){i.uiAutomation.executeShellCommand("input keyevent KEYCODE_SLEEP").close();val end=System.currentTimeMillis()+180000;while(System.currentTimeMillis()<end){val rows=db.items();val item=(0 until rows.length()).map{rows.getJSONObject(it)}.first{it.getLong("id")==sms!!.getLong("id")};if(item.optJSONObject("analysis")!=null)break;Thread.sleep(250)}}
   else db.analyzed(sms!!.getLong("id"),JSONObject().put("events",JSONArray().put(EventJson.write(e.copy(role="")))))
   val s=(0 until db.schedules().length()).map{db.schedules().getJSONObject(it)}.first{it.getLong("id")==sid}
   assertTrue(s.getBoolean("done"));assertEquals(2,s.getJSONArray("sources").length())
  }finally{if(live)secrets.save(previous?:"{}","llm-config");i.uiAutomation.executeShellCommand("input keyevent KEYCODE_WAKEUP").close();c.getSharedPreferences("preferences",0).edit().putBoolean("auto",false).commit();db.writableDatabase.delete("evidence","schedule=?",arrayOf(sid.toString()));db.writableDatabase.delete("schedules","id=?",arrayOf(sid.toString()));db.writableDatabase.delete("notices","body=?",arrayOf(body));db.close()}
 }
}
