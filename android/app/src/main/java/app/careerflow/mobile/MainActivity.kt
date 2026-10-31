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
 override fun onCreate(savedInstanceState:Bundle?){super.onCreate(savedInstanceState);web=WebView(this);setContentView(web);MailWorker.configure(this);Reminders.periodic(this);Reminders.refresh(this);Reminders.recoverAnalysis(this)
  val assets=WebViewAssetLoader.Builder().addPathHandler("/assets/",WebViewAssetLoader.AssetsPathHandler(this)).build()
  web.settings.javaScriptEnabled=true;web.settings.domStorageEnabled=true;web.settings.allowFileAccess=false;web.settings.allowContentAccess=false
  web.webViewClient=object:WebViewClient(){override fun shouldInterceptRequest(view:WebView,request:WebResourceRequest):WebResourceResponse?=assets.shouldInterceptRequest(request.url);override fun shouldOverrideUrlLoading(view:WebView,request:WebResourceRequest)=true}
  web.addJavascriptInterface(Bridge(),"CareerFlow");web.loadUrl("https://appassets.androidplatform.net/assets/index.html")
 }
 inner class Bridge {
  @JavascriptInterface fun state():String {val store=LocalStore(this@MainActivity);return try{JSONObject().put("items",store.items()).put("schedules",store.schedules()).put("history",store.history()).put("exact",Reminders.exact(this@MainActivity)).put("notifications",androidx.core.app.NotificationManagerCompat.from(this@MainActivity).areNotificationsEnabled()).put("mailConfigured",Secrets(this@MainActivity).read("mail")!=null).put("mailStatus",getSharedPreferences("mail-status",0).getString("status","idle")).put("lastSync",getSharedPreferences("mail-status",0).getLong("last",0)).put("configured",!Secrets(this@MainActivity).read().isNullOrBlank()).put("auto",getSharedPreferences("preferences",0).getBoolean("auto",false)).toString()}finally{store.close()}}
  @JavascriptInterface fun saveKey(value:String){if(value.length in 10..300){Secrets(this@MainActivity).save(value);val store=LocalStore(this@MainActivity);try{store.pendingIds().forEach{AnalysisWorker.enqueue(this@MainActivity,it)}}finally{store.close()}}}
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
  @JavascriptInterface fun syncMail(){MailWorker.sync(this@MainActivity)}
  @JavascriptInterface fun theme(mode:String){runOnUiThread{val dark=mode=="dark"||(mode=="system"&&resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK==android.content.res.Configuration.UI_MODE_NIGHT_YES);window.statusBarColor=android.graphics.Color.parseColor(if(dark)"#0D1420" else "#F3F5FA");window.navigationBarColor=android.graphics.Color.parseColor(if(dark)"#182231" else "#FFFFFF");window.decorView.systemUiVisibility=if(dark)0 else android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR}}
  @JavascriptInterface fun testReminder(){Reminders.test(this@MainActivity)}
  @JavascriptInterface fun notificationPermission(){runOnUiThread{if(android.os.Build.VERSION.SDK_INT>=33)requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS),11)}}
  @JavascriptInterface fun alarmPermission(){runOnUiThread{if(android.os.Build.VERSION.SDK_INT>=31&&!Reminders.exact(this@MainActivity))startActivity(android.content.Intent(android.provider.Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,android.net.Uri.parse("package:"+packageName)))}}
  @JavascriptInterface fun complete(id:Long,value:Boolean){val store=LocalStore(this@MainActivity);try{store.complete(id,value)}finally{store.close()};Reminders.refresh(this@MainActivity)}
  @JavascriptInterface fun resolve(id:Long,ordinal:Int,target:Long,patch:String):Boolean{val store=LocalStore(this@MainActivity);return try{store.resolve(id,ordinal,if(target>0)target else null,JSONObject(patch));Reminders.refresh(this@MainActivity);true}catch(_:Exception){false}finally{store.close()}}
  @JavascriptInterface fun analyze(id:Long){AnalysisWorker.enqueue(this@MainActivity,id)}
  @JavascriptInterface fun done(id:Long,value:Boolean){val store=LocalStore(this@MainActivity);try{store.done(id,value)}finally{store.close()}}
 }
 override fun onResume(){super.onResume();Reminders.refresh(this)}
 override fun onDestroy(){web.removeJavascriptInterface("CareerFlow");web.destroy();super.onDestroy()}
}
