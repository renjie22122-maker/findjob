package app.careerflow.mobile

import android.content.Context
import android.database.sqlite.SQLiteOpenHelper
import android.database.sqlite.SQLiteDatabase
import android.content.ContentValues
import org.json.JSONObject

/** Durable snapshots: a batch never deletes notifications or the existing analysis. */
class ReanalysisStore(c:Context,name:String="reanalysis.db"):SQLiteOpenHelper(c,name,null,2){
 override fun onCreate(db:SQLiteDatabase){db.execSQL("CREATE TABLE runs(id INTEGER PRIMARY KEY AUTOINCREMENT,status TEXT,started INTEGER,phase TEXT DEFAULT 'queued',streak INTEGER DEFAULT 0,updated INTEGER DEFAULT 0)");db.execSQL("CREATE TABLE jobs(run INTEGER,notice INTEGER,status TEXT DEFAULT 'pending',error TEXT DEFAULT '',PRIMARY KEY(run,notice))");db.execSQL("CREATE INDEX jobs_status ON jobs(run,status,notice)")}
 override fun onUpgrade(db:SQLiteDatabase,old:Int,new:Int){if(old<2)db.execSQL("ALTER TABLE runs ADD COLUMN updated INTEGER DEFAULT 0")}
 fun latest():Long=readableDatabase.rawQuery("SELECT COALESCE(MAX(id),0) FROM runs",null).use{it.moveToFirst();it.getLong(0)}
 fun state():JSONObject {val run=latest();val result=JSONObject().put("run",run).put("status","idle").put("total",0).put("finished",0).put("failed",0).put("phase","idle")
  if(run==0L)return result
  readableDatabase.rawQuery("SELECT status,started,phase,updated FROM runs WHERE id=?",arrayOf(run.toString())).use{it.moveToFirst();result.put("status",it.getString(0)).put("started",it.getLong(1)).put("phase",it.getString(2)).put("updated",it.getLong(3))}
  var total=0;var finished=0;var failed=0
  readableDatabase.rawQuery("SELECT status,count(*) FROM jobs WHERE run=? GROUP BY status",arrayOf(run.toString())).use{while(it.moveToNext()){val n=it.getInt(1);total+=n;if(it.getString(0)=="done")finished+=n;if(it.getString(0)=="failed")failed+=n}}
  readableDatabase.rawQuery("SELECT error FROM jobs WHERE run=? AND status='failed' ORDER BY notice DESC LIMIT 1",arrayOf(run.toString())).use{if(it.moveToFirst())result.put("lastError",it.getString(0))}
  readableDatabase.rawQuery("SELECT notice FROM jobs WHERE run=? AND status='running' LIMIT 1",arrayOf(run.toString())).use{if(it.moveToFirst())result.put("currentNotice",it.getLong(0))}
  return result.put("total",total).put("finished",finished).put("failed",failed).put("processed",finished+failed)
 }
 @Synchronized fun start(ids:List<Long>):Long {val state=state();if(state.optString("status") in listOf("running","paused"))return state.getLong("run")
  val db=writableDatabase;db.beginTransaction();try{val run=db.insertOrThrow("runs",null,ContentValues().apply{put("status",if(ids.isEmpty())"completed" else "running");put("started",System.currentTimeMillis());put("updated",System.currentTimeMillis())});val insert=db.compileStatement("INSERT INTO jobs(run,notice) VALUES(?,?)");try{for(id in ids){insert.bindLong(1,run);insert.bindLong(2,id);insert.executeInsert()}}finally{insert.close()};db.setTransactionSuccessful();return run}finally{db.endTransaction()}
 }
 fun active(run:Long)=readableDatabase.rawQuery("SELECT 1 FROM runs WHERE id=? AND status='running'",arrayOf(run.toString())).use{it.moveToFirst()}
 fun pause(reason:String="paused"){writableDatabase.execSQL("UPDATE runs SET status='paused',phase=? WHERE id=? AND status='running'",arrayOf(reason,latest()))}
 fun resume(retry:Boolean){val run=latest();val db=writableDatabase;db.beginTransaction();try{if(retry)db.execSQL("UPDATE jobs SET status='pending',error='' WHERE run=? AND status='failed'",arrayOf(run));db.execSQL("UPDATE runs SET status='running',phase='queued',streak=0 WHERE id=?",arrayOf(run));db.setTransactionSuccessful()}finally{db.endTransaction()}}
 fun next(run:Long):Long? {writableDatabase.execSQL("UPDATE jobs SET status='pending' WHERE run=? AND status='running'",arrayOf(run));return readableDatabase.rawQuery("SELECT notice FROM jobs WHERE run=? AND status='pending' ORDER BY notice LIMIT 1",arrayOf(run.toString())).use{if(it.moveToFirst())it.getLong(0)else null}}
 fun phase(run:Long,value:String){writableDatabase.execSQL("UPDATE runs SET phase=?,updated=? WHERE id=? AND status='running'",arrayOf(value,System.currentTimeMillis(),run))}
 fun claim(run:Long,id:Long){writableDatabase.execSQL("UPDATE jobs SET status='running' WHERE run=? AND notice=?",arrayOf(run,id));phase(run,"analyzing")}
 fun pending(run:Long,id:Long){writableDatabase.execSQL("UPDATE jobs SET status='pending' WHERE run=? AND notice=? AND status='running'",arrayOf(run,id));phase(run,"queued")}
 fun finish(run:Long,id:Long,error:String=""){val db=writableDatabase;db.beginTransaction();try{db.execSQL("UPDATE jobs SET status=?,error=? WHERE run=? AND notice=?",arrayOf(if(error.isBlank())"done" else  "failed",error,run,id));db.execSQL("UPDATE runs SET streak=CASE WHEN ?='' THEN 0 ELSE streak+1 END WHERE id=?",arrayOf(error,run));db.execSQL("UPDATE runs SET status='paused',phase='errors' WHERE id=? AND (streak>=3 OR ? IN ('http_401','http_403'))",arrayOf(run,error));db.setTransactionSuccessful()}finally{db.endTransaction()}}
 fun complete(run:Long){writableDatabase.execSQL("UPDATE runs SET status='completed',phase='completed' WHERE id=? AND status='running'",arrayOf(run))}
}
