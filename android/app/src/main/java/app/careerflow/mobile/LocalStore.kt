package app.careerflow.mobile
import android.content.Context
import android.database.sqlite.SQLiteOpenHelper
import android.database.sqlite.SQLiteDatabase
import android.content.ContentValues
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest

class LocalStore(context:Context,databaseName:String="careerflow.db"):SQLiteOpenHelper(context,databaseName,null,2){
 private val contextRef=context.applicationContext
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
 fun schedules():JSONArray {val r=JSONArray();readableDatabase.rawQuery("SELECT id,data,done,cancelled,revision FROM schedules ORDER BY id DESC",null).use{c->while(c.moveToNext()){val j=JSONObject(c.getString(1)).put("id",c.getLong(0)).put("done",c.getInt(2)==1).put("cancelled",c.getInt(3)==1).put("revision",c.getInt(4));val sources=JSONArray();readableDatabase.rawQuery("SELECT n.source,n.body,n.received FROM evidence e JOIN notices n ON n.id=e.notice WHERE e.schedule=? ORDER BY n.received DESC",arrayOf(c.getLong(0).toString())).use{s->while(s.moveToNext())sources.put(JSONObject().put("source",s.getString(0)).put("body",s.getString(1)).put("received",s.getLong(2)))};r.put(j.put("sources",sources))}};return r}
 fun history():JSONArray{val r=JSONArray();readableDatabase.rawQuery("SELECT at,detail FROM repairs ORDER BY id DESC LIMIT 50",null).use{c->while(c.moveToNext())r.put(JSONObject().put("at",c.getLong(0)).put("detail",c.getString(1)))};return r}
 private fun record(detail:String){writableDatabase.insert("repairs",null,ContentValues().apply{put("at",System.currentTimeMillis());put("detail",detail)})}
 fun reviewIds():List<Long>{val ids=mutableListOf<Long>();readableDatabase.rawQuery("SELECT id FROM notices WHERE state IN ('review','waiting') ORDER BY received DESC LIMIT 50",null).use{while(it.moveToNext())ids.add(it.getLong(0))};return ids}
 fun recheck(){val ids=reviewIds();for(id in ids){val analysis=readableDatabase.rawQuery("SELECT analysis FROM notices WHERE id=?",arrayOf(id.toString())).use{if(it.moveToFirst())it.getString(0) else null};if(analysis!=null)analyzed(id,JSONObject(analysis))};record("Local review checked ${ids.size} notices")}
 fun manual(raw:JSONObject){val e=EventJson.read(raw);require(e.company.isNotBlank()&&e.company.length<=200);require(e.stage in listOf("written_test","interview","assessment","offer","applied","other"));require(e.kind in listOf("start","window","deadline"));require(ScheduleRules.time(e.start)!=null);require(e.end.isBlank()||ScheduleRules.time(e.end)!=null&&ScheduleRules.time(e.end)!!>=ScheduleRules.time(e.start)!!);require(e.kind!="window"||e.end.isNotBlank());val id=raw.optLong("id",0);val db=writableDatabase;db.beginTransaction();try{if(id>0){require(db.update("schedules",ContentValues().apply{put("data",EventJson.write(e).put("manualEdited",true).toString())},"id=?",arrayOf(id.toString()))==1);db.execSQL("UPDATE schedules SET revision=revision+1 WHERE id=?",arrayOf(id))}else db.insertOrThrow("schedules",null,ContentValues().apply{put("data",EventJson.write(e).put("manualEdited",true).toString())});record("User edited schedule #$id · ${e.company} · ${e.start}");db.setTransactionSuccessful()}finally{db.endTransaction()}}
 fun analysisState(id:Long,state:String){writableDatabase.update("notices",ContentValues().apply{put("state",state)},"id=?",arrayOf(id.toString()))}
 fun pendingIds():List<Long>{val ids=mutableListOf<Long>();readableDatabase.rawQuery("SELECT id FROM notices WHERE analysis IS NULL AND state!='failed' ORDER BY received DESC LIMIT 200",null).use{while(it.moveToNext())ids.add(it.getLong(0))};return ids}
 fun received(id:Long):Long=readableDatabase.rawQuery("SELECT received FROM notices WHERE id=?",arrayOf(id.toString())).use{if(it.moveToFirst())it.getLong(0) else 0}
 fun body(id:Long):String?=readableDatabase.rawQuery("SELECT body FROM notices WHERE id=?",arrayOf(id.toString())).use{if(it.moveToFirst())it.getString(0) else null}
 fun analyzed(id:Long,result:JSONObject){val db=writableDatabase;db.beginTransaction();try{
  val body=body(id)?:return;val events=result.optJSONArray("events")?:JSONArray();var review=false;var waiting=false;val reasons=JSONArray()
  for(i in 0 until events.length()){
   val linked=db.rawQuery("SELECT schedule FROM evidence WHERE notice=? AND ordinal=?",arrayOf(id.toString(),i.toString())).use{if(it.moveToFirst())it.getLong(0)else 0}
   if(linked>0){val e=EventJson.read(events.getJSONObject(i));val previous=db.rawQuery("SELECT data FROM schedules WHERE id=?",arrayOf(linked.toString())).use{if(it.moveToFirst())JSONObject(it.getString(0))else null};if(previous!=null&&!previous.optBoolean("manualEdited")&&previous.optString("kind")=="start"&&e.kind in listOf("window","deadline")&&ScheduleRules.verified(e,body,received(id))){val old=EventJson.read(previous);if(ScheduleRules.match(e,old)){db.execSQL("UPDATE schedules SET data=?,revision=revision+1 WHERE id=?",arrayOf(EventJson.write(e.copy(role=e.role.ifBlank{old.role},ref=e.ref.ifBlank{old.ref},location=e.location.ifBlank{old.location})).toString(),linked));record("自动修正弹性时限 / Flexible timing repaired #$linked")}};continue}
   val e=EventJson.read(events.getJSONObject(i));
   if(e.stage in listOf("applied","offer","reject")){val workspace=WorkspaceStore(contextRef);try{if(!workspace.applicationNotice(e,body,received(id))){waiting=true;reasons.put("申请信息待补充 / Waiting for application details")}}finally{workspace.close()};if(e.stage!="offer"||e.start.isBlank())continue}
   val proposed=if(e.start.isBlank()&&e.action=="create")e.copy(action="update")else e
   val target=AnalysisContext.target(events.getJSONObject(i),proposed,schedules())
   if(target!=null&&ScheduleRules.verified(proposed,body,received(id))){apply(id,i,proposed,target);record("AI 跨通知关联 / Cross-notice link #$id → #$target · "+events.getJSONObject(i).optString("linkReason").take(300));continue}
   if(e.start.isBlank()&&e.action=="create"){
    val all=schedules();val known=(0 until all.length()).map{all.getJSONObject(it)}.filter{ScheduleRules.sameIdentity(e,EventJson.read(it))};
    if(known.size==1&&ScheduleRules.verified(e.copy(action="update"),body,received(id))){apply(id,i,e.copy(action="update"),known[0].getLong("id"));continue}
    waiting=true;reasons.put("时间待后续通知 / Awaiting schedule time");continue}
   if(!ScheduleRules.verified(e,body,received(id))){waiting=true;reasons.put("时间原文尚未对应 / Time extraction will be checked again");continue}
   val all=schedules();val candidates=(0 until all.length()).map{all.getJSONObject(it)}.filter{ScheduleRules.match(e,EventJson.read(it))}
   val related=(0 until all.length()).map{all.getJSONObject(it)}.any{ScheduleRules.company(it.optString("company"))==ScheduleRules.company(e.company)&&it.optString("stage")==e.stage&&(it.optString("round").isBlank()||e.round.isBlank()||it.optString("round")==e.round)&&(it.optString("role").isBlank()||e.role.isBlank()||it.optString("role")==e.role)&&(it.optString("ref").isBlank()||e.ref.isBlank()||it.optString("ref")==e.ref)}
   if(candidates.size>1||(candidates.isEmpty()&&(related||e.action!="create"))){review=true;reasons.put("多个岗位或场次无法唯一关联 / Multiple possible jobs or events");continue}
   apply(id,i,e,candidates.firstOrNull()?.getLong("id"));
  }
  db.update("notices",ContentValues().apply{put("analysis",JSONObject(result.toString()).put("reviewReasons",reasons).toString());put("state",if(review)"review" else if(waiting)"waiting" else if(events.length()==0)"informational" else "linked")},"id=?",arrayOf(id.toString()));db.setTransactionSuccessful()
 }finally{db.endTransaction()}}
 private fun apply(notice:Long,ordinal:Int,e:Event,target:Long?){val db=writableDatabase;var data=e;var sid=target
  if(sid!=null){val previous=db.rawQuery("SELECT data FROM schedules WHERE id=?",arrayOf(sid.toString())).use{if(!it.moveToFirst())throw IllegalArgumentException("Missing schedule");EventJson.read(JSONObject(it.getString(0)))}
   val normalized=if(e.kind=="deadline"&&previous.kind=="window"&&e.end==previous.end)e.copy(start=previous.start,kind="window")else e
   data=normalized.copy(round=e.round.ifBlank{previous.round},role=e.role.ifBlank{previous.role},ref=e.ref.ifBlank{previous.ref},start=normalized.start.ifBlank{previous.start},end=normalized.end.ifBlank{if(e.action=="reschedule"&&normalized.start.isNotBlank()&&normalized.start!=previous.start)"" else previous.end},location=e.location.ifBlank{previous.location},kind=if(normalized.start.isBlank())previous.kind else normalized.kind)
   // Preserve completion; sources only extend evidence. Revision changes invalidate stale reminders.
   val newest=db.rawQuery("SELECT max(n.received) FROM evidence ev JOIN notices n ON n.id=ev.notice WHERE ev.schedule=?",arrayOf(sid.toString())).use{it.moveToFirst();it.getLong(0)}
   val received=db.rawQuery("SELECT received FROM notices WHERE id=?",arrayOf(notice.toString())).use{it.moveToFirst();it.getLong(0)}
   val manual=db.rawQuery("SELECT data FROM schedules WHERE id=?",arrayOf(sid.toString())).use{it.moveToFirst();JSONObject(it.getString(0)).optBoolean("manualEdited")}
   if(data!=previous&&received>=newest&&(!manual||e.action in listOf("cancel","reschedule"))){db.execSQL("UPDATE schedules SET data=?,cancelled=CASE WHEN ?='cancel' THEN 1 WHEN ?='reschedule' THEN 0 ELSE cancelled END,revision=revision+1 WHERE id=?",arrayOf(EventJson.write(data).toString(),e.action,e.action,sid))}
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
