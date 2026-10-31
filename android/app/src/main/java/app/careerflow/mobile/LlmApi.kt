package app.careerflow.mobile
import android.content.Context
import org.json.JSONObject
import org.json.JSONArray
import java.net.URI
import java.net.URL
import javax.net.ssl.HttpsURLConnection

data class LlmConfig(val baseUrl:String="https://api.deepseek.com",val model:String="deepseek-chat",val key:String="",val auth:String="bearer",val jsonMode:Boolean=true,val temperature:Boolean=true,val timeout:Int=90,val maxTokens:Int=0)
/** Configurable OpenAI-compatible transport. Defaults only seed existing installations. */
object LlmApi {
 private val timer=java.util.concurrent.Executors.newSingleThreadScheduledExecutor()
 fun config(c:Context):LlmConfig {val s=Secrets(c);val j=try{JSONObject(s.read("llm-config")?:"{}")}catch(_:Exception){JSONObject()};return LlmConfig(j.optString("baseUrl","https://api.deepseek.com"),j.optString("model","deepseek-chat"),if(j.has("key"))j.optString("key")else s.read().orEmpty(),j.optString("auth","bearer"),j.optBoolean("jsonMode",true),j.optBoolean("temperature",true),j.optInt("timeout",90),j.optInt("maxTokens",0))}
 fun validUrl(raw:String):Boolean=try{val u=URI(raw);u.scheme=="https"&&!u.host.isNullOrBlank()&&u.userInfo==null&&u.fragment==null}catch(_:Exception){false}
 fun save(c:Context,j:JSONObject):Boolean {val previous=config(c);val url=j.optString("baseUrl",previous.baseUrl).trim().trimEnd('/');val model=j.optString("model",previous.model).trim();val supplied=j.optString("key").trim();if(!validUrl(url)||model.isBlank()||model.length>200||supplied.isBlank()&&url!=previous.baseUrl)return false;val key=supplied.ifBlank{previous.key};if(key.isBlank())return false;val auth=j.optString("auth",previous.auth);if(auth !in listOf("bearer","api-key"))return false
  val value=JSONObject().put("baseUrl",url).put("model",model).put("key",key).put("auth",auth).put("jsonMode",j.optBoolean("jsonMode",previous.jsonMode)).put("temperature",j.optBoolean("temperature",previous.temperature)).put("timeout",j.optInt("timeout",previous.timeout).coerceIn(15,180)).put("maxTokens",j.optInt("maxTokens",previous.maxTokens).coerceAtLeast(0));Secrets(c).save(value.toString(),"llm-config");return true
 }
 fun publicState(c:Context):JSONObject {val cfg=config(c);val p=c.getSharedPreferences("llm-probe",0);return JSONObject().put("baseUrl",cfg.baseUrl).put("model",cfg.model).put("keySet",cfg.key.isNotBlank()).put("auth",cfg.auth).put("jsonMode",cfg.jsonMode).put("temperature",cfg.temperature).put("timeout",cfg.timeout).put("maxTokens",cfg.maxTokens).put("busy",ApiProbe.busy()).put("status",if(ApiProbe.busy())"running" else  p.getString("status","idle").let{if(it in listOf("running","queued"))"interrupted" else  it}).put("models",JSONArray(p.getString("models","[]")))}
 private fun address(base:String,models:Boolean=false):String {val uri=URI(base);val path=uri.path.orEmpty().trimEnd('/');val target=if(models)path.removeSuffix("/chat/completions")+"/models" else if(path.endsWith("/chat/completions"))path else path+"/chat/completions";return URI(uri.scheme,uri.authority,target,uri.query,null).toASCIIString()}
 fun payload(cfg:LlmConfig,body:JSONObject):JSONObject {val result=JSONObject(body.toString()).put("model",cfg.model);if(cfg.maxTokens>0)result.put("max_tokens",cfg.maxTokens)else result.remove("max_tokens");if(!cfg.jsonMode)result.remove("response_format");if(!cfg.temperature)result.remove("temperature");return result}
 private fun request(c:Context,body:JSONObject?,models:Boolean=false,timeoutSeconds:Int?=null):JSONObject {
  val cfg=config(c);require(validUrl(cfg.baseUrl)&&cfg.key.isNotBlank());val connection=URL(address(cfg.baseUrl,models)).openConnection() as HttpsURLConnection
  val timedOut=java.util.concurrent.atomic.AtomicBoolean(false)
  val deadline=(timeoutSeconds?:cfg.timeout).let{timer.schedule({timedOut.set(true);connection.disconnect()},it.toLong(),java.util.concurrent.TimeUnit.SECONDS)}
  try{connection.requestMethod=if(models)"GET" else "POST";connection.connectTimeout=15000;connection.readTimeout=(timeoutSeconds?:cfg.timeout)*1000;connection.instanceFollowRedirects=false;connection.setRequestProperty("Content-Type","application/json");if(cfg.auth=="api-key")connection.setRequestProperty("api-key",cfg.key)else connection.setRequestProperty("Authorization","Bearer ${cfg.key}")
   if(body!=null){connection.doOutput=true;val payload=payload(cfg,body);connection.outputStream.use{it.write(payload.toString().toByteArray())}}
   val code=connection.responseCode;if(code!=200)throw ApiFailure(code)
   val text=connection.inputStream.bufferedReader().use{r->val out=StringBuilder();val b=CharArray(4096);while(true){val n=r.read(b);if(n<0)break;require(out.length+n<=500000);out.append(b,0,n)};out.toString()};return JSONObject(text)
  }catch(e:Exception){if(timedOut.get())throw java.net.SocketTimeoutException("API deadline exceeded");throw e}finally{deadline?.cancel(false);connection.disconnect()}
 }
 fun complete(c:Context,payload:JSONObject,timeoutSeconds:Int?=null):JSONObject {val envelope=request(c,payload,timeoutSeconds=timeoutSeconds);val choice=envelope.getJSONArray("choices").getJSONObject(0);if(choice.optString("finish_reason")=="length")throw OutputLimit();val content=choice.getJSONObject("message").getString("content").trim();val raw=content.removePrefix("```json").removePrefix("```").removeSuffix("```").trim();return JSONObject(raw)}
 fun models(c:Context,timeoutSeconds:Int?=null):JSONArray {val list=request(c,null,true,timeoutSeconds).getJSONArray("data");val result=JSONArray();for(i in 0 until minOf(list.length(),300)){val id=list.getJSONObject(i).optString("id");if(id.isNotBlank())result.put(id.take(200))};return result}
 class OutputLimit:java.io.IOException("Model output limit reached")
 class ApiFailure(val status:Int):java.io.IOException("API HTTP $status")
}
