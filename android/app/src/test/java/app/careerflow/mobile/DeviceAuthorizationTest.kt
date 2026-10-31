package app.careerflow.mobile
import org.junit.Assert.*
import org.junit.Test
class DeviceAuthorizationTest {
 @Test fun respectsReturnedOfficialPage(){
  listOf("https://www.microsoft.com/link","https://microsoft.com/devicelogin","https://login.microsoftonline.com/common/oauth2/deviceauth").forEach { assertEquals(it,DeviceAuthorization.verificationUri(it)) }
 }
 @Test fun rejectsUnsafeDestinations(){
  listOf("http://www.microsoft.com/link","https://www.microsoft.com.evil.test/link","https://evil.test/link","https://user@microsoft.com/link","https://microsoft.com:8443/link","https://microsoft.com/link#fragment","https://microsoft.com/unknown","").forEach { assertNull(it,DeviceAuthorization.verificationUri(it)) }
 }
 @Test fun expiresAndRequiresCompleteState(){
  val url="https://www.microsoft.com/link"
  assertTrue(DeviceAuthorization.usable("TESTONLY",200,url,100))
  assertFalse(DeviceAuthorization.usable("TESTONLY",100,url,100))
  assertFalse(DeviceAuthorization.usable("",200,url,100))
  assertFalse(DeviceAuthorization.usable("TESTONLY",200,"",100))
 }
}
