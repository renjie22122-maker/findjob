package app.careerflow.mobile
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.*
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class PerformanceTest {
 private val instrumentation=InstrumentationRegistry.getInstrumentation()
 private val context=instrumentation.targetContext
 private fun idle(){val until=System.currentTimeMillis()+5000;while(ApiProbe.busy()&&System.currentTimeMillis()<until)Thread.sleep(10);assertFalse(ApiProbe.busy())}
 @Test fun slowProbeDoesNotBlockMainThreadOrAcceptDuplicateClicks(){
  idle();val entered=CountDownLatch(1);val release=CountDownLatch(1);var accepted=false
  try{val before=System.currentTimeMillis();instrumentation.runOnMainSync{accepted=ApiProbe.start(context,true){entered.countDown();release.await(4,TimeUnit.SECONDS);JSONArray().put("custom-model")}}
   assertTrue(accepted);assertTrue("Button should return immediately",System.currentTimeMillis()-before<1500);assertTrue(entered.await(2,TimeUnit.SECONDS))
   assertFalse(ApiProbe.start(context,true){throw AssertionError("duplicate request")})
   var heartbeat=false;instrumentation.runOnMainSync{heartbeat=true};assertTrue(heartbeat)
  }finally{release.countDown();idle()}
  assertEquals("models_ok",context.getSharedPreferences("llm-probe",0).getString("status",""))
 }
 @Test fun timeoutAndHttpFailuresRemainRecoverable(){idle();ApiProbe.start(context,false){throw java.net.SocketTimeoutException()};idle();assertEquals("timeout",context.getSharedPreferences("llm-probe",0).getString("status",""));ApiProbe.start(context,false){throw LlmApi.ApiFailure(401)};idle();assertEquals("http_401",context.getSharedPreferences("llm-probe",0).getString("status",""));ApiProbe.start(context,false){null};idle();assertEquals("ok",context.getSharedPreferences("llm-probe",0).getString("status",""))}
 @Test fun summaryReadsDoNotLoadEvidenceBodies(){val name="performance-test.db";context.deleteDatabase(name);val store=LocalStore(context,name)
  try{repeat(200){n->val body="Example interview 2026-11-02 14:00 "+"source ".repeat(500);val notice=store.save("HR",body,n.toLong(),"email","perf-$n");val event=Event(company="Example$n",stage="interview",start="2026-11-02T14:00",evidence=body);val sid=store.writableDatabase.insertOrThrow("schedules",null,android.content.ContentValues().apply{put("data",EventJson.write(event).toString())});store.writableDatabase.execSQL("INSERT INTO evidence(notice,ordinal,schedule) VALUES(?,0,?)",arrayOf(notice,sid))}
   val summary=store.schedules(false);assertEquals(200,summary.length());assertEquals(0,summary.getJSONObject(0).getJSONArray("sources").length());val full=store.schedules();assertEquals(1,full.getJSONObject(0).getJSONArray("sources").length());assertTrue(full.getJSONObject(0).getJSONArray("sources").getJSONObject(0).getString("body").contains("source"))
  }finally{store.close();context.deleteDatabase(name)}
 }
 @Test fun webViewModelButtonRemainsResponsiveDuringSlowProbe(){
  idle();val release=CountDownLatch(1);val started=CountDownLatch(1)
  val activity=instrumentation.startActivitySync(android.content.Intent(context,MainActivity::class.java).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK))
  try{val ready=CountDownLatch(1);val deadline=System.currentTimeMillis()+10000
   while(ready.count>0&&System.currentTimeMillis()<deadline){instrumentation.runOnMainSync{val view=(activity.findViewById<android.view.ViewGroup>(android.R.id.content)).getChildAt(0) as android.webkit.WebView;view.evaluateJavascript("typeof renderApiSettings === 'function'"){if(it=="true")ready.countDown()}};Thread.sleep(100)}
   assertEquals(0L,ready.count);assertTrue(ApiProbe.start(context,true){started.countDown();release.await(5,TimeUnit.SECONDS);JSONArray().put("test")});assertTrue(started.await(2,TimeUnit.SECONDS))
   val responded=CountDownLatch(1);instrumentation.runOnMainSync{val view=(activity.findViewById<android.view.ViewGroup>(android.R.id.content)).getChildAt(0) as android.webkit.WebView;view.evaluateJavascript("active='settings';render();document.getElementById('llmLoad').disabled=false;document.getElementById('llmLoad').click();'responsive'"){if(it=="\"responsive\"")responded.countDown()}}
   assertTrue("Model button must not block WebView",responded.await(2,TimeUnit.SECONDS))
  }finally{release.countDown();idle();instrumentation.runOnMainSync{activity.finish()}}
 }
 @Test fun nativeConfiguredApiProbe(){
  Assume.assumeTrue(InstrumentationRegistry.getArguments().getString("liveApi")=="true")
  val file=java.io.File(context.filesDir,"api-test.json");val configuration=JSONObject(file.readText());file.delete()
  val secrets=Secrets(context);val before=secrets.read("llm-config")
  try{assertTrue(LlmApi.save(context,configuration));assertTrue(ApiProbe.start(context,true));val deadline=System.currentTimeMillis()+40000;while(ApiProbe.busy()&&System.currentTimeMillis()<deadline)Thread.sleep(100);assertFalse(ApiProbe.busy());assertEquals("models_ok",context.getSharedPreferences("llm-probe",0).getString("status",""));assertTrue(JSONArray(context.getSharedPreferences("llm-probe",0).getString("models","[]")).length()>0)
   assertTrue(ApiProbe.start(context,false));val second=System.currentTimeMillis()+40000;while(ApiProbe.busy()&&System.currentTimeMillis()<second)Thread.sleep(100);assertFalse(ApiProbe.busy());assertEquals("ok",context.getSharedPreferences("llm-probe",0).getString("status",""))
  }finally{secrets.save(before?:"{}","llm-config")}
 }
}
