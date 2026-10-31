package app.careerflow.mobile
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony

class SmsReceiver:BroadcastReceiver(){override fun onReceive(context:Context,intent:Intent){
 if(intent.action!=Telephony.Sms.Intents.SMS_RECEIVED_ACTION||!context.getSharedPreferences("preferences",0).getBoolean("auto",false))return
 val messages=Telephony.Sms.Intents.getMessagesFromIntent(intent);if(messages.isEmpty())return
 val body=messages.joinToString(""){it.messageBody?:""};if(!SmsPolicy.relevant(body))return
 val pending=goAsync();val c=context.applicationContext
 executor.execute{try{val store=LocalStore(c);try{val id=store.save(messages[0].originatingAddress?:"",body,messages[0].timestampMillis);AnalysisWorker.enqueue(c,id)}finally{store.close()}}catch(_:Exception){c.getSharedPreferences("background",0).edit().putString("smsError","storage_or_queue").apply()}finally{pending.finish()}}
}
 companion object {private val executor=java.util.concurrent.Executors.newSingleThreadExecutor()}
}
