package app.careerflow.mobile
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import javax.mail.internet.MimeBodyPart
import javax.mail.internet.MimeMultipart
@RunWith(AndroidJUnit4::class)
class MailTextTest {
 @Test fun plainHtmlAndAttachmentsAreLocalOnly(){val html=MimeBodyPart();html.setContent("<p>面试通知</p><img src='https://example.invalid/tracking'><a href='https://example.invalid/once'>确认参加</a>","text/html; charset=UTF-8");html.setHeader("Content-Type","text/html; charset=UTF-8");val attachment=MimeBodyPart();attachment.setText("2027年1月12日14:00 笔试 地点东楼","UTF-8");attachment.fileName="schedule.txt";val multi=MimeMultipart();multi.addBodyPart(html);multi.addBodyPart(attachment);val root=MimeBodyPart();root.setContent(multi);root.setHeader("Content-Type",multi.contentType);val text=MailText.extract(root);assertTrue(text.contains("面试通知"));assertTrue(text.contains("2027年1月12日14:00"));assertFalse(text.contains("https://"))}
 @Test fun credentialsAreEncrypted(){val c=InstrumentationRegistry.getInstrumentation().targetContext;val secrets=Secrets(c);secrets.save("synthetic-test-token","test-secret");assertEquals("synthetic-test-token",secrets.read("test-secret"));assertFalse(c.getSharedPreferences("secrets",0).getString("test-secret","")!!.contains("synthetic-test-token"));c.getSharedPreferences("secrets",0).edit().remove("test-secret").commit()}
}
