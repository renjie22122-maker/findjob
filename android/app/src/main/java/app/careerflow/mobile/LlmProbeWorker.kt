package app.careerflow.mobile
import android.content.Context
import androidx.work.*
import org.json.JSONObject
import org.json.JSONArray
class LlmProbeWorker(c:Context,p:WorkerParameters):Worker(c,p){override fun doWork():Result{val prefs=applicationContext.getSharedPreferences("llm-probe",0);prefs.edit().putString("status","running").apply();return try{if(inputData.getBoolean("models",false)){prefs.edit().putString("models",LlmApi.models(applicationContext).toString()).putString("status","models_ok").apply()}else{val result=LlmApi.complete(applicationContext,JSONObject().put("max_tokens",64).put("response_format",JSONObject().put("type","json_object")).put("messages",JSONArray().put(JSONObject().put("role","user").put("content","Return only JSON: {\"ok\":true}"))));require(result.optBoolean("ok"));prefs.edit().putString("status","ok").apply()};Result.success()}catch(e:Exception){prefs.edit().putString("status",if(e is LlmApi.ApiFailure)"http_${e.status}" else "connection_or_format").apply();Result.failure()}}
 companion object{fun enqueue(c:Context,models:Boolean){c.getSharedPreferences("llm-probe",0).edit().putString("status","queued").apply();WorkManager.getInstance(c).enqueueUniqueWork("llm-probe",ExistingWorkPolicy.KEEP,OneTimeWorkRequestBuilder<LlmProbeWorker>().setInputData(workDataOf("models" to models)).setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build())}}
}
