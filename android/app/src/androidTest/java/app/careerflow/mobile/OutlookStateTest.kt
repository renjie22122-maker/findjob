package app.careerflow.mobile
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
@RunWith(AndroidJUnit4::class)
class OutlookStateTest {
 @Test fun hidesExpiredLegacyAndCancelledCodes(){
  val c=InstrumentationRegistry.getInstrumentation().targetContext
  val prefs=c.getSharedPreferences("oauth-status",0)
  try {
   prefs.edit().clear().putString("status","pending").putString("code","TESTONLY").putLong("expires",System.currentTimeMillis()+60000).putString("verificationUri","https://www.microsoft.com/link").commit()
   val live=OutlookAuth.view(c)
   assertTrue(live.getBoolean("oauthCanOpen"));assertEquals("https://www.microsoft.com/link",live.getString("oauthVerificationUri"));assertEquals("TESTONLY",live.getString("oauthCode"))
   prefs.edit().putLong("expires",1).commit()
   assertEquals("expired",OutlookAuth.view(c).getString("oauthStatus"));assertEquals("",OutlookAuth.view(c).getString("oauthCode"));assertFalse(OutlookAuth.view(c).getBoolean("oauthCanOpen"))
   prefs.edit().remove("expires").remove("verificationUri").commit()
   assertEquals("restart_required",OutlookAuth.view(c).getString("oauthStatus"))
   prefs.edit().clear().putString("status","idle").commit()
   assertFalse(OutlookAuth.view(c).getBoolean("oauthCanOpen"))
  } finally {prefs.edit().clear().commit()}
 }
}
