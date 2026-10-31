package app.careerflow.mobile
import org.json.JSONArray
import org.json.JSONObject

object RelationshipMap {
 fun page(store:LocalStore,query:String,offset:Int):JSONObject {
  val all=store.scheduleSummaries();val matches=(0 until all.length()).map{all.getJSONObject(it)}.filter{s->query.isBlank()||listOf("company","role","round","location").any{s.optString(it).contains(query,true)}}
  val page=JSONArray();for(s in matches.drop(offset.coerceAtLeast(0)).take(20)){
   val links=JSONArray();store.readableDatabase.rawQuery("SELECT DISTINCT n.id,n.source,n.received,n.state FROM notices n JOIN evidence e ON e.notice=n.id WHERE e.schedule=? ORDER BY n.received DESC LIMIT 20",arrayOf(s.getLong("id").toString())).use{q->while(q.moveToNext())links.put(JSONObject().put("id",q.getLong(0)).put("source",q.getString(1)).put("received",q.getLong(2)).put("state",q.getString(3)))};s.put("links",links);page.put(s)
  }
  val unlinked=JSONArray();store.readableDatabase.rawQuery("SELECT id,source,received,state FROM notices n WHERE NOT EXISTS(SELECT 1 FROM evidence e WHERE e.notice=n.id) AND state!='informational'"+(if(query.isBlank())"" else " AND instr(lower(body),lower(?))>0")+" ORDER BY received DESC LIMIT 20",if(query.isBlank())null else arrayOf(query)).use{q->while(q.moveToNext())unlinked.put(JSONObject().put("id",q.getLong(0)).put("source",q.getString(1)).put("received",q.getLong(2)).put("state",q.getString(3)))}
  return JSONObject().put("schedules",page).put("total",matches.size).put("unlinked",unlinked)
 }
}
