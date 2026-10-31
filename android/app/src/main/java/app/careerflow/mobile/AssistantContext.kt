package app.careerflow.mobile

import org.json.JSONArray
import org.json.JSONObject

/** Bounded retrieval over all saved sources, including notices without a schedule. */
object AssistantContext {
 fun build(store:LocalStore,query:String):JSONObject {
  val all=store.scheduleSummaries();val words=Regex("[A-Za-z0-9]{3,}|[\\p{IsHan}]{2,}").findAll(query).map{it.value}.toList()
  val ranked=(0 until all.length()).map{all.getJSONObject(it)}.sortedByDescending{s->listOf("company","role","round").count{key->val v=s.optString(key);v.isNotBlank()&&query.contains(v,true)}}
  val schedules=JSONArray(ranked.take(30));val notices=linkedMapOf<Long,JSONObject>();var budget=48000
  fun add(id:Long){if(id in notices||notices.size>=40||budget<=0)return;store.readableDatabase.rawQuery("SELECT source,received,body FROM notices WHERE id=?",arrayOf(id.toString())).use{q->if(q.moveToFirst()){val text=q.getString(2).take(minOf(5000,budget));notices[id]=JSONObject().put("id",id).put("source",q.getString(0)).put("received",q.getLong(1)).put("body",text);budget-=text.length}}}
  Regex("(?:通知|message|notice)\\s*#?(\\d+)",RegexOption.IGNORE_CASE).findAll(query).take(10).forEach{add(it.groupValues[1].toLong())}
  // Prefer explicit company names, then query terms. SQL scans text but only materializes bounded matches.
  val companies=ranked.map{it.optString("company")}.filter{it.isNotBlank()&&query.contains(it,true)}
  val terms=(companies+words).distinct().take(8)
  val where=if(terms.isEmpty())"" else " WHERE "+terms.joinToString(" OR "){"instr(lower(body),lower(?))>0"}
  store.readableDatabase.rawQuery("SELECT id FROM notices"+where+" ORDER BY received DESC LIMIT 24",terms.toTypedArray()).use{q->while(q.moveToNext())add(q.getLong(0))}
  if(notices.isEmpty())store.readableDatabase.rawQuery("SELECT id FROM notices ORDER BY received DESC LIMIT 16",null).use{q->while(q.moveToNext())add(q.getLong(0))}
  for(i in 0 until schedules.length()){val s=schedules.getJSONObject(i);val ids=JSONArray();store.readableDatabase.rawQuery("SELECT e.notice FROM evidence e JOIN notices n ON n.id=e.notice WHERE e.schedule=? ORDER BY n.received DESC LIMIT 3",arrayOf(s.getLong("id").toString())).use{q->while(q.moveToNext()){val id=q.getLong(0);add(id);if(id in notices)ids.put(id)}};s.put("sourceIds",ids)}
  return JSONObject().put("schedules",schedules).put("notices",JSONArray(notices.values.toList())).put("totalSchedules",all.length()).put("totalNotices",store.noticeCount()).put("scope","Only supplied records were inspected; never claim a full audit of omitted records.")
 }
}
