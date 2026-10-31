package app.careerflow.mobile
import org.junit.Test
import org.junit.Assert.*
class SmsPolicyTest{
 @Test fun filtersAuthenticationBeforeStorage(){assertFalse(SmsPolicy.relevant("招聘平台验证码123456"));assertFalse(SmsPolicy.relevant("快递已到达"));assertTrue(SmsPolicy.relevant("明天请参加招聘面试"))}
 @Test fun removesLinksAndIdentity(){val result=SmsPolicy.redact("笔试 https://example.test/once?token=secret 123456789012345678");assertFalse(result.contains("secret"));assertFalse(result.contains("123456789012345678"))}
}
