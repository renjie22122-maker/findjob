package app.careerflow.mobile
import android.content.Context
import android.database.sqlite.SQLiteOpenHelper
import android.database.sqlite.SQLiteDatabase
import android.content.ContentValues
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest

class LocalStore(context:Context,databaseName:String="careerflow.db"):SQLiteOpenHelper(context,databaseName,null,2){
 override fun onCreate(db:SQLiteDatabase){db.execSQL("CREATE TABLE notices(id INTEGER PRIMARY KEY, fingerprint TEXT UNIQUE, body TEXT, received INTEGER, analysis TEXT, state TEXT DEFAULT 'pending', done INTEGER DEFAULT 0)");upgrade(db)}
 private fun upgrade(db:SQLiteDatabase){
  db.execSQL("ALTER TABLE notices ADD COLUMN source TEXT DEFAULT 'sms'")
  db.execSQL("CREATE TABLE schedules(id INTEGER PRIMARY KEY, data TEXT NOT NULL, done INTEGER DEFAULT 0, cancelled INTEGER DEFAULT 0, revision INTEGER DEFAULT 1)")
  db.execSQL("CREATE TABLE evidence(notice INTEGER, ordinal INTEGER, schedule INTEGER, PRIMARY KEY(notice,ordinal))")
  db.execSQL("CREATE TABLE repairs(id INTEGER PRIMARY KEY, at INTEGER, detail TEXT)")
  db.execSQL("CREATE TABLE deliveries(token TEXT PRIMARY KEY)")
 }
 override fun onUpgrade(db:SQLiteDatabase,old:Int,new:Int){if(old<2)upgrade(db)}
 fun save(sender:String,body:String,date:Long,source:String="sms",identity:String=""):Long {
  if(!SmsPolicy.relevant(body))return -1
  val safe=SmsPolicy.redact(body)
  val key=MessageDigest.getInstance("SHA-256").digest((source+"\n"+identity.ifBlank{sender+"\n"+safe.replace(Regex("\\s+")," ")+"/"+(date/86400000)}).toByteArray()).joinToString(""){"%02x".format(it)}
  return writableDatabase.insertWithOnConflict("notices",null,ContentValues().apply{put("fingerprint",key);put("body",safe);put("received",date);put("source",source)},SQLiteDatabase.CONFLICT_IGNORE)
 }
 fun items():JSONArray {val r=JSONArray();readableDatabase.rawQuery("SELECT * FROM notices ORDER BY received DESC LIMIT 200",null).use{c->while(c.moveToNext())r.put(JSONObject().put("id",c.getLong(0)).put("body",c.getString(2)).put("received",c.getLong(3)).put("analysis",c.getString(4)?.let{JSONObject(it)}?:JSONObject.NULL).put("state",c.getString(5)).put("done",c.getInt(6)==1).put("source",c.getString(7)))};return r}
 fun schedules():JSONArray {val r=JSONArray();readableDatabase.rawQuery("SELECT id,data,done,cancelled,revision FROM schedules ORDER BY id DESC",null).use{c->while(c.moveToNext()){val j=JSONObject(c.getString(1)).put("id",c.getLong(0)).put("done",c.getInt(2)==1).put("cancelled",c.getInt(3)==1).put("revision",c.getInt(4));val sources=JSONArray();readableDatabase.rawQuery("SELECT n.source,n.body,n.received FROM evidence e JOIN notices n ON n.id=e.notice WHERE e.schedule=?",arrayOf(c.getLong(0).toString())).use{s->while(s.moveToNext())sources.put(JSONObject().put("source",s.getString(0)).put("body",s.getString(1)).put("received",s.getLong(2)))};r.put(j.put("sources",sources))}};return r}
 fun history():JSONArray{val r=JSONArray();readableDatabase.rawQuery("SELECT at,detail FROM repairs ORDER BY id DESC LIMIT 50",null).use{c->while(c.moveToNext())r.put(JSONObject().put("at",c.getLong(0)).put("detail",c.getString(1)))};return r}
 private fun record(detail:String){writableDatabase.insert("repairs",null,ContentValues().apply{put("at",System.currentTimeMillis());put("detail",detail)})}
 fun pendingIds():List<Long>{val ids=mutableListOf<Long>();readableDatabase.rawQuery("SELECT id FROM notices WHERE analysis IS NULL ORDER BY received DESC LIMIT 200",null).use{while(it.moveToNext())ids.add(it.getLong(0))};return ids}
 fun received(id:Long):Long=readableDatabase.rawQuery("SELECT received FROM notices WHERE id=?",arrayOf(id.toString())).use{if(it.moveToFirst())it.getLong(0) else 0}
 fun body(id:Long):String?=readableDatabase.rawQuery("SELECT body FROM notices WHERE id=?",arrayOf(id.toString())).use{if(it.moveToFirst())it.getString(0) else null}
 fun analyzed(id:Long,result:JSONObject){val db=writableDatabase;db.beginTransaction();try{
  val body=body(id)?:return;val events=result.optJSONArray("events")?:JSONArray();var review=events.length()==0
  for(i in 0 until events.length()){
   if(db.rawQuery("SELECT 1 FROM evidence WHERE notice=? AND ordinal=?",arrayOf(id.toString(),i.toString())).use{it.moveToFirst()})continue
   val e=EventJson.read(events.getJSONObject(i));if(!ScheduleRules.verified(e,body,received(id))){review=true;continue}
   val all=schedules();val candidates=(0 until all.length()).map{all.getJSONObject(it)}.filter{ScheduleRules.match(e,EventJson.read(it))}
   val related=(0 until all.length()).map{all.getJSONObject(it)}.any{ScheduleRules.company(it.optString("company"))==ScheduleRules.company(e.company)&&it.optString("stage")==e.stage}
   if(candidates.size>1||(candidates.isEmpty()&&(related||e.action!="create"))){review=true;continue}
   apply(id,i,e,candidates.firstOrNull()?.getLong("id"));
  }
  db.update("notices",ContentValues().apply{put("analysis",result.toString());put("state",if(review)"review" else "linked")},"id=?",arrayOf(id.toString()));db.setTransactionSuccessful()
 }finally{db.endTransaction()}}
 private fun apply(notice:Long,ordinal:Int,e:Event,target:Long?){val db=writableDatabase;var data=e;var sid=target
  if(sid!=null){val previous=db.rawQuery("SELECT data FROM schedules WHERE id=?",arrayOf(sid.toString())).use{if(!it.moveToFirst())throw IllegalArgumentException("Missing schedule");EventJson.read(JSONObject(it.getString(0)))}
   data=e.copy(round=e.round.ifBlank{previous.round},role=e.role.ifBlank{previous.role},ref=e.ref.ifBlank{previous.ref},start=e.start.ifBlank{previous.start},end=e.end.ifBlank{previous.end},location=e.location.ifBlank{previous.location},kind=if(e.start.isBlank())previous.kind else e.kind)
   // Preserve completion; sources only extend evidence. Revision changes invalidate stale reminders.
   val newest=db.rawQuery("SELECT max(n.received) FROM evidence ev JOIN notices n ON n.id=ev.notice WHERE ev.schedule=?",arrayOf(sid.toString())).use{it.moveToFirst();it.getLong(0)}
   val received=db.rawQuery("SELECT received FROM notices WHERE id=?",arrayOf(notice.toString())).use{it.moveToFirst();it.getLong(0)}
   if(data!=previous&&received>=newest){db.execSQL("UPDATE schedules SET data=?,cancelled=CASE WHEN ?='cancel' THEN 1 WHEN ?='reschedule' THEN 0 ELSE cancelled END,revision=revision+1 WHERE id=?",arrayOf(EventJson.write(data).toString(),e.action,e.action,sid))}
  }else{sid=db.insertOrThrow("schedules",null,ContentValues().apply{put("data",EventJson.write(data).toString());put("done",db.rawQuery("SELECT done FROM notices WHERE id=?",arrayOf(notice.toString())).use{if(it.moveToFirst())it.getInt(0) else 0})})}
  db.insertOrThrow("evidence",null,ContentValues().apply{put("notice",notice);put("ordinal",ordinal);put("schedule",sid)})
  record("#${notice}/${ordinal} → #$sid · ${e.action}")
 }
 fun resolve(id:Long,ordinal:Int,target:Long?,overrides:JSONObject=JSONObject()){val db=writableDatabase;db.beginTransaction();try{val result=db.rawQuery("SELECT analysis FROM notices WHERE id=?",arrayOf(id.toString())).use{if(!it.moveToFirst())throw IllegalArgumentException();JSONObject(it.getString(0))};val original=EventJson.read(result.getJSONArray("events").getJSONObject(ordinal));val e=original.copy(start=overrides.optString("start",original.start),end=overrides.optString("end",original.end),location=overrides.optString("location",original.location));require(e.company.isNotBlank()&&e.stage.isNotBlank());require(e.start.isBlank()||ScheduleRules.time(e.start)!=null);require(target!=null||e.start.isNotBlank());require(e.end.isBlank()||ScheduleRules.time(e.end)!=null);require(e.end.isBlank()||e.start.isBlank()||ScheduleRules.time(e.end)!!>=ScheduleRules.time(e.start)!!);require(e.kind!="window"||e.end.isNotBlank());apply(id,ordinal,e,target);record("User confirmed #$id/$ordinal · ${e.start} → ${e.end} · ${e.location}");db.update("notices",ContentValues().apply{put("state",if(db.rawQuery("SELECT count(*) FROM evidence WHERE notice=?",arrayOf(id.toString())).use{it.moveToFirst();it.getInt(0)}>=result.getJSONArray("events").length())"linked" else "review")},"id=?",arrayOf(id.toString()));db.setTransactionSuccessful()}finally{db.endTransaction()}}
 fun done(id:Long,value:Boolean){writableDatabase.update("notices",ContentValues().apply{put("done",if(value)1 else 0)},"id=?",arrayOf(id.toString()))}
 fun complete(id:Long,value:Boolean){writableDatabase.update("schedules",ContentValues().apply{put("done",if(value)1 else 0)},"id=?",arrayOf(id.toString()));record("#$id completed=$value")}
 fun delivered(token:String)=readableDatabase.rawQuery("SELECT 1 FROM deliveries WHERE token=?",arrayOf(token)).use{it.moveToFirst()}
 fun delivery(token:String){writableDatabase.insertWithOnConflict("deliveries",null,ContentValues().apply{put("token",token)},SQLiteDatabase.CONFLICT_IGNORE)}
}
