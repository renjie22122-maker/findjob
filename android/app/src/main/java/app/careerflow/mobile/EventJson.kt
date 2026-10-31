package app.careerflow.mobile
import org.json.JSONObject
object EventJson {
 fun read(j:JSONObject)=Event(j.optString("company"),j.optString("role"),j.optString("ref"),j.optString("stage"),j.optString("kind","start"),j.optString("start"),j.optString("end"),j.optString("location"),j.optString("action","create"),j.optString("evidence"),j.optString("round"))
 fun write(e:Event)=JSONObject().put("company",e.company).put("role",e.role).put("ref",e.ref).put("stage",e.stage).put("kind",e.kind).put("start",e.start).put("end",e.end).put("location",e.location).put("action",e.action).put("evidence",e.evidence).put("round",e.round)
}
