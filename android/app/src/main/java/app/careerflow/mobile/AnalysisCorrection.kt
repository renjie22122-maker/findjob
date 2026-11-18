package app.careerflow.mobile
import org.json.JSONObject
/** Only failed ordinals may be patched; storage revalidates original source evidence. */
object AnalysisCorrection {
 fun merge(saved:JSONObject,reply:JSONObject):JSONObject? {
  val failed=saved.optJSONArray("failedIndexes")?:return null
  val allowed=(0 until failed.length()).map{failed.getInt(it)}.toSet()
  val patches=reply.optJSONArray("corrections")?:return null
  val result=JSONObject(saved.toString());val events=result.getJSONArray("events");val seen=mutableSetOf<Int>();var changed=false
  for(i in 0 until minOf(patches.length(),12)){
   val patch=patches.optJSONObject(i)?:continue;val index=patch.optInt("index",-1)
   if(index !in allowed||index !in 0 until events.length()||!seen.add(index))continue
   val raw=patch.optJSONObject("event")?:continue;val clean=JSONObject()
   for(key in raw.keys()){val value=raw.get(key);clean.put(key,if(value is String)SmsPolicy.redact(value).take(12000)else value)}
   events.put(index,clean);changed=true
  }
  return if(changed)result else null
 }
}
