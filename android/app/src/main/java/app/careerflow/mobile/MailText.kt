package app.careerflow.mobile
import android.text.Html
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import javax.mail.*
import java.util.zip.ZipInputStream

/** Reads message content only. No remote resources or embedded URLs are fetched. */
object MailText {
 fun extract(p:Part,depth:Int=0):String {
  if(depth>8||p.size>2*1024*1024)return "[附件超出解析限制 / attachment limit]"
  if(p.isMimeType("multipart/*")){val multi=p.content as Multipart;return (0 until minOf(multi.count,24)).joinToString("\n"){extract(multi.getBodyPart(it),depth+1)}.take(24000)}
  if(p.isMimeType("text/plain")||p.isMimeType("text/calendar"))return p.inputStream.use{String(it.readBytesBounded(256000),java.nio.charset.Charset.forName(javax.mail.internet.ContentType(p.contentType).getParameter("charset")?:"UTF-8"))}
  if(p.isMimeType("text/html")){val html=p.inputStream.use{String(it.readBytesBounded(256000),java.nio.charset.Charset.forName(javax.mail.internet.ContentType(p.contentType).getParameter("charset")?:"UTF-8"))};return Html.fromHtml(html,Html.FROM_HTML_MODE_LEGACY).toString()}
  val name=p.fileName.orEmpty().lowercase()
  if(name.endsWith(".pdf"))return try{p.inputStream.use{input->PDDocument.load(input.readBytesBounded(2*1024*1024)).use{pdf->PDFTextStripper().apply{endPage=minOf(pdf.numberOfPages,10)}.getText(pdf).take(16000)}}}catch(_:Exception){"[PDF未解析，请核对附件 / PDF needs review]"}
  if(name.endsWith(".docx")||name.endsWith(".xlsx"))return try{val result=StringBuilder();ZipInputStream(p.inputStream).use{zip->var entries=0;var entry=zip.nextEntry;while(entry!=null&&entries++<80){if(entry.name=="word/document.xml"||entry.name=="xl/sharedStrings.xml"||entry.name.startsWith("xl/worksheets/sheet")){result.append(Html.fromHtml(String(zip.readBytesBounded(256000)),Html.FROM_HTML_MODE_LEGACY)).append('\n')};if(result.length>16000)break;entry=zip.nextEntry}};result.toString().take(16000)}catch(_:Exception){"[文档未解析 / Document needs review]"}
  return if(p.disposition==Part.ATTACHMENT)"[附件未解析 / Attachment needs review: ${name.take(100)}]" else ""
 }
}
private fun java.io.InputStream.readBytesBounded(limit:Int):ByteArray{val out=java.io.ByteArrayOutputStream();val buffer=ByteArray(8192);var n=read(buffer);while(n!=-1){require(out.size()+n<=limit);out.write(buffer,0,n);n=read(buffer)};return out.toByteArray()}
