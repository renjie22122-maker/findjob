package app.careerflow.mobile
import android.content.Context
import androidx.work.*
import java.util.concurrent.TimeUnit

class ReanalysisWorker(c:Context,p:WorkerParameters):Worker(c,p){
 override fun doWork():Result {
  val c=applicationContext;val batch=ReanalysisStore(c);val run=inputData.getLong("run",0)
  try{
   if(!batch.active(run))return Result.success()
   if(AnalysisRuntime.hot(c)){batch.phase(run,"cooling");return Result.retry()}
   if(System.currentTimeMillis()<AnalysisRuntime.realtimeUntil.get()){batch.phase(run,"waiting_analysis");return Result.retry()}
   if(!AnalysisRuntime.lock.tryLock()){batch.phase(run,"waiting_analysis");return Result.retry()}
   try{
    if(!batch.active(run))return Result.success()
    val id=batch.next(run)?:run{batch.complete(run);return Result.success()}
    if(LlmApi.config(c).key.isBlank()){batch.pause("key_required");return Result.success()}
    batch.claim(run,id)
    try{val applied=AnalysisWorker.analyze(c,id,true){!isStopped};if(applied)batch.finish(run,id)else batch.pending(run,id)}
    catch(e:Exception){if(isStopped)batch.pending(run,id)else {val local=LocalStore(c);try{local.analysisState(id,"failed")}finally{local.close()};batch.finish(run,id,when(e){is LlmApi.ApiFailure->"http_${e.status}";is LlmApi.OutputLimit->"output_limit";is java.net.SocketTimeoutException->"timeout";else->"analysis_failed"})}}
    if(!isStopped&&batch.active(run)){if(batch.next(run)==null)batch.complete(run)else enqueue(c,run)}
    return Result.success()
   }finally{AnalysisRuntime.lock.unlock()}
  }finally{batch.close()}
 }
 companion object {
  fun enqueue(c:Context,run:Long){if(run<=0)return;WorkManager.getInstance(c).enqueueUniqueWork("reanalysis-$run",ExistingWorkPolicy.APPEND_OR_REPLACE,OneTimeWorkRequestBuilder<ReanalysisWorker>().setInputData(workDataOf("run" to run)).setInitialDelay(3,TimeUnit.SECONDS).setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).setRequiresBatteryNotLow(true).build()).setBackoffCriteria(BackoffPolicy.EXPONENTIAL,30,TimeUnit.SECONDS).build())}
  fun recover(c:Context){val store=ReanalysisStore(c);try{val state=store.state();val run=state.optLong("run");if(state.optString("status")=="running")WorkManager.getInstance(c).enqueueUniqueWork("reanalysis-$run",ExistingWorkPolicy.KEEP,OneTimeWorkRequestBuilder<ReanalysisWorker>().setInputData(workDataOf("run" to run)).setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).setRequiresBatteryNotLow(true).build()).build())}finally{store.close()}}
 }
}
