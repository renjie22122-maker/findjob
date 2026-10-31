package app.careerflow.mobile
import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.os.Bundle
import android.provider.Telephony
import android.webkit.*
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject

class MainActivity:Activity(){
 private lateinit var web:WebView
 private var printWeb:WebView?=null
 private val maintenance=java.util.concurrent.Executors.newSingleThreadExecutor()
 override fun onCreate(savedInstanceState:Bundle?){super.onCreate(savedInstanceState);web=WebView(this);setContentView(web);maintenance.execute{try{WorkspaceWorker.retireLegacyBacklog(this);MailWorker.configure(this);WorkspaceWorker.configure(this);Reminders.periodic(this);Reminders.refresh(this);Reminders.recoverAnalysis(this)}catch(_:Exception){}}
  val assets=WebViewAssetLoader.Builder().addPathHandler("/assets/",WebViewAssetLoader.AssetsPathHandler(this)).build()
  web.settings.javaScriptEnabled=true;web.settings.domStorageEnabled=true;web.settings.allowFileAccess=false;web.settings.allowContentAccess=false
  web.webViewClient=object:WebViewClient(){override fun shouldInterceptRequest(view:WebView,request:WebResourceRequest):WebResourceResponse?=assets.shouldInterceptRequest(request.url);override fun shouldOverrideUrlLoading(view:WebView,request:WebResourceRequest)=true}
  web.addJavascriptInterface(Bridge(),"CareerFlow");web.loadUrl("https://appassets.androidplatform.net/assets/index.html")
 }
 inner class Bridge {
  @JavascriptInterface fun state():String {val store=LocalStore(this@MainActivity);return try{JSONObject().put("items",store.items()).put("schedules",store.schedules()).put("history",store.history()).put("exact",Reminders.exact(this@MainActivity)).put("notifications",androidx.core.app.NotificationManagerCompat.from(this@MainActivity).areNotificationsEnabled()).put("mailConfigured",Secrets(this@MainActivity).read("mail")!=null).put("mailStatus",getSharedPreferences("mail-status",0).getString("status","idle")).put("lastSync",getSharedPreferences("mail-status",0).getLong("last",0)).put("configured",LlmApi.config(this@MainActivity).key.isNotBlank()).put("auto",getSharedPreferences("preferences",0).getBoolean("auto",false)).toString()}finally{store.close()}}
  @JavascriptInterface fun saveKey(value:String){if(value.length in 10..300){LlmApi.save(this@MainActivity,JSONObject().put("key",value));val store=LocalStore(this@MainActivity);try{store.pendingIds().forEach{AnalysisWorker.enqueue(this@MainActivity,it)}}finally{store.close()}}}
  @JavascriptInterface fun automatic(value:Boolean){getSharedPreferences("preferences",0).edit().putBoolean("auto",value).apply();if(value)runOnUiThread{requestPermissions(arrayOf(Manifest.permission.READ_SMS,Manifest.permission.RECEIVE_SMS),10)}}
  @JavascriptInterface fun importRecent():String {
   if(checkSelfPermission(Manifest.permission.READ_SMS)!=PackageManager.PERMISSION_GRANTED){runOnUiThread{requestPermissions(arrayOf(Manifest.permission.READ_SMS,Manifest.permission.RECEIVE_SMS),10)};return "permission"}
   val store=LocalStore(this@MainActivity);var count=0
   try{contentResolver.query(Telephony.Sms.Inbox.CONTENT_URI,arrayOf("address","body","date"),null,null,"date DESC")?.use{c->var scanned=0;while(c.moveToNext()&&scanned++<200){val id=store.save(c.getString(0)?:"",c.getString(1)?:"",c.getLong(2));if(id>=0){count++;AnalysisWorker.enqueue(this@MainActivity,id)}}}}catch(_:SecurityException){return "permission"}finally{store.close()};return count.toString()
  }
  @JavascriptInterface fun startOutlook(client:String,tenant:String,user:String)=OutlookAuth.start(this@MainActivity,client,tenant,user)
  @JavascriptInterface fun oauthState()=OutlookAuth.view(this@MainActivity).toString()
  @JavascriptInterface fun copyOutlookCode():Boolean {
   val state=OutlookAuth.view(this@MainActivity);if(!state.optBoolean("oauthCanOpen"))return false
   runOnUiThread{val clip=android.content.ClipData.newPlainText("Microsoft authorization",state.getString("oauthCode"));if(android.os.Build.VERSION.SDK_INT>=33)clip.description.extras=android.os.PersistableBundle().apply{putBoolean("android.content.extra.IS_SENSITIVE",true)};getSystemService(android.content.ClipboardManager::class.java).setPrimaryClip(clip)};return true
  }
  @JavascriptInterface fun openMicrosoft():Boolean {
   val state=OutlookAuth.view(this@MainActivity);if(!state.optBoolean("oauthCanOpen"))return false
   runOnUiThread{startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW,android.net.Uri.parse(state.getString("oauthVerificationUri"))))};return true
  }
  @JavascriptInterface fun cancelOutlook(){androidx.work.WorkManager.getInstance(this@MainActivity).cancelUniqueWork("outlook-authorization");getSharedPreferences("oauth-status",0).edit().clear().putString("status","idle").apply();Secrets(this@MainActivity).save("{}","oauth-pending")}
  @JavascriptInterface fun saveMail(host:String,user:String,password:String,enabled:Boolean):Boolean {
   if(!host.matches(Regex("[a-zA-Z0-9.-]+"))||user.isBlank()||password.isBlank())return false
   Secrets(this@MainActivity).save(JSONObject().put("host",host).put("user",user).put("password",password).put("enabled",enabled).toString(),"mail");MailWorker.configure(this@MainActivity);MailWorker.sync(this@MainActivity);return true
  }
  @JavascriptInterface fun disableMail(){val old=Secrets(this@MainActivity).read("mail")?:return;Secrets(this@MainActivity).save(JSONObject(old).put("enabled",false).toString(),"mail")}
  @JavascriptInterface fun syncMail(){val c=this@MainActivity;val config=Secrets(c).read("mail")?:return;Secrets(c).save(JSONObject(config).put("enabled",true).toString(),"mail");MailWorker.configure(c);MailWorker.sync(c)}
  @JavascriptInterface fun llmSettings()=LlmApi.publicState(this@MainActivity).toString()
  @JavascriptInterface fun saveLlm(raw:String):Boolean=try{val ok=LlmApi.save(this@MainActivity,JSONObject(raw));if(ok){maintenance.execute{try{Reminders.recoverAnalysis(this@MainActivity)}catch(_:Exception){}}};ok}catch(_:Exception){false}
  @JavascriptInterface fun probeLlm(models:Boolean){LlmProbeWorker.enqueue(this@MainActivity,models)}
  @JavascriptInterface fun workspace():String {val store=WorkspaceStore(this@MainActivity);return try{JSONObject().put("records",store.list()).put("aiStatus",getSharedPreferences("workspace-ai",0).getString("status","idle")).toString()}finally{store.close()}}
  @JavascriptInterface fun saveWorkspace(kind:String,id:String,raw:String):Boolean{val store=WorkspaceStore(this@MainActivity);return try{val key=store.save(kind,JSONObject(raw),id);WorkspaceWorker.enqueue(this@MainActivity,key);true}catch(_:Exception){false}finally{store.close()}}
  @JavascriptInterface fun workspaceHistory(id:String):String{val s=WorkspaceStore(this@MainActivity);return try{s.history(id).toString()}finally{s.close()}}
  @JavascriptInterface fun restoreWorkspace(id:String,version:Long){val s=WorkspaceStore(this@MainActivity);try{s.restore(id,version)}finally{s.close()};WorkspaceWorker.enqueue(this@MainActivity,"all")}
  @JavascriptInterface fun workspaceAnalyze(id:String){WorkspaceWorker.enqueue(this@MainActivity,id)}
  @JavascriptInterface fun importJob(text:String):Boolean{if(text.length !in 10..24000)return false;val id="draft-"+java.util.UUID.randomUUID();Secrets(this@MainActivity).save(SmsPolicy.redact(text),id);getSharedPreferences("workspace-drafts",0).edit().putBoolean(id,true).apply();WorkspaceWorker.enqueue(this@MainActivity,id);return true}
  @JavascriptInterface fun convertJob(id:String):Boolean{val s=WorkspaceStore(this@MainActivity);return try{val job=s.data(id)?:return false;val app=s.ensureApplication(job.getString("companyName"),job.getString("positionTitle"),"wishlist");if(app.isBlank())return false;val a=s.data(app)!!;a.put("jdDescription",job.optString("jdDescription")).put("resumeKey",job.optString("resumeKey"));s.save("application",a,app);s.save("job",job.put("status","imported"),id);true}catch(_:Exception){false}finally{s.close()}}
  @JavascriptInterface fun printResume(id:String){val store=WorkspaceStore(this@MainActivity);val resume=try{store.data(id)}finally{store.close()}?:return;val text=buildString{append(resume.optString("content"));if(isBlank()){append(resume.optString("targetRole"));append("\n");append(resume.optJSONArray("skills")?.join(" · ")?:"");for(field in listOf("education","experience","projects")){append("\n\n");append(resume.optJSONArray(field)?.toString(2)?:"")}}};runOnUiThread{printWeb?.destroy();val view=WebView(this@MainActivity);printWeb=view;view.webViewClient=object:WebViewClient(){override fun onPageFinished(v:WebView,url:String){val manager=getSystemService(android.content.Context.PRINT_SERVICE) as android.print.PrintManager;manager.print("CareerFlow Resume",v.createPrintDocumentAdapter("Resume"),android.print.PrintAttributes.Builder().build())}};view.loadDataWithBaseURL(null,"<html><meta charset='UTF-8'><style>body{font-family:sans-serif;padding:24px}h1{font-size:24px}pre{white-space:pre-wrap;font:14px/1.7 sans-serif}</style><h1>"+android.text.TextUtils.htmlEncode(resume.optString("name"))+"</h1><pre>"+android.text.TextUtils.htmlEncode(text)+"</pre></html>","text/html","UTF-8",null)}}
  @JavascriptInterface fun importResume(){runOnUiThread{startActivityForResult(android.content.Intent(android.content.Intent.ACTION_OPEN_DOCUMENT).apply{type="*/*";addCategory(android.content.Intent.CATEGORY_OPENABLE);putExtra(android.content.Intent.EXTRA_MIME_TYPES,arrayOf("text/plain","application/pdf","application/vnd.openxmlformats-officedocument.wordprocessingml.document"))},40)}}
  @JavascriptInterface fun health():String {val c=this@MainActivity;val prefs=c.getSharedPreferences("background",0);val mail=Secrets(c).read("mail")?.let{JSONObject(it)};return JSONObject().put("batteryExempt",getSystemService(android.os.PowerManager::class.java).isIgnoringBatteryOptimizations(packageName)).put("restricted",android.os.Build.VERSION.SDK_INT>=28&&getSystemService(android.app.ActivityManager::class.java).isBackgroundRestricted).put("mailEnabled",mail?.optBoolean("enabled")==true).put("mailUser",mail?.optString("user","")?:"").put("smsAllowed",checkSelfPermission(Manifest.permission.RECEIVE_SMS)==PackageManager.PERMISSION_GRANTED).put("lastReminderCheck",prefs.getLong("lastReminderCheck",0)).put("nextAlarm",prefs.getLong("nextAlarm",0)).toString()}
  @JavascriptInterface fun backgroundSettings(){runOnUiThread{startActivity(android.content.Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,android.net.Uri.parse("package:"+packageName)))}}
  @JavascriptInterface fun saveEvent(raw:String):Boolean{val store=LocalStore(this@MainActivity);return try{store.manual(JSONObject(raw));Reminders.refresh(this@MainActivity);true}catch(_:Exception){false}finally{store.close()}}
  @JavascriptInterface fun assistantState():String {val p=getSharedPreferences("assistant",0);return JSONObject().put("status",p.getString("status","idle")).put("messages",org.json.JSONArray(p.getString("messages","[]"))).toString()}
  @JavascriptInterface fun ask(question:String):Boolean {if(question.isBlank()||question.length>3000)return false;AssistantWorker.send(this@MainActivity,question);return true}
  @JavascriptInterface fun recheck(){val c=applicationContext;maintenance.execute{val store=LocalStore(c);try{store.recheck();store.reviewIds().forEach{AnalysisWorker.enqueue(c,it)}}finally{store.close()};Reminders.recoverAnalysis(c);Reminders.refresh(c)}}
  @JavascriptInterface fun theme(mode:String){runOnUiThread{val dark=mode=="dark"||(mode=="system"&&resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK==android.content.res.Configuration.UI_MODE_NIGHT_YES);window.statusBarColor=android.graphics.Color.parseColor(if(dark)"#0D1420" else "#F3F5FA");window.navigationBarColor=android.graphics.Color.parseColor(if(dark)"#182231" else "#FFFFFF");window.decorView.systemUiVisibility=if(dark)0 else android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR}}
  @JavascriptInterface fun testReminder(){Reminders.test(this@MainActivity)}
  @JavascriptInterface fun notificationPermission(){runOnUiThread{if(android.os.Build.VERSION.SDK_INT>=33)requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS),11)}}
  @JavascriptInterface fun alarmPermission(){runOnUiThread{if(android.os.Build.VERSION.SDK_INT>=31&&!Reminders.exact(this@MainActivity))startActivity(android.content.Intent(android.provider.Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,android.net.Uri.parse("package:"+packageName)))}}
  @JavascriptInterface fun complete(id:Long,value:Boolean){val store=LocalStore(this@MainActivity);try{store.complete(id,value)}finally{store.close()};Reminders.refresh(this@MainActivity)}
  @JavascriptInterface fun resolve(id:Long,ordinal:Int,target:Long,patch:String):Boolean{val store=LocalStore(this@MainActivity);return try{store.resolve(id,ordinal,if(target>0)target else null,JSONObject(patch));Reminders.refresh(this@MainActivity);true}catch(_:Exception){false}finally{store.close()}}
  @JavascriptInterface fun analyze(id:Long){AnalysisWorker.enqueue(this@MainActivity,id)}
  @JavascriptInterface fun done(id:Long,value:Boolean){val store=LocalStore(this@MainActivity);try{store.done(id,value)}finally{store.close()}}
 }

 override fun onActivityResult(requestCode:Int,resultCode:Int,data:android.content.Intent?){super.onActivityResult(requestCode,resultCode,data);if(requestCode!=40||resultCode!=RESULT_OK)return;val uri=data?.data?:return;Thread{try{val bytes=contentResolver.openInputStream(uri)?.use{val out=java.io.ByteArrayOutputStream();val buffer=ByteArray(8192);while(true){val n=it.read(buffer);if(n<0)break;require(out.size()+n<=2*1024*1024);out.write(buffer,0,n)};out.toByteArray()}?:return@Thread;require(bytes.size<=2*1024*1024);val mime=contentResolver.getType(uri)?:"text/plain";val part=javax.mail.internet.MimeBodyPart();part.dataHandler=javax.activation.DataHandler(javax.mail.util.ByteArrayDataSource(bytes,mime));part.fileName=if(mime.contains("pdf"))"resume.pdf" else if(mime.contains("wordprocessing"))"resume.docx" else "resume.txt";com.tom_roush.pdfbox.android.PDFBoxResourceLoader.init(this);val text=MailText.extract(part);require(text.isNotBlank()&&!text.trim().startsWith("[PDF未解析")&&!text.trim().startsWith("[文档未解析")&&!text.trim().startsWith("[附件"));val store=WorkspaceStore(this);val id=try{store.save("resume",JSONObject().put("name","导入简历 / Imported resume").put("content",text).put("targetRole","").put("education",org.json.JSONArray()).put("experience",org.json.JSONArray()).put("projects",org.json.JSONArray()).put("skills",org.json.JSONArray()))}finally{store.close()};WorkspaceWorker.enqueue(this,id);getSharedPreferences("workspace-ai",0).edit().putString("status","queued").apply()}catch(_:Exception){getSharedPreferences("workspace-ai",0).edit().putString("status","import_failed").apply()}}.start()}
 override fun onResume(){super.onResume();web.onResume();maintenance.execute{try{Reminders.refresh(applicationContext)}catch(_:Exception){}}}
 override fun onPause(){web.onPause();super.onPause()}
 override fun onDestroy(){maintenance.shutdown();web.removeJavascriptInterface("CareerFlow");web.destroy();printWeb?.destroy();super.onDestroy()}
}
