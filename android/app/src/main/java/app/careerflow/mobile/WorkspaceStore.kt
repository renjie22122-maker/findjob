package app.careerflow.mobile
import android.content.Context
import android.content.ContentValues
import android.database.sqlite.SQLiteOpenHelper
import android.database.sqlite.SQLiteDatabase
import org.json.JSONObject
import org.json.JSONArray
import java.util.UUID

/** Offline applications, resume versions and sourced jobs. No network or credentials here. */
class WorkspaceStore(private val context:Context,name:String="workspace.db",private val scheduleDatabase:String="careerflow.db"):SQLiteOpenHelper(context,name,null,1){
 override fun onCreate(db:SQLiteDatabase){
  db.execSQL("CREATE TABLE records(id TEXT PRIMARY KEY,kind TEXT NOT NULL,data TEXT NOT NULL,updated INTEGER,locked INTEGER DEFAULT 0)")
  db.execSQL("CREATE TABLE versions(id INTEGER PRIMARY KEY,record TEXT,data TEXT,at INTEGER,reason TEXT)")
 }
 override fun onUpgrade(db:SQLiteDatabase,old:Int,new:Int){}
 fun list(kind:String?=null):JSONArray {val result=JSONArray();readableDatabase.rawQuery("SELECT id,kind,data,updated FROM records"+(if(kind!=null)" WHERE kind=?" else "")+" ORDER BY updated DESC",if(kind!=null)arrayOf(kind)else null).use{c->while(c.moveToNext())result.put(JSONObject().put("id",c.getString(0)).put("kind",c.getString(1)).put("data",JSONObject(c.getString(2))).put("updated",c.getLong(3)))};if(kind==null){
   val stages=mutableMapOf<String,MutableSet<String>>()
   readableDatabase.rawQuery("SELECT v.record,v.data FROM versions v JOIN records r ON r.id=v.record WHERE r.kind='application'",null).use{c->while(c.moveToNext()){val status=JSONObject(c.getString(1)).optString("status");stages.getOrPut(c.getString(0)){mutableSetOf()}.add(status)}}
   for(i in 0 until result.length()){val row=result.getJSONObject(i);if(row.optString("kind")=="application")row.put("stageHistory",JSONArray(stages[row.getString("id")]?.toList()?:emptyList<String>()))}
  };return result}
 fun data(id:String):JSONObject?=readableDatabase.rawQuery("SELECT data FROM records WHERE id=?",arrayOf(id)).use{if(it.moveToFirst())JSONObject(it.getString(0))else null}
 fun history(id:String):JSONArray {val a=JSONArray();readableDatabase.rawQuery("SELECT id,at,reason,data FROM versions WHERE record=? ORDER BY id DESC LIMIT 30",arrayOf(id)).use{while(it.moveToNext())a.put(JSONObject().put("id",it.getLong(0)).put("at",it.getLong(1)).put("reason",it.getString(2)).put("data",JSONObject(it.getString(3))))};return a}
 @Synchronized fun save(kind:String,input:JSONObject,id:String="",reason:String="用户编辑 / Edited"):String {
  require(kind in listOf("application","resume","job"));require(input.toString().length<=100000)
  if(kind=="application"||kind=="job")require(input.optString("companyName").isNotBlank()&&input.optString("positionTitle").isNotBlank())
  if(kind=="application")require(input.optString("status") in STATUS)
  if(kind=="resume")require(input.optString("name").isNotBlank())
  val key=id.ifBlank{"$kind:${UUID.randomUUID()}"};val old=data(key)
  if(old!=null&&same(old,input))return key
  val db=writableDatabase;db.beginTransaction();try{
   if(old!=null)db.insert("versions",null,ContentValues().apply{put("record",key);put("data",old.toString());put("at",System.currentTimeMillis());put("reason",reason)})
   val values=ContentValues().apply{put("data",input.toString());put("updated",System.currentTimeMillis());if(kind=="application"&&reason=="用户编辑 / Edited"&&((old!=null&&old.optString("status")!=input.optString("status"))||input.optString("status") in listOf("SIGNED","WITHDRAWN","REJECTED")))put("locked",1)}
   if(old!=null)db.update("records",values,"id=?",arrayOf(key))else{values.put("id",key);values.put("kind",kind);db.insertOrThrow("records",null,values)}
   db.setTransactionSuccessful()
  }finally{db.endTransaction()};return key
 }
 fun restore(id:String,versionId:Long){val old=readableDatabase.rawQuery("SELECT data FROM versions WHERE record=? AND id=?",arrayOf(id,versionId.toString())).use{require(it.moveToFirst());JSONObject(it.getString(0))};val kind=readableDatabase.rawQuery("SELECT kind FROM records WHERE id=?",arrayOf(id)).use{require(it.moveToFirst());it.getString(0)};save(kind,old,id,"用户编辑 / Edited")}
 fun trackSchedules(){val local=LocalStore(context,scheduleDatabase);try{val schedules=local.schedules(false);for(i in 0 until schedules.length()){val s=schedules.getJSONObject(i);if(s.optBoolean("cancelled"))continue;ensureApplication(s.optString("company"),s.optString("role").ifBlank{"岗位待补充 / Role pending"},s.optString("stage"),s.optString("applicationStatus"))}}finally{local.close()}}
 fun applicationNotice(e:Event,body:String,received:Long):Boolean {
  if(e.company.isBlank()||e.evidence.isBlank()||!body.contains(e.evidence)||e.role.isBlank())return false
  if(e.stage=="reject"&&Regex("如果|若|if your|if you",RegexOption.IGNORE_CASE).containsMatchIn(e.evidence))return false
  val existing=list("application");val found=(0 until existing.length()).map{existing.getJSONObject(it)}.filter{it.getJSONObject("data").optString("companyName")==e.company&&it.getJSONObject("data").optString("positionTitle")==e.role}
  if(found.size>1)return false
  val prior=found.firstOrNull();val isOld=prior!=null&&prior.getJSONObject("data").optLong("lastNoticeAt")>received
  val id=prior?.getString("id")?:ensureApplication(e.company,e.role,e.stage,e.applicationStatus);if(id.isBlank())return false
  if(!isOld)ensureApplication(e.company,e.role,e.stage,e.applicationStatus)
  val d=data(id)?:return false
  if(e.stage=="applied"&&d.optString("appliedAt").isBlank())d.put("appliedAt",java.time.Instant.ofEpochMilli(received).atZone(java.time.ZoneId.of("Asia/Shanghai")).toLocalDateTime().toString())
  if(!isOld)d.put("lastNoticeAt",received)
  save("application",d,id,"通知更新 / Notice · "+e.evidence.take(180));return true
 }
 fun ensureApplication(company:String,role:String,stage:String,statusOverride:String=""):String {
  val all=list("application");val matching=(0 until all.length()).map{all.getJSONObject(it)}.filter{it.getJSONObject("data").optString("companyName")==company&&it.getJSONObject("data").optString("positionTitle")==role}
  val status=if(statusOverride in STATUS)statusOverride else when(stage){"written_test","assessment"->"WRITTEN_TEST";"interview"->"INTERVIEW_1";"offer"->"OFFER";"reject"->"REJECTED";"wishlist"->"WISHLIST";else->"APPLIED"}
  if(matching.size==1){val item=matching[0];val d=item.getJSONObject("data");val current=d.optString("status");val locked=readableDatabase.rawQuery("SELECT locked FROM records WHERE id=?",arrayOf(item.getString("id"))).use{it.moveToFirst()&&it.getInt(0)==1}
   if(current !in listOf("REJECTED","WITHDRAWN","SIGNED")&&STATUS.indexOf(status)>STATUS.indexOf(current)&&!locked){d.put("status",status);save("application",d,item.getString("id"),"自动推进 / Auto progress")};return item.getString("id")}
  if(matching.size>1)return ""
  return save("application",JSONObject().put("companyName",company).put("positionTitle",role).put("status",status).put("priority","MEDIUM").put("jobType","school"),reason="通知自动建立申请 / From notification")
 }
 companion object {
  val STATUS=listOf("WISHLIST","APPLIED","SCREENING","WRITTEN_TEST","INTERVIEW_1","INTERVIEW_2","INTERVIEW_3","HR_INTERVIEW","OFFER","SIGNED","REJECTED","WITHDRAWN")
  fun same(a:Any?,b:Any?):Boolean {if(a is JSONObject&&b is JSONObject){val keys=a.keys().asSequence().toSet();return keys==b.keys().asSequence().toSet()&&keys.all{same(a.opt(it),b.opt(it))}};if(a is JSONArray&&b is JSONArray)return a.length()==b.length()&&(0 until a.length()).all{same(a.opt(it),b.opt(it))};return a==b}
 }
}
