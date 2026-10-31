package app.careerflow.mobile

import android.content.ContentValues
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/** Source-verified changes and durable clarification proposals. No network or link access. */
class AssistantSchedules(private val store:LocalStore) {
 private val db get()=store.writableDatabase
 init {
  db.execSQL("CREATE TABLE IF NOT EXISTS assistant_pending(id TEXT PRIMARY KEY,action TEXT NOT NULL,versions TEXT NOT NULL,reason TEXT NOT NULL)")
  db.execSQL("CREATE TABLE IF NOT EXISTS assistant_receipts(id TEXT PRIMARY KEY,result TEXT NOT NULL)")
 }
 fun pending():JSONArray {val out=JSONArray();db.rawQuery("SELECT id,action,reason FROM assistant_pending ORDER BY rowid DESC LIMIT 20",null).use{q->while(q.moveToNext())out.put(JSONObject().put("id",q.getString(0)).put("action",JSONObject(q.getString(1))).put("question",q.getString(2)))};return out}
 private fun row(id:Long):JSONObject?=db.rawQuery("SELECT data,done,cancelled,revision FROM schedules WHERE id=?",arrayOf(id.toString())).use{q->if(!q.moveToFirst())null else JSONObject(q.getString(0)).put("id",id).put("done",q.getInt(1)!=0).put("cancelled",q.getInt(2)!=0).put("revision",q.getInt(3))}
 private fun versions(a:JSONObject):JSONObject {val out=JSONObject();for(k in listOf("scheduleId","keep","remove")){val id=a.optLong(k);if(id>0)out.put(id.toString(),row(id)?.optInt("revision")?:-1)};return out}
 private fun unchanged(v:JSONObject):Boolean=v.keys().asSequence().all{key->row(key.toLong())?.optInt("revision")==v.optInt(key)}
 private fun identity(a:Event,b:Event)=ScheduleRules.company(a.company)==ScheduleRules.company(b.company)&&a.stage==b.stage&&listOf(a.role to b.role,a.ref to b.ref,a.round to b.round).all{(x,y)->x.isBlank()||y.isBlank()||x==y}
 private fun sameTime(a:String,b:String)=a==b||a.isNotBlank()&&b.isNotBlank()&&ScheduleRules.time(a)==ScheduleRules.time(b)
 private fun proof(id:Long,e:Event):Boolean {var time=false;var location=e.location.isBlank();db.rawQuery("SELECT n.body,n.received FROM evidence x JOIN notices n ON n.id=x.notice WHERE x.schedule=?",arrayOf(id.toString())).use{q->while(q.moveToNext()){val body=q.getString(0);if(body.contains(e.location))location=true;if(ScheduleRules.verified(e.copy(evidence=body,location="",ref="",action="create"),body,q.getLong(1)))time=true}};return time&&location}
 private fun describe(s:JSONObject)="#${s.optLong("id")} ${s.optString("company")} · ${s.optString("role")} · ${s.optString("stage")} ${s.optString("round")} · ${s.optString("start")}–${s.optString("end")} · ${s.optString("location")}"
 private fun proposal(a:JSONObject,reason:String):String {val v=versions(a);val key=a.toString();val existing=db.rawQuery("SELECT id FROM assistant_pending WHERE action=? AND versions=?",arrayOf(key,v.toString())).use{q->if(q.moveToFirst())q.getString(0)else null};val id=existing?:UUID.randomUUID().toString();db.insertWithOnConflict("assistant_pending",null,ContentValues().apply{put("id",id);put("action",key);put("versions",v.toString());put("reason",reason)},android.database.sqlite.SQLiteDatabase.CONFLICT_REPLACE);if(existing==null)store.record("Assistant clarification · id=$id · action=$a · reason=$reason");return "待确认 / Please confirm: $reason"}
 fun invalid(result:JSONObject,context:JSONObject):JSONArray {
  val failures=JSONArray();val notices=context.optJSONArray("notices")?:JSONArray();val ids=(0 until notices.length()).map{notices.getJSONObject(it).optLong("id")}.toSet();val actions=result.optJSONArray("scheduleActions")?:JSONArray()
  for(i in 0 until minOf(actions.length(),20)){val a=actions.getJSONObject(i);if(a.optString("type") !in listOf("update","create"))continue;val notice=a.optLong("noticeId");val raw=a.optJSONObject("event");val body=if(notice in ids)store.body(notice)else null
   val reason=when{body==null->"noticeId must be a retrieved source ID";raw==null->"event object is required";raw.optString("stage") !in listOf("written_test","interview","assessment","offer","applied","other")->"stage must use the specified English enum";raw.optString("kind") !in listOf("start","window","deadline")->"kind must be start/window/deadline";raw.optString("action") !in listOf("create","update","reschedule","cancel")->"action must be create/update/reschedule/cancel";!ScheduleRules.verified(EventJson.read(raw),body,store.received(notice))->"Use exact contiguous source evidence, literal location/ref, empty strings for unknowns, and ISO LOCAL dates without timezone offset; every date/time must be supported by the quote";a.optString("type")=="create"&&(!body.contains(raw.optString("company"))||raw.optString("action")!="create")->"create requires literal company from source and action=create";else->""}
   if(reason.isNotBlank())failures.put(JSONObject().put("index",i).put("reason",reason))
  };return failures
 }
 fun execute(result:JSONObject,context:JSONObject,request:String):JSONArray {
  val receipt=db.rawQuery("SELECT result FROM assistant_receipts WHERE id=?",arrayOf(request)).use{q->if(q.moveToFirst())q.getString(0)else null};if(receipt!=null)return JSONArray(receipt)
  val out=JSONArray();db.beginTransaction()
  try {
   val confirm=result.optJSONArray("confirmPending")?:JSONArray()
   for(i in 0 until minOf(confirm.length(),10)){val id=confirm.optString(i);val saved=db.rawQuery("SELECT action,versions FROM assistant_pending WHERE id=?",arrayOf(id)).use{q->if(q.moveToFirst())q.getString(0) to q.getString(1)else null}?:continue
    if(!unchanged(JSONObject(saved.second))){out.put("日程已变化，请重新核对 / Schedule changed; review again");db.delete("assistant_pending","id=?",arrayOf(id));continue}
    out.put(apply(JSONObject(saved.first),true));db.delete("assistant_pending","id=?",arrayOf(id))
   }
   val dismiss=result.optJSONArray("dismissPending")?:JSONArray();for(i in 0 until minOf(dismiss.length(),10)){val id=dismiss.optString(i);if(db.delete("assistant_pending","id=?",arrayOf(id))>0){store.record("Assistant proposal declined: $id");out.put("已保留各自日程 / Kept schedules separate")}}
   val shown=context.optJSONArray("schedules")?:JSONArray();val allowed=(0 until shown.length()).associate{val s=shown.getJSONObject(it);s.getLong("id") to s.optInt("revision")}.toMutableMap()
   val notices=context.optJSONArray("notices")?:JSONArray();val sourceIds=(0 until notices.length()).map{notices.getJSONObject(it).getLong("id")}.toSet()
   val actions=result.optJSONArray("scheduleActions")?:JSONArray()
   for(i in 0 until minOf(actions.length(),20)){
    val a=actions.getJSONObject(i);val ids=listOf("scheduleId","keep","remove").map{a.optLong(it)}.filter{it>0}
    if(ids.any{it !in allowed||row(it)?.optInt("revision")!=allowed[it]}){out.put("日程已变化或未检索，未执行 / Stale or unseen schedule; no change");continue}
    if(a.optString("type") in listOf("update","create")&&a.optLong("noticeId") !in sourceIds){out.put("未提供通知来源，未执行 / Source not retrieved; no change");continue}
    out.put(apply(a,false));for(id in ids)row(id)?.let{allowed[id]=it.optInt("revision")}
   }
   db.insertOrThrow("assistant_receipts",null,ContentValues().apply{put("id",request);put("result",out.toString())});db.setTransactionSuccessful()
  }finally{db.endTransaction()};return out
 }
 private fun apply(a:JSONObject,confirmed:Boolean):String = when(a.optString("type")){
  "create"->create(a,confirmed)
  "merge"->merge(a,confirmed)
  "update"->update(a,confirmed)
  else->"不支持的日程操作，未执行 / Unsupported schedule action"
 }
 private fun create(a:JSONObject,confirmed:Boolean):String {
  val notice=a.optLong("noticeId");val body=store.body(notice)?:return "通知不存在 / Missing source";val raw=a.optJSONObject("event")?:return "缺少提取结果 / Missing event";val e=EventJson.read(raw)
  if(!body.contains(e.company)||e.action!="create"||e.start.isBlank()||!ScheduleRules.verified(e,body,store.received(notice)))return "来源缺少可验证时间，未创建提醒 / No verified time; no reminder created"
  val all=store.schedules(false);val candidates=(0 until all.length()).map{all.getJSONObject(it)}.filter{ScheduleRules.match(e,EventJson.read(it))}
  if(candidates.size==1)return update(JSONObject(a.toString()).put("type","update").put("scheduleId",candidates[0].getLong("id")),false)
  val related=(0 until all.length()).map{all.getJSONObject(it)}.filter{identity(e,EventJson.read(it))}
  if((candidates.size>1||related.isNotEmpty())&&!confirmed)return proposal(a,"通知 #$notice 是否是单独一场活动？${e.company} ${e.role} ${e.start}–${e.end} ${e.location}；已有可能相关日程，未重复创建。 / Is this a separate event?")
  val done=db.rawQuery("SELECT done FROM notices WHERE id=?",arrayOf(notice.toString())).use{it.moveToFirst();it.getInt(0)}
  val id=db.insertOrThrow("schedules",null,ContentValues().apply{put("data",EventJson.write(e).toString());put("done",done)})
  val ordinal=db.rawQuery("SELECT MIN(ordinal) FROM evidence WHERE notice=?",arrayOf(notice.toString())).use{it.moveToFirst();minOf(-1,it.getInt(0)-1)}
  db.execSQL("INSERT INTO evidence(notice,ordinal,schedule) VALUES(?,?,?)",arrayOf(notice,ordinal,id));store.record(JSONObject().put("kind","assistant_schedule").put("operation","create").put("noticeId",notice).put("after",row(id)).toString())
  return "已补充日程 #$id，按原文时间安排提醒 / Added source-backed schedule #$id"
 }
 private fun update(a:JSONObject,confirmed:Boolean):String {
  val id=a.optLong("scheduleId");val before=row(id)?:return "日程不存在 / Missing schedule";val old=EventJson.read(before)
  val notice=a.optLong("noticeId");val body=store.body(notice)?:return "通知不存在 / Missing source"
  val raw=a.optJSONObject("event")?:return "缺少提取结果 / Missing event";val e=EventJson.read(raw)
  if(!ScheduleRules.verified(e,body,store.received(notice)))return "原文不能支持这次修改，未执行 / Source does not verify this change"
  if(!identity(e,old))return "岗位或轮次不一致，未修改 / Different company, job or round; no change"
  val newest=db.rawQuery("SELECT MAX(n.received) FROM evidence x JOIN notices n ON n.id=x.notice WHERE x.schedule=?",arrayOf(id.toString())).use{q->q.moveToFirst();q.getLong(0)}
  val changedTime=e.start.isNotBlank()&&(!sameTime(e.start,old.start)||e.end.isNotBlank()&&!sameTime(e.end,old.end))
  val sameSource=db.rawQuery("SELECT 1 FROM evidence WHERE schedule=? AND notice=?",arrayOf(id.toString(),notice.toString())).use{it.moveToFirst()}
  val conflict=(!sameSource&&!body.contains(old.company)&&!body.contains(old.ref.takeIf{it.isNotBlank()}?:"__no_ref__"))||before.optBoolean("manualEdited")||store.received(notice)<newest||changedTime&&!sameSource&&e.action !in listOf("reschedule","cancel")
  if(conflict&&!confirmed)return proposal(a,"是否按通知 #$notice 更新 ${describe(before)}？原文：${e.evidence.take(500)}；原因：人工修改、较旧来源或时间变化需要确认。 / Confirm source-based change?")
  val updated=e.copy(company=old.company,role=old.role.ifBlank{e.role},ref=old.ref.ifBlank{e.ref},round=old.round.ifBlank{e.round},stage=old.stage,start=e.start.ifBlank{old.start},end=if(e.start.isBlank())old.end else e.end.ifBlank{if(e.action=="reschedule"||!sameTime(e.start,old.start))"" else old.end},kind=if(e.start.isBlank())old.kind else e.kind,location=e.location.ifBlank{old.location})
  val data=EventJson.write(updated);if(before.optBoolean("manualEdited")||confirmed)data.put("manualEdited",true)
  val cancelled=if(e.action=="cancel")1 else if(e.action=="reschedule")0 else if(before.optBoolean("cancelled"))1 else 0
  db.execSQL("UPDATE schedules SET data=?,cancelled=?,revision=revision+1 WHERE id=?",arrayOf(data.toString(),cancelled,id))
  if(!sameSource){val ordinal=db.rawQuery("SELECT MIN(ordinal) FROM evidence WHERE notice=?",arrayOf(notice.toString())).use{q->q.moveToFirst();minOf(-1,q.getInt(0)-1)};db.execSQL("INSERT INTO evidence(notice,ordinal,schedule) VALUES(?,?,?)",arrayOf(notice,ordinal,id))}
  store.record(JSONObject().put("kind","assistant_schedule").put("operation","update").put("confirmed",confirmed).put("noticeId",notice).put("before",before).put("after",row(id)).toString())
  return "已核对并更新日程 #$id，保留完成状态 / Updated #$id; completion preserved"
 }
 private fun merge(a:JSONObject,confirmed:Boolean):String {
  val keep=a.optLong("keep");val remove=a.optLong("remove");if(keep==remove)return "同一日程，无需合并 / Already the same schedule"
  val left=row(keep)?:return "保留日程不存在 / Missing target";val right=row(remove)?:return "重复日程不存在 / Missing duplicate"
  val x=EventJson.read(left);val y=EventJson.read(right)
  val exact=x.kind==y.kind&&sameTime(x.start,y.start)&&(x.end.isBlank()||y.end.isBlank()||sameTime(x.end,y.end))
  val windowDeadline=x.kind in listOf("window","deadline")&&y.kind in listOf("window","deadline")&&sameTime(x.end,y.end)&&x.end.isNotBlank()&&(x.kind=="deadline"||y.kind=="deadline")
  val strong=ScheduleRules.sameIdentity(x,y)
  val safe=identity(x,y)&&strong&&(exact||windowDeadline)&&(x.location.isBlank()||y.location.isBlank()||x.location==y.location)&&left.optBoolean("cancelled")==right.optBoolean("cancelled")&&!left.optBoolean("manualEdited")&&!right.optBoolean("manualEdited")&&proof(keep,x)&&proof(remove,y)
  if(!safe&&!confirmed)return proposal(a,"这两条是否同一场，保留 #$keep 的有冲突字段，并保留任一记录的已完成／已取消状态？\n${describe(left)}\n${describe(right)}\n原文 A：${x.evidence.take(220)}\n原文 B：${y.evidence.take(220)}\n建议原因：${a.optString("reason").take(300)}；岗位、轮次、时间、地点或来源无法完全一致核对。 / Same event? Keep #$keep on conflicting fields?")
  val base=if(windowDeadline&&y.kind=="window")y else x
  val merged=base.copy(company=x.company,role=x.role.ifBlank{y.role},ref=x.ref.ifBlank{y.ref},round=x.round.ifBlank{y.round},location=x.location.ifBlank{y.location},end=base.end.ifBlank{y.end})
  val data=EventJson.write(merged);if(left.optBoolean("manualEdited")||right.optBoolean("manualEdited")||confirmed)data.put("manualEdited",true)
  db.execSQL("UPDATE schedules SET data=?,done=?,cancelled=?,revision=revision+1 WHERE id=?",arrayOf(data.toString(),if(left.optBoolean("done")||right.optBoolean("done"))1 else 0,if(left.optBoolean("cancelled")||right.optBoolean("cancelled"))1 else 0,keep))
  db.execSQL("UPDATE evidence SET schedule=? WHERE schedule=?",arrayOf(keep,remove))
  // Transfer delivery receipts so already-sent reminders do not reappear under the survivor ID.
  db.execSQL("INSERT OR IGNORE INTO deliveries(token) SELECT ? || substr(token,instr(token,':')) FROM deliveries WHERE token LIKE ?",arrayOf(keep.toString(),"$remove:%"))
  db.delete("schedules","id=?",arrayOf(remove.toString()))
  store.record(JSONObject().put("kind","assistant_schedule").put("operation","merge").put("confirmed",confirmed).put("before",left).put("beforeRemove",right).put("after",row(keep)).toString())
  return "已合并 #$remove → #$keep，共用提醒，保留来源与完成状态 / Merged; shared reminders, sources and completion preserved"
 }
}
