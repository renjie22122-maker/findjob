package app.careerflow.mobile

/** Meaning checks shared by first analysis, local repair and resumable reanalysis. */
object NoticeSemantics {
 fun withinRange(provisional:Event,assigned:Event):Boolean {
  val date=try{java.time.LocalDateTime.parse(assigned.start).toLocalDate()}catch(_:Exception){return false}
  val text=provisional.evidence.replace(Regex("[（(](?:周|星期)[一二三四五六日天][）)]|[【】]|\\s+"),"")
  val m=Regex("(?:(20\\d{2})年)?(\\d{1,2})月(\\d{1,2})日?[-—–至](?:(20\\d{2})年)?(?:(\\d{1,2})月)?(\\d{1,2})日").find(text)?:return false
  return try{val g=m.groupValues;val start=java.time.LocalDate.of(g[1].toIntOrNull()?:date.year,g[2].toInt(),g[3].toInt());val end=java.time.LocalDate.of(g[4].toIntOrNull()?:start.year,g[5].toIntOrNull()?:start.monthValue,g[6].toInt());!date.isBefore(start)&&!date.isAfter(end)}catch(_:Exception){false}
 }
 fun current(body:String)=body.split(Regex("原始邮件|原邮件|Original Message|On .{0,100} wrote:",RegexOption.IGNORE_CASE))[0]
 fun informational(body:String):Boolean {
  val text=current(body)
  return (Regex("(?:稍后|随后|马上).{0,12}(?:重新发送|补发|重发)").containsMatchIn(text)&&!Regex("截止|请.*(?:完成|确认)").containsMatchIn(text)) ||
   (Regex("(?:如|如果|若)您?已(?:经)?提交").containsMatchIn(text)&&Regex("无需(?:再次|重复)(?:提交|补充)").containsMatchIn(text)&&!Regex("截止|请于|必须于").containsMatchIn(text))
 }
 fun passed(body:String):Boolean {
  val text=current(body)
  return Regex("(?:恭喜.{0,30}|您已|你已|您)(?:顺利)?通过(?:了)?[^。！!\\n]{0,30}(?:笔试|考试|测评|资格审查)").containsMatchIn(text)&&!Regex("(?:未|没有|尚未|未能)通过|(?:如果|若|如您).{0,30}通过|考试时间|面试时间[：:]|截止时间|作答有效期").containsMatchIn(text)
 }
 fun provisional(body:String)=Regex("(?:具体|实际)(?:面试|考试|笔试)?时间(?:以.{0,20}(?:预约|正式通知|后续通知).{0,12}为准|待预约|另行通知)").containsMatchIn(body.replace(Regex("\\s+"),""))
 fun normalize(e:Event,body:String):Event {
  if(e.start.isBlank()&&passed(body)&&e.stage in listOf("written_test","assessment","interview","other"))return e.copy(stage="other",intent="progress",kind="start",end="",action="create",applicationStatus=e.applicationStatus.ifBlank{"WRITTEN_TEST"})
  if(e.start.isBlank()&&e.stage in listOf("interview","written_test","assessment")&&provisional(e.evidence))return e.copy(preliminary=true,kind="start",end="")
  return e
 }
}
