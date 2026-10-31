package app.careerflow.mobile
import android.content.Context
import androidx.work.*
import org.json.JSONObject
import org.json.JSONArray
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/** Interactive diagnostics never wait behind mail analysis WorkManager jobs. */
object ApiProbe {
 private val executor=Executors.newSingleThreadExecutor()
 private val running=AtomicBoolean(false)
 fun busy()=running.get()
 fun start(context:Context,models:Boolean,operation:(()->JSONArray?)?=null):Boolean {
  if(!running.compareAndSet(false,true))return false
  val c=context.applicationContext
  executor.execute {
   val prefs=c.getSharedPreferences("llm-probe",0)
   try {
    prefs.edit().putString("status","running").putLong("started",System.currentTimeMillis()).apply()
    val result=if(operation!=null)operation() else if(models)LlmApi.models(c,30) else {
     val answer=LlmApi.complete(c,JSONObject().put("max_tokens",512).put("response_format",JSONObject().put("type","json_object")).put("messages",JSONArray().put(JSONObject().put("role","user").put("content","Return only JSON: {\"ok\":true}"))),30)
     require(answer.optBoolean("ok"));null
    }
    val edit=prefs.edit().putString("status",if(models)"models_ok" else "ok")
    if(models)edit.putString("models",(result?:JSONArray()).toString());edit.apply()
   }catch(e:Exception){prefs.edit().putString("errorType",e.javaClass.simpleName).putString("status",when(e){is LlmApi.ApiFailure->"http_${e.status}";is LlmApi.OutputLimit->"output_limit";is org.json.JSONException->"format_error";is java.net.SocketTimeoutException->"timeout";is java.net.UnknownHostException->"network_unavailable";is javax.net.ssl.SSLException->"tls_error";else->"connection_or_format"}).apply()}
   finally{running.set(false)}
  }
  return true
 }
}
// Retained for persisted 0.4.0 WorkRequests. Obsolete diagnostics are discarded on upgrade.
class LlmProbeWorker(c:Context,p:WorkerParameters):Worker(c,p){
 override fun doWork():Result=Result.success()
 companion object{fun enqueue(c:Context,models:Boolean){ApiProbe.start(c,models)}}
}
