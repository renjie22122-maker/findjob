package app.careerflow.mobile
import android.content.Context
import android.database.sqlite.SQLiteOpenHelper
import android.database.sqlite.SQLiteDatabase
import android.content.ContentValues
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest

class LocalStore(context:Context):SQLiteOpenHelper(context,"careerflow.db",null,1){
 override fun onCreate(db:SQLiteDatabase){db.execSQL("CREATE TABLE notices(id INTEGER PRIMARY KEY, fingerprint TEXT UNIQUE, body TEXT, received INTEGER, analysis TEXT, state TEXT DEFAULT 'pending', done INTEGER DEFAULT 0)")}
 override fun onUpgrade(db:SQLiteDatabase,old:Int,new:Int){}
 fun save(sender:String,body:String,date:Long):Long {
  if(!SmsPolicy.relevant(body))return -1
  val safe=SmsPolicy.redact(body)
  val key=MessageDigest.getInstance("SHA-256").digest((sender+"\n"+safe.replace(Regex("\\s+")," ")).toByteArray()).joinToString(""){"%02x".format(it)}
  val values=ContentValues().apply{put("fingerprint",key);put("body",safe);put("received",date)}
  return writableDatabase.insertWithOnConflict("notices",null,values,SQLiteDatabase.CONFLICT_IGNORE)
 }
 fun items():JSONArray {val result=JSONArray();readableDatabase.rawQuery("SELECT * FROM notices ORDER BY received DESC LIMIT 200",null).use{c->while(c.moveToNext()){result.put(JSONObject().put("id",c.getLong(0)).put("body",c.getString(2)).put("received",c.getLong(3)).put("analysis",c.getString(4)?.let{JSONObject(it)}?:JSONObject.NULL).put("state",c.getString(5)).put("done",c.getInt(6)==1))}};return result}
 fun body(id:Long):String?=readableDatabase.rawQuery("SELECT body FROM notices WHERE id=?",arrayOf(id.toString())).use{if(it.moveToFirst())it.getString(0) else null}
 fun analyzed(id:Long,result:JSONObject){writableDatabase.update("notices",ContentValues().apply{put("analysis",result.toString());put("state","review")},"id=?",arrayOf(id.toString()))}
 fun done(id:Long,value:Boolean){writableDatabase.update("notices",ContentValues().apply{put("done",if(value)1 else 0)},"id=?",arrayOf(id.toString()))}
}
