package app.careerflow.mobile
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import android.app.NotificationManager
import java.time.Instant
import java.time.ZoneId
@RunWith(AndroidJUnit4::class)
class BackgroundDeliveryTest {
 @Test fun scheduleAlarmDeliversWhileScreenOffAndDozing(){
  val i=InstrumentationRegistry.getInstrumentation();val c=i.targetContext;val db=LocalStore(c);val manager=c.getSystemService(NotificationManager::class.java)
  fun shell(command:String){i.uiAutomation.executeShellCommand(command).use{android.os.ParcelFileDescriptor.AutoCloseInputStream(it).readBytes()}}
  if(android.os.Build.VERSION.SDK_INT>=33)i.uiAutomation.grantRuntimePermission(c.packageName,"android.permission.POST_NOTIFICATIONS")
  shell("appops set ${c.packageName} SCHEDULE_EXACT_ALARM allow")
  val date=Instant.ofEpochMilli(System.currentTimeMillis()+12000).atZone(ZoneId.of("Asia/Shanghai")).toLocalDateTime().withNano(0).toString()
  db.manual(EventJson.write(Event(company="Background test",stage="interview",start=date)))
  val sid=db.schedules().getJSONObject(0).getLong("id")
  try{
   Reminders.refresh(c);manager.cancel(sid.toInt())
   shell("input keyevent KEYCODE_HOME");shell("dumpsys battery unplug");shell("input keyevent KEYCODE_SLEEP");shell("dumpsys deviceidle force-idle")
   val deadline=System.currentTimeMillis()+45000
   while(System.currentTimeMillis()<deadline&&manager.activeNotifications.none{it.id==sid.toInt()})Thread.sleep(500)
   assertTrue("Real schedule must notify with activity backgrounded and device idle",manager.activeNotifications.any{it.id==sid.toInt()})
   assertTrue(db.delivered("$sid:${ScheduleRules.time(date)}"))
   manager.cancel(sid.toInt());Reminders.refresh(c)
   assertFalse("A delivered alarm must not repeat",manager.activeNotifications.any{it.id==sid.toInt()})
  }finally{shell("dumpsys deviceidle unforce");shell("dumpsys battery reset");shell("input keyevent KEYCODE_WAKEUP");db.writableDatabase.delete("schedules","id=?",arrayOf(sid.toString()));db.close();Reminders.refresh(c);manager.cancel(sid.toInt())}
 }
}
