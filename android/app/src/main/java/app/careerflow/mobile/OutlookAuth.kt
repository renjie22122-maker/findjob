package app.careerflow.mobile
import android.content.Context
import androidx.work.*
import org.json.JSONObject
import java.net.URL
import java.net.URLEncoder
import javax.net.ssl.HttpsURLConnection
import java.util.concurrent.TimeUnit

object OutlookAuth {
 const val SCOPE="offline_access https://outlook.office.com/IMAP.AccessAsUser.All"
 fun post(tenant:String,path:String,values:Map<String,String>):JSONObject {
  require(tenant.matches(Regex("[a-zA-Z0-9-]+")))
  val connection=URL("https://login.microsoftonline.com/$tenant/oauth2/v2.0/$path").openConnection() as HttpsURLConnection
  try{connection.requestMethod="POST";connection.doOutput=true;connection.instanceFollowRedirects=false;connection.connectTimeout=15000;connection.readTimeout=30000;connection.setRequestProperty("Content-Type","application/x-www-form-urlencoded")
   val encoded=values.entries.joinToString("&"){URLEncoder.encode(it.key,"UTF-8")+"="+URLEncoder.encode(it.value,"UTF-8")};connection.outputStream.use{it.write(encoded.toByteArray())}
   val stream=if(connection.responseCode in 200..299)connection.inputStream else connection.errorStream
   return JSONObject(stream.bufferedReader().use{it.readText()})
  }finally{connection.disconnect()}
 }
 @Synchronized fun token(c:Context,config:JSONObject):String {
  if(config.optLong("expires")>System.currentTimeMillis()+120000)return config.getString("accessToken")
  val response=post(config.getString("tenant"),"token",mapOf("client_id" to config.getString("clientId"),"grant_type" to "refresh_token","refresh_token" to config.getString("refreshToken"),"scope" to SCOPE))
  if(!response.has("access_token"))throw javax.mail.AuthenticationFailedException("OAuth renewal failed")
  config.put("accessToken",response.getString("access_token")).put("refreshToken",response.optString("refresh_token",config.getString("refreshToken"))).put("expires",System.currentTimeMillis()+response.optLong("expires_in",3600)*1000)
  val current=JSONObject(Secrets(c).read("mail")?:throw javax.mail.AuthenticationFailedException("Mailbox removed"))
  if(current.optString("user")!=config.optString("user")||current.optString("clientId")!=config.optString("clientId"))throw javax.mail.AuthenticationFailedException("Mailbox changed")
  current.put("accessToken",config.getString("accessToken")).put("refreshToken",config.getString("refreshToken")).put("expires",config.getLong("expires"))
  Secrets(c).save(current.toString(),"mail");return config.getString("accessToken")
 }
 fun view(c:Context):JSONObject {
  val ui=c.getSharedPreferences("oauth-status",0)
  val status=ui.getString("status","idle")?:"idle"
  val expires=ui.getLong("expires",0)
  val url=DeviceAuthorization.verificationUri(ui.getString("verificationUri","")?:"")?:""
  val code=ui.getString("code","")?:""
  val live=DeviceAuthorization.usable(code,expires,url,System.currentTimeMillis())
  val effective=if(code.isNotBlank()&&expires==0L)"restart_required" else if(code.isNotBlank()&&expires<=System.currentTimeMillis())"expired" else if(code.isNotBlank()&&url.isBlank())"restart_required" else status
  return JSONObject().put("oauthStatus",effective).put("oauthCode",if(live)code else "").put("oauthExpires",expires).put("oauthVerificationUri",if(live)url else "").put("oauthCanOpen",live)
 }
 fun start(c:Context,client:String,tenant:String,user:String):Boolean {
  if(!client.matches(Regex("[a-fA-F0-9-]{36}"))||!tenant.matches(Regex("[a-zA-Z0-9-]+"))||!user.contains('@'))return false
  Secrets(c).save(JSONObject().put("flow",java.util.UUID.randomUUID().toString()).put("clientId",client).put("tenant",tenant).put("user",user).toString(),"oauth-pending")
  c.getSharedPreferences("oauth-status",0).edit().clear().putString("status","requesting").apply()
  WorkManager.getInstance(c).enqueueUniqueWork("outlook-authorization",ExistingWorkPolicy.REPLACE,OneTimeWorkRequestBuilder<OutlookWorker>().setBackoffCriteria(BackoffPolicy.LINEAR,10,TimeUnit.SECONDS).setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build());return true
 }
}
class OutlookWorker(c:Context,p:WorkerParameters):Worker(c,p){
 override fun doWork():Result {val c=applicationContext;val ui=c.getSharedPreferences("oauth-status",0)
  try{val config=JSONObject(Secrets(c).read("oauth-pending")?:return Result.failure())
   fun active()=!isStopped&&JSONObject(Secrets(c).read("oauth-pending")?:"{}").optString("flow")==config.optString("flow")
   if(!active())return Result.failure()
   if(!config.has("device_code")){val response=OutlookAuth.post(config.getString("tenant"),"devicecode",mapOf("client_id" to config.getString("clientId"),"scope" to OutlookAuth.SCOPE));if(!active())return Result.failure();if(!response.has("device_code")){ui.edit().putString("status","failed").apply();return Result.failure()}
    val verification=DeviceAuthorization.verificationUri(response.optString("verification_uri",response.optString("verification_url")))
    if(verification==null){ui.edit().clear().putString("status","invalid_verification_uri").apply();return Result.failure()}
    config.put("device_code",response.getString("device_code")).put("expires",System.currentTimeMillis()+response.getLong("expires_in")*1000).put("interval",maxOf(5,response.optInt("interval",5))).put("nextPoll",System.currentTimeMillis()+maxOf(5,response.optInt("interval",5))*1000)
    Secrets(c).save(config.toString(),"oauth-pending");ui.edit().putString("status","pending").putString("code",response.getString("user_code")).putLong("expires",config.getLong("expires")).putString("verificationUri",verification).apply();return Result.retry()
   }
   if(System.currentTimeMillis()>config.getLong("expires")){ui.edit().clear().putString("status","expired").apply();return Result.failure()}
   if(System.currentTimeMillis()<config.optLong("nextPoll"))return Result.retry()
   val response=OutlookAuth.post(config.getString("tenant"),"token",mapOf("client_id" to config.getString("clientId"),"grant_type" to "urn:ietf:params:oauth:grant-type:device_code","device_code" to config.getString("device_code")))
   if(!active())return Result.failure()
   if(response.has("access_token")){val mail=JSONObject().put("host","outlook.office365.com").put("user",config.getString("user")).put("enabled",true).put("authMode","oauth2").put("clientId",config.getString("clientId")).put("tenant",config.getString("tenant")).put("accessToken",response.getString("access_token")).put("refreshToken",response.getString("refresh_token")).put("expires",System.currentTimeMillis()+response.optLong("expires_in",3600)*1000);Secrets(c).save(mail.toString(),"mail");Secrets(c).save("{}","oauth-pending");ui.edit().clear().putString("status","connected").apply();MailWorker.configure(c);MailWorker.sync(c);return Result.success()}
   if(response.optString("error") in listOf("authorization_pending","slow_down")){if(response.optString("error")=="slow_down")config.put("interval",config.optInt("interval",5)+5);config.put("nextPoll",System.currentTimeMillis()+config.optInt("interval",5)*1000);Secrets(c).save(config.toString(),"oauth-pending");return Result.retry()}
   ui.edit().clear().putString("status",if(response.optString("error")=="expired_token")"expired" else "failed").apply();return Result.failure()
  }catch(_:Exception){ui.edit().putString("status","connection").apply();return if(runAttemptCount<20)Result.retry() else Result.failure()}
 }
}
