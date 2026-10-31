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
 override fun onCreate(savedInstanceState:Bundle?){super.onCreate(savedInstanceState);web=WebView(this);setContentView(web)
  val assets=WebViewAssetLoader.Builder().addPathHandler("/assets/",WebViewAssetLoader.AssetsPathHandler(this)).build()
  web.settings.javaScriptEnabled=true;web.settings.domStorageEnabled=true;web.settings.allowFileAccess=false;web.settings.allowContentAccess=false
  web.webViewClient=object:WebViewClient(){override fun shouldInterceptRequest(view:WebView,request:WebResourceRequest):WebResourceResponse?=assets.shouldInterceptRequest(request.url);override fun shouldOverrideUrlLoading(view:WebView,request:WebResourceRequest)=true}
  web.addJavascriptInterface(Bridge(),"CareerFlow");web.loadUrl("https://appassets.androidplatform.net/assets/index.html")
 }
 inner class Bridge {
  @JavascriptInterface fun state():String {val store=LocalStore(this@MainActivity);return try{JSONObject().put("items",store.items()).put("configured",!Secrets(this@MainActivity).read().isNullOrBlank()).put("auto",getSharedPreferences("preferences",0).getBoolean("auto",false)).toString()}finally{store.close()}}
  @JavascriptInterface fun saveKey(value:String){if(value.length in 10..300)Secrets(this@MainActivity).save(value)}
  @JavascriptInterface fun automatic(value:Boolean){getSharedPreferences("preferences",0).edit().putBoolean("auto",value).apply();if(value)runOnUiThread{requestPermissions(arrayOf(Manifest.permission.READ_SMS,Manifest.permission.RECEIVE_SMS),10)}}
  @JavascriptInterface fun importRecent():String {
   if(checkSelfPermission(Manifest.permission.READ_SMS)!=PackageManager.PERMISSION_GRANTED){runOnUiThread{requestPermissions(arrayOf(Manifest.permission.READ_SMS,Manifest.permission.RECEIVE_SMS),10)};return "permission"}
   val store=LocalStore(this@MainActivity);var count=0
   try{contentResolver.query(Telephony.Sms.Inbox.CONTENT_URI,arrayOf("address","body","date"),null,null,"date DESC")?.use{c->var scanned=0;while(c.moveToNext()&&scanned++<200){val id=store.save(c.getString(0)?:"",c.getString(1)?:"",c.getLong(2));if(id>=0){count++;AnalysisWorker.enqueue(this@MainActivity,id)}}}}catch(_:SecurityException){return "permission"}finally{store.close()};return count.toString()
  }
  @JavascriptInterface fun analyze(id:Long){AnalysisWorker.enqueue(this@MainActivity,id)}
  @JavascriptInterface fun done(id:Long,value:Boolean){val store=LocalStore(this@MainActivity);try{store.done(id,value)}finally{store.close()}}
 }
 override fun onDestroy(){web.removeJavascriptInterface("CareerFlow");web.destroy();super.onDestroy()}
}
