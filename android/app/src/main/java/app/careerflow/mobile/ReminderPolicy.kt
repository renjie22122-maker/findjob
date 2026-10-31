package app.careerflow.mobile
/** Catch up useful reminders after Doze without sending day/hour/now alerts together. */
object ReminderPolicy {
 fun deliver(at:Long,due:Long,now:Long)=at<=now&&(due>=now||now-due<=2*60*60*1000L)
}
