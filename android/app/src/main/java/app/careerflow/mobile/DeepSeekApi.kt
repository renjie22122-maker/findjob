package app.careerflow.mobile
import org.json.JSONObject
import java.net.URL
import javax.net.ssl.HttpsURLConnection
/** One bounded transport for on-device analysis and conversational assistance. */
object DeepSeekApi {
 fun complete(key:String,request:JSONObject):JSONObject {
  val c=URL("https://api.deepseek.com/chat/completions").openConnection() as HttpsURLConnection
  try{c.requestMethod="POST";c.connectTimeout=15000;c.readTimeout=60000;c.doOutput=true;c.instanceFollowRedirects=false;c.setRequestProperty("Authorization","Bearer $key");c.setRequestProperty("Content-Type","application/json");c.outputStream.use{it.write(request.toString().toByteArray())};if(c.responseCode!=200)throw java.io.IOException("API status ${c.responseCode}");val text=c.inputStream.bufferedReader().use{reader->val result=StringBuilder();val buffer=CharArray(4096);while(true){val count=reader.read(buffer);if(count<0)break;require(result.length+count<=100000);result.append(buffer,0,count)};result.toString()};return JSONObject(JSONObject(text).getJSONArray("choices").getJSONObject(0).getJSONObject("message").getString("content"))}finally{c.disconnect()}
 }
}
