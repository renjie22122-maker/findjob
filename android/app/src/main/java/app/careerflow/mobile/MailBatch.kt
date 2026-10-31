package app.careerflow.mobile
/** UID gaps and partial batches must not skip unprocessed mail. */
object MailBatch {
 const val SIZE=25
 fun initial(count:Int):IntRange?=if(count<=0)null else maxOf(1,count-199).let{it..minOf(count,it+SIZE-1)}
 fun rangeEnd(uid:Long,next:Long)=minOf(next-1,uid+256)
 fun checkpoint(processed:Long,end:Long,found:Int)=if(found<=SIZE)maxOf(processed,end)else processed
}
