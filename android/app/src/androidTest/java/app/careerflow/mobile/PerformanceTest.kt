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
 @Test fun asynchronousSnapshotAndSystemBackKeepWebViewResponsive(){
  val activity=instrumentation.startActivitySync(android.content.Intent(context,MainActivity::class.java).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)) as MainActivity
  fun evaluate(script:String):String{val latch=CountDownLatch(1);var value="";instrumentation.runOnMainSync{val view=(activity.findViewById<android.view.ViewGroup>(android.R.id.content)).getChildAt(0) as android.webkit.WebView;view.evaluateJavascript(script){value=it;latch.countDown()}};assertTrue(latch.await(3,TimeUnit.SECONDS));return value}
  try{
   val deadline=System.currentTimeMillis()+10000
   while(evaluate("typeof window.handleMobileBack==='function'")!="true"&&System.currentTimeMillis()<deadline)Thread.sleep(100)
   assertEquals("true",evaluate("typeof window.handleMobileBack==='function'"))
   assertEquals("true",evaluate("window.snapshotArrived=false;window.onMobileSnapshot=v=>{window.snapshotArrived=!!v&&Array.isArray(JSON.parse(v).schedules)};CareerFlow.requestState();true"))
   val until=System.currentTimeMillis()+5000
   while(evaluate("window.snapshotArrived")!="true"&&System.currentTimeMillis()<until)Thread.sleep(50)
   assertEquals("true",evaluate("window.snapshotArrived"))
   evaluate("navigate('calendar');document.getElementById('assistantDialog').showModal()")
   instrumentation.runOnMainSync{activity.onBackPressed()};Thread.sleep(100)
   assertEquals("true",evaluate("!document.getElementById('assistantDialog').open && active==='calendar'"))
   instrumentation.runOnMainSync{activity.onBackPressed()};Thread.sleep(100)
   assertEquals("true",evaluate("active==='home'"))
  }finally{instrumentation.runOnMainSync{activity.finish()}}
 }
 @Test fun actualWebViewTwoFingerGesturePreviewsAndCommits(){
  val activity=instrumentation.startActivitySync(android.content.Intent(context,MainActivity::class.java).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)) as MainActivity
  lateinit var web:android.webkit.WebView
  instrumentation.runOnMainSync{web=(activity.findViewById<android.view.ViewGroup>(android.R.id.content)).getChildAt(0) as android.webkit.WebView}
  fun js(script:String):String{val latch=CountDownLatch(1);var result="";instrumentation.runOnMainSync{web.evaluateJavascript(script){result=it;latch.countDown()}};assertTrue(latch.await(3,TimeUnit.SECONDS));return result}
  try{
   val limit=System.currentTimeMillis()+10000;while(js("!!document.querySelector('.progress-plot')")!="true"&&System.currentTimeMillis()<limit)Thread.sleep(100)
   js("overviewSpan=90;renderOverviewTimeline();document.querySelector('.progress-plot').scrollIntoView({block:'center'})");Thread.sleep(250)
   val encoded=js("JSON.stringify((()=>{const r=document.querySelector('.progress-plot').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,width:innerWidth}})())")
   val box=JSONObject(org.json.JSONTokener(encoded).nextValue() as String);val location=IntArray(2);var scale=1f
   instrumentation.runOnMainSync{web.getLocationOnScreen(location);scale=web.width/box.getDouble("width").toFloat()}
   val x=location[0]+box.getDouble("x").toFloat()*scale;val y=location[1]+box.getDouble("y").toFloat()*scale;val distance=40*scale;val down=android.os.SystemClock.uptimeMillis()
   fun touch(action:Int,count:Int,gap:Float){val props=Array(count){i->android.view.MotionEvent.PointerProperties().apply{id=i;toolType=android.view.MotionEvent.TOOL_TYPE_FINGER}};val coords=Array(count){i->android.view.MotionEvent.PointerCoords().apply{this.x=x+if(i==0)-gap else gap;this.y=y;pressure=1f;size=1f}};val event=android.view.MotionEvent.obtain(down,android.os.SystemClock.uptimeMillis(),action,count,props,coords,0,0,1f,1f,0,0,android.view.InputDevice.SOURCE_TOUCHSCREEN,0);instrumentation.sendPointerSync(event);event.recycle()}
   touch(android.view.MotionEvent.ACTION_DOWN,1,distance);touch(android.view.MotionEvent.ACTION_POINTER_DOWN or (1 shl 8),2,distance)
   repeat(4){i->touch(android.view.MotionEvent.ACTION_MOVE,2,distance*(1+(i+1)*.15f));Thread.sleep(30)}
   assertEquals("true",js("!!document.querySelector('.progress-plot g').getAttribute('transform')"))
   touch(android.view.MotionEvent.ACTION_POINTER_UP or (1 shl 8),2,distance*1.6f);touch(android.view.MotionEvent.ACTION_UP,1,distance*1.6f);Thread.sleep(150)
   assertEquals("true",js("overviewSpan<90 && overviewSpan>=7"))
  }finally{instrumentation.runOnMainSync{activity.finish()}}
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
