package app.careerflow.mobile
import android.app.*
import android.content.*
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.*
import java.util.concurrent.TimeUnit

object Reminders {
 private const val CHANNEL="careerflow_schedule"
 private fun pending(c:Context)=PendingIntent.getBroadcast(c,1,Intent(c,ReminderReceiver::class.java),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
 fun exact(c:Context)=Build.VERSION.SDK_INT<31||c.getSystemService(AlarmManager::class.java).canScheduleExactAlarms()
 @Synchronized fun refresh(c:Context){
  val manager=c.getSystemService(NotificationManager::class.java);manager.createNotificationChannel(NotificationChannel(CHANNEL,"CareerFlow · 日程提醒",NotificationManager.IMPORTANCE_HIGH))
  val store=LocalStore(c);var next:Long?=null;val now=System.currentTimeMillis()
  try{val schedules=store.schedules();for(i in 0 until schedules.length()){val s=schedules.getJSONObject(i);if(s.getBoolean("done")||s.getBoolean("cancelled"))continue;val due=ScheduleRules.due(EventJson.read(s))?:continue;var notified=false
   for(offset in listOf(0L,3600000L,86400000L)){val at=due-offset;val token="${s.getLong("id")}:$at";if(store.delivered(token))continue
    if(at<=now){if(!notified&&ReminderPolicy.deliver(at,due,now)&&NotificationManagerCompat.from(c).areNotificationsEnabled()){
     val intent=PendingIntent.getActivity(c,0,Intent(c,MainActivity::class.java),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
     try{NotificationManagerCompat.from(c).notify(s.getLong("id").toInt(),NotificationCompat.Builder(c,CHANNEL).setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle(s.optString("company")+" · "+s.optString("stage")).setContentText((if(s.optString("kind")=="start")s.optString("start") else s.optString("end"))+" · "+s.optString("location")).setContentIntent(intent).setAutoCancel(true).build());store.delivery(token);notified=true}catch(_:SecurityException){}
    }else if(notified||!ReminderPolicy.deliver(at,due,now))store.delivery(token)
    }else if(next==null||at<next!!)next=at
   }
  }}finally{store.close()}
  c.getSharedPreferences("background",0).edit().putLong("lastReminderCheck",now).putLong("nextAlarm",next?:0).apply()
  val alarm=c.getSystemService(AlarmManager::class.java);alarm.cancel(pending(c));next?.let{try{if(exact(c))alarm.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,it,pending(c))else alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,it,pending(c))}catch(_:SecurityException){alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,it,pending(c))}}
 }
 fun test(c:Context){val alarm=c.getSystemService(AlarmManager::class.java);val pi=PendingIntent.getBroadcast(c,2,Intent(c,ReminderReceiver::class.java).putExtra("test",true),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE);val at=System.currentTimeMillis()+10000;if(exact(c))alarm.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,pi)else alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,pi)}
 fun showTest(c:Context){c.getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel(CHANNEL,"CareerFlow · 日程提醒",NotificationManager.IMPORTANCE_HIGH));try{NotificationManagerCompat.from(c).notify(0,NotificationCompat.Builder(c,CHANNEL).setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle("赴程 · CareerFlow").setContentText("本地提醒测试成功 / Local reminder test succeeded").setAutoCancel(true).build())}catch(_:SecurityException){}}
 fun recoverAnalysis(c:Context){if(LlmApi.config(c).key.isBlank())return;val store=LocalStore(c);try{store.pendingIds().forEach{AnalysisWorker.enqueue(c,it)}}finally{store.close()}}
 fun periodic(c:Context){WorkManager.getInstance(c).enqueueUniquePeriodicWork("reminder-recovery",ExistingPeriodicWorkPolicy.KEEP,PeriodicWorkRequestBuilder<ReminderWorker>(15,TimeUnit.MINUTES).build())}
}
class ReminderReceiver:BroadcastReceiver(){override fun onReceive(c:Context,i:Intent){val pending=goAsync();Thread{try{if(i.getBooleanExtra("test",false))Reminders.showTest(c)else {Reminders.periodic(c);MailWorker.configure(c);Reminders.refresh(c);Reminders.recoverAnalysis(c)}}finally{pending.finish()}}.start()}}
class ReminderWorker(c:Context,p:WorkerParameters):Worker(c,p){override fun doWork():Result{Reminders.refresh(applicationContext);Reminders.recoverAnalysis(applicationContext);return Result.success()}}
