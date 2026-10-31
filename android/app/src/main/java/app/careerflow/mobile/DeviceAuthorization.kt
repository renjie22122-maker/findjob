package app.careerflow.mobile

import java.net.URI

/** Only device-verification pages returned by Microsoft may be opened. */
object DeviceAuthorization {
 fun verificationUri(raw:String):String?=try {
  val uri=URI(raw)
  val host=uri.host?.lowercase()
  val path=uri.path.trimEnd('/').lowercase()
  val allowed=when(host){
   "microsoft.com","www.microsoft.com" -> path in setOf("/link","/devicelogin")
   "login.microsoftonline.com" -> path in setOf("/common/oauth2/deviceauth","/consumers/oauth2/deviceauth","/organizations/oauth2/deviceauth")
   "login.live.com" -> path=="/oauth20_remoteconnect.srf"
   else -> false
  }
  if(uri.scheme.equals("https",true)&&uri.userInfo==null&&uri.port in setOf(-1,443)&&uri.fragment==null&&allowed)uri.toASCIIString()else null
 }catch(_:Exception){null}
 fun usable(code:String,expires:Long,url:String,now:Long)=code.isNotBlank()&&expires>now&&verificationUri(url)!=null
}
