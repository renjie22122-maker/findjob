package app.careerflow.mobile
import android.content.Context
import android.text.Html
import androidx.work.*
import com.sun.mail.imap.IMAPFolder
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import javax.mail.*
import java.util.Properties
import java.util.concurrent.TimeUnit
import java.util.zip.ZipInputStream
import org.json.JSONObject

class MailWorker(c:Context,p:WorkerParameters):Worker(c,p){
 override fun doWork():Result {
  val preferences=applicationContext.getSharedPreferences("mail-status",0);var store:Store?=null;var folder:IMAPFolder?=null
  try{
   val config=JSONObject(Secrets(applicationContext).read("mail")?:return Result.success())
   if(!config.optBoolean("enabled"))return Result.success()
   val host=config.getString("host").trim();require(host.matches(Regex("[a-zA-Z0-9.-]+")))
   val props=Properties().apply{put("mail.imaps.ssl.checkserveridentity","true");put("mail.imaps.connectiontimeout","15000");put("mail.imaps.timeout","30000");put("mail.imaps.peek","true");put("mail.imaps.partialfetch","true");put("mail.imaps.fetchsize","16384")}
   val password=if(config.optString("authMode")=="oauth2"){props.put("mail.imaps.auth.mechanisms","XOAUTH2");props.put("mail.imaps.auth.login.disable","true");props.put("mail.imaps.auth.plain.disable","true");OutlookAuth.token(applicationContext,config)}else config.getString("password")
   store=Session.getInstance(props).getStore("imaps");store.connect(host,993,config.getString("user"),password);folder=store.getFolder("INBOX") as IMAPFolder;folder.open(Folder.READ_ONLY)
   val account=host+"/"+config.getString("user");val validity=folder.uidValidity;val same=preferences.getString("account",null)==account&&preferences.getLong("validity",-1)==validity
   var uid=if(same)preferences.getLong("uid",0) else 0
   val count=folder.messageCount
   val messages=if(uid>0)folder.getMessagesByUID(uid+1,UIDFolder.MAXUID).take(100) else if(count>0)folder.getMessages(maxOf(1,count-199),count).toList() else emptyList()
   PDFBoxResourceLoader.init(applicationContext)
   val db=LocalStore(applicationContext)
   try{for(m in messages){val current=folder.getUID(m);if(current<=uid)continue
    if(m.size<=2*1024*1024){val body=(m.subject.orEmpty()+"\n"+MailText.extract(m)).take(24000);val id=db.save(m.from?.firstOrNull()?.toString().orEmpty(),body,m.receivedDate?.time?:System.currentTimeMillis(),"email","$account/$validity/$current");AnalysisWorker.enqueue(applicationContext,id)}
    uid=current
    // Advance only after durable insertion (non-recruitment messages intentionally skipped).
    preferences.edit().putString("account",account).putLong("validity",validity).putLong("uid",uid).apply()
   }}finally{db.close()}
   preferences.edit().putString("status","ok").putLong("last",System.currentTimeMillis()).apply();return Result.success()
  }catch(_:AuthenticationFailedException){preferences.edit().putString("status","authentication").apply();return Result.failure()}
   catch(_:Exception){preferences.edit().putString("status","connection").apply();return if(runAttemptCount<3)Result.retry() else Result.failure()}
  finally{try{folder?.close(false)}catch(_:Exception){};try{store?.close()}catch(_:Exception){}}
 }
 companion object{
  fun configure(c:Context){val work=WorkManager.getInstance(c);work.enqueueUniquePeriodicWork("mail-sync-periodic",ExistingPeriodicWorkPolicy.KEEP,PeriodicWorkRequestBuilder<MailWorker>(30,TimeUnit.MINUTES).setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build())}
  fun sync(c:Context){WorkManager.getInstance(c).enqueueUniqueWork("mail-sync-now",ExistingWorkPolicy.KEEP,OneTimeWorkRequestBuilder<MailWorker>().setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build())}
 }
}
