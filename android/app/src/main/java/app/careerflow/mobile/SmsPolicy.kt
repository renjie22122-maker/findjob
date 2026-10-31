package app.careerflow.mobile

object SmsPolicy {
 fun relevant(body:String):Boolean = !Regex("验证码|动态密码|一次性密码|登录验证|重置密码|verification code|one.time password|\\bOTP\\b",RegexOption.IGNORE_CASE).containsMatchIn(body) && Regex("招聘|考试|笔试|面试|测评|投递|录用|应聘|资格审查|interview|assessment|application",RegexOption.IGNORE_CASE).containsMatchIn(body)
 fun redact(body:String):String = body.replace(Regex("(?:https?://|www\\.)[^\\s<>]+"),"[链接已隐藏]").replace(Regex("\\b\\d{17}[\\dXx]\\b"),"[身份证已隐藏]").take(24000)
}
