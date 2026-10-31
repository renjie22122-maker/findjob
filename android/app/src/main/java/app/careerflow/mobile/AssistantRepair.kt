package app.careerflow.mobile
import android.content.Context
import org.json.JSONObject

/** A small, auditable action surface; never deletes sources or resets completion. */
object AssistantRepair {
 fun apply(c:Context,action:String):String {
  val batch=ReanalysisStore(c)
  try {
   val state=batch.state();val status=state.optString("status")
   val outcome=when(action){
    "recover"->{Reminders.recoverAnalysis(c);Reminders.refresh(c);"已检查并提交未完成任务恢复；网络、电量与系统调度限制仍适用 / Recovery requested; system constraints still apply"}
    "pause"->{if(status!="running")return "没有正在运行的批次 / No running batch";batch.pause();"已暂停，当前通知处理完后停止 / Paused after current message"}
    "resume","retry_failed"->{if(status=="running")return "批次已运行，不重复创建 / Batch already running";if(state.optLong("run")==0L)return "尚未创建重新分析批次 / No batch exists";batch.resume(action=="retry_failed");ReanalysisWorker.enqueue(c,batch.latest());"已提交续跑，保留成功项和完成状态 / Resume requested; completed items preserved"}
    "refresh_reminders"->{Reminders.refresh(c);"已重新检查本地提醒 / Local reminders checked"}
    else->return "不支持该修复操作，未修改数据 / Unsupported action; no data changed"
   }
   val local=LocalStore(c);try{local.record("Assistant repair: $action · $outcome")}finally{local.close()};return outcome
  }finally{batch.close()}
 }
}
