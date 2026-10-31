package app.careerflow.mobile

import java.time.LocalDateTime
import java.time.ZoneId

/** Pure matching rules; a company name alone is never a sufficient identity. */
data class Event(val company:String="",val role:String="",val ref:String="",val stage:String="",val kind:String="start",val start:String="",val end:String="",val location:String="",val action:String="create",val evidence:String="",val round:String="")
object ScheduleRules {
 fun company(value:String)=value.lowercase().replace(Regex("[\\s（）()]"),"").removeSuffix("有限公司")
 fun time(value:String):Long?=try { LocalDateTime.parse(value).atZone(ZoneId.of("Asia/Shanghai")).toInstant().toEpochMilli() } catch(_:Exception){null}
 fun sameIdentity(a:Event,b:Event):Boolean {
  if(company(a.company)!=company(b.company)||a.stage!=b.stage)return false
  if(a.round.isNotBlank()&&b.round.isNotBlank()&&a.round!=b.round)return false
  if(a.ref.isNotBlank()&&b.ref.isNotBlank()&&a.ref!=b.ref)return false
  if(a.role.isNotBlank()&&b.role.isNotBlank()&&a.role!=b.role)return false
  return (a.ref.isNotBlank()&&a.ref==b.ref)||(a.role.isNotBlank()&&a.role==b.role)
 }
 fun match(a:Event,b:Event)=sameIdentity(a,b)&&((a.start.isNotBlank()&&a.start==b.start)||(a.ref.isNotBlank()&&a.ref==b.ref&&(a.action in listOf("update","reschedule","cancel")||a.start.isBlank()||b.start.isBlank())))
 fun overlaps(a:Event,b:Event):Boolean {if(a.kind!="start"||b.kind!="start")return false;val x=time(a.start)?:return false;val y=time(b.start)?:return false;if(a.end.isBlank()||b.end.isBlank())return x==y;return x<time(b.end)!!&&y<time(a.end)!!}
 fun verified(e:Event,body:String,received:Long?=null):Boolean {
  if(e.company.isBlank()||e.stage !in listOf("written_test","interview","assessment","offer","applied","other")||e.kind !in listOf("start","window","deadline")||e.action !in listOf("create","update","reschedule","cancel")||e.evidence.isBlank()||!body.contains(e.evidence))return false
  if(e.action=="cancel"&&!Regex("取消|撤销|cancel",RegexOption.IGNORE_CASE).containsMatchIn(e.evidence))return false
  if(e.action=="reschedule"&&!Regex("改期|调整|延期|reschedul|postpon",RegexOption.IGNORE_CASE).containsMatchIn(e.evidence))return false
  if(e.location.isNotBlank()&&!body.contains(e.location))return false
  if(e.ref.isNotBlank()&&!body.contains(e.ref))return false
  if(e.start.isBlank())return e.action in listOf("cancel","update")
  if(time(e.start)==null||e.end.isNotBlank()&&(time(e.end)==null||time(e.end)!!<time(e.start)!!))return false
  // Require each date/time component in the quoted evidence, never infer a date from the API.
  fun supported(value:String):Boolean {
   val d=try{LocalDateTime.parse(value)}catch(_:Exception){return false}
   val q=e.evidence.replace(Regex("[年月/.-]"),"-").replace("日"," ").replace("：",":")
   val explicit=Regex("${d.year}-0?${d.monthValue}-0?${d.dayOfMonth}(?!\\d)").containsMatchIn(q)
   val monthDay=Regex("(?<!\\d)0?${d.monthValue}-0?${d.dayOfMonth}(?!\\d)").containsMatchIn(q)
   val yearAlreadyQuoted=q.contains("${d.year}-")
   val nearReceipt=received!=null&&kotlin.math.abs((time(value)?:0)-received)<183L*86400000
   return (explicit||monthDay&&(yearAlreadyQuoted||nearReceipt))&&Regex("(?<!\\d)0?${d.hour}:${d.minute.toString().padStart(2,'0')}(?!\\d)").containsMatchIn(q)
  }
  return supported(e.start)&&(e.end.isBlank()||supported(e.end))&&(e.kind!="window"||e.end.isNotBlank())
 }
 fun due(e:Event):Long?=time(if(e.kind in listOf("window","deadline"))e.end.ifBlank{e.start}else e.start)
}
