package app.careerflow.mobile
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import android.app.NotificationManager
@RunWith(AndroidJUnit4::class)
class ReminderDeliveryTest {
 @Test fun alarmDeliversSystemNotification(){val instrumentation=InstrumentationRegistry.getInstrumentation();val c=instrumentation.targetContext
  if(android.os.Build.VERSION.SDK_INT>=33)instrumentation.uiAutomation.grantRuntimePermission(c.packageName,"android.permission.POST_NOTIFICATIONS")
  instrumentation.uiAutomation.executeShellCommand("appops set ${c.packageName} SCHEDULE_EXACT_ALARM allow").close()
  val idle=InstrumentationRegistry.getArguments().getString("idleMode")=="true"
  fun shell(command:String)=instrumentation.uiAutomation.executeShellCommand(command).use{android.os.ParcelFileDescriptor.AutoCloseInputStream(it).bufferedReader().readText()}
  if(idle){shell("dumpsys battery unplug");shell("input keyevent KEYCODE_SLEEP");assertTrue(shell("dumpsys deviceidle force-idle").contains("idle",true))}
  try {
  val manager=c.getSystemService(NotificationManager::class.java);manager.cancel(0);Reminders.test(c)
  val deadline=System.currentTimeMillis()+30000;while(System.currentTimeMillis()<deadline&&manager.activeNotifications.none{it.id==0})Thread.sleep(500)
  assertTrue("Alarm receiver must deliver a system notification",manager.activeNotifications.any{it.id==0});manager.cancel(0)
  }finally{if(idle){shell("dumpsys deviceidle unforce");shell("dumpsys battery reset");shell("input keyevent KEYCODE_WAKEUP")}}
 }
}
