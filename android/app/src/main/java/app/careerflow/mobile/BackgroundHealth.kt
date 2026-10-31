package app.careerflow.mobile

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.PowerManager
import org.json.JSONObject

/** Small local diagnostics: never includes credentials or message bodies. */
object BackgroundHealth {
 fun batch(c:Context):JSONObject {
  val store=ReanalysisStore(c);val state=try{store.state()}finally{store.close()}
  val power=c.getSystemService(PowerManager::class.java)
  val network=c.getSystemService(ConnectivityManager::class.java)
  val online=network.getNetworkCapabilities(network.activeNetwork)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)==true
  val battery=c.getSystemService(BatteryManager::class.java);val level=battery.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
  val running=state.optString("status")=="running"
  val reason=when {
   !running->state.optString("phase")
   !online->"offline"
   !battery.isCharging&&level in 0..15->"low_battery"
   power.isDeviceIdleMode->"device_idle"
   AnalysisRuntime.hot(c)->"cooling"
   ReanalysisWorker.executing.get()==state.optLong("run")->state.optString("phase")
   AnalysisRuntime.lock.isLocked->"waiting_analysis"
   else->"scheduled"
  }
  return state.put("reason",reason).put("elapsedSeconds",((System.currentTimeMillis()-state.optLong("updated",System.currentTimeMillis()))/1000).coerceAtLeast(0)).put("online",online).put("battery",level).put("idle",power.isDeviceIdleMode).put("requestTimeoutSeconds",LlmApi.config(c).timeout)
 }
 fun snapshot(c:Context):JSONObject {val mail=c.getSharedPreferences("mail-status",0);val p=c.getSharedPreferences("background",0);return JSONObject().put("reanalysis",batch(c)).put("mailStatus",mail.getString("status","idle")).put("lastMailSync",mail.getLong("last",0)).put("lastReminderCheck",p.getLong("lastReminderCheck",0)).put("nextAlarm",p.getLong("nextAlarm",0)).put("notificationsEnabled",androidx.core.app.NotificationManagerCompat.from(c).areNotificationsEnabled()).put("exactAlarmAllowed",Reminders.exact(c))}
}
