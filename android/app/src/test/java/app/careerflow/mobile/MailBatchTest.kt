package app.careerflow.mobile
import org.junit.Test
import org.junit.Assert.*
class MailBatchTest {
 @Test fun largeBacklogDiscoveryAndBodiesAreBounded(){assertEquals(9801..9825,MailBatch.initial(10000));assertEquals(1..5,MailBatch.initial(5));assertNull(MailBatch.initial(0));assertEquals(356L,MailBatch.rangeEnd(100,1000000));assertEquals(102L,MailBatch.rangeEnd(100,103))}
 @Test fun checkpointsNeverSkipUnprocessedMessagesAndCrossDeletedGaps(){assertEquals(125L,MailBatch.checkpoint(125,356,256));assertEquals(356L,MailBatch.checkpoint(125,356,25));assertEquals(356L,MailBatch.checkpoint(100,356,0));assertEquals(400L,MailBatch.checkpoint(400,356,0))}
}
