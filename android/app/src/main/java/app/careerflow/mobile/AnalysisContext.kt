package app.careerflow.mobile

import org.json.JSONArray
import org.json.JSONObject

/** Bounded, source-backed context. No network fetching, link expansion or credential lookup. */
object AnalysisContext {
 private fun terms(text:String)=Regex("[\\p{IsHan}]{2,8}|[A-Za-z0-9]{3,}").findAll(text.lowercase()).flatMap{val value=it.value;if(value.any{c->c.code in 0x4E00..0x9FFF})value.windowed(2).asSequence()else sequenceOf(value)}.toSet()
 private fun score(a:String,b:String):Int=terms(a).intersect(terms(b)).size
 fun build(store:LocalStore,id:Long):JSONObject {
  val body=store.body(id).orEmpty();val words=terms(body);val all=store.schedules(false)
  val schedules=(0 until all.length()).map{all.getJSONObject(it)}.map{it to words.intersect(terms(it.toString())).size}.sortedByDescending{it.second}.map{it.first}.take(16)
  val selected=JSONArray();var budget=24000
  for(s in schedules){val item=JSONObject(s.toString());val sources=store.sources(s.getLong("id"),3);val compact=JSONArray()
   for(i in 0 until minOf(sources.length(),3)){val src=JSONObject(sources.getJSONObject(i).toString());src.put("body",src.optString("body").take(1800));compact.put(src)}
   item.put("sources",compact);if(item.toString().length<=budget){selected.put(item);budget-=item.toString().length}}
  val notices=store.items();val related=JSONArray()
  val ranked=(0 until notices.length()).map{notices.getJSONObject(it)}.filter{it.optLong("id")!=id}.map{it to words.intersect(terms(it.optString("body"))).size}.sortedByDescending{it.second}.map{it.first}.take(10)
  for(n in ranked){val item=JSONObject().put("id",n.getLong("id")).put("source",n.optString("source")).put("received",n.getLong("received")).put("body",n.optString("body").take(2200));if(item.toString().length<=budget){related.put(item);budget-=item.toString().length}}
  return JSONObject().put("schedules",selected).put("notices",related)
 }
 fun revisitIds(store:LocalStore,id:Long):List<Long>{val body=store.body(id).orEmpty();return store.reviewIds().filter{it!=id&&score(body,store.body(it).orEmpty())>0}.take(8)}
 fun target(raw:JSONObject,e:Event,all:JSONArray):Long? {
  val id=raw.optLong("targetScheduleId");if(id<=0||raw.optString("linkReason").isBlank())return null
  val target=(0 until all.length()).map{all.getJSONObject(it)}.singleOrNull{it.optLong("id")==id}?:return null
  val old=EventJson.read(target);val quote=raw.optString("contextQuote")
  val sources=target.optJSONArray("sources")?:return null
  if(quote.length<8||(0 until sources.length()).none{sources.getJSONObject(it).optString("body").contains(quote)})return null
  if(ScheduleRules.company(e.company)!=ScheduleRules.company(old.company)||e.stage!=old.stage)return null
  if(e.ref.isNotBlank()&&old.ref.isNotBlank()&&e.ref!=old.ref)return null
  if(e.role.isNotBlank()&&old.role.isNotBlank()&&e.role!=old.role)return null
  if(e.round.isNotBlank()&&old.round.isNotBlank()&&e.round!=old.round)return null
  // Changed timing needs an explicit update; an invitation for another occurrence stays separate.
  if(e.start.isNotBlank()&&e.start!=old.start&&e.action !in listOf("reschedule","cancel")&&!(e.kind=="deadline"&&e.end==old.end))return null
  return id
 }
}
