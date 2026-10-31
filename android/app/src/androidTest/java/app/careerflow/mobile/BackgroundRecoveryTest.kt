package app.careerflow.mobile
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.*
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.json.JSONObject
@RunWith(AndroidJUnit4::class)
class BackgroundRecoveryTest {
 private val c=InstrumentationRegistry.getInstrumentation().targetContext
 @Test fun stoppedRequestDoesNotConnectOrRequireCredentials(){try{LlmApi.complete(c,JSONObject(),active={false});fail("Stopped request must abort")}catch(_:java.io.InterruptedIOException){}}
 @Test fun versionOneBatchRecoversRunningItemAndKeepsFinishedCounts(){val name="batch-upgrade.db";c.deleteDatabase(name);var b=ReanalysisStore(c,name);try{val run=b.start(listOf(10,11));b.finish(run,10);b.claim(run,11);b.writableDatabase.execSQL("ALTER TABLE runs DROP COLUMN updated");b.writableDatabase.version=1;b.close();b=ReanalysisStore(c,name);assertEquals(1,b.state().getInt("finished"));assertEquals(11L,b.next(run));b.phase(run,"requesting");assertTrue(b.state().getLong("updated")>0)}finally{b.close();c.deleteDatabase(name)}}
 @Test fun diagnosticSnapshotContainsNoSecrets(){val state=BackgroundHealth.snapshot(c);assertTrue(state.has("reanalysis"));assertFalse(state.toString().contains("apiKey"));assertFalse(state.toString().contains("Authorization"))}
 @Test fun unsupportedRepairDoesNotChangeBatch(){val b=ReanalysisStore(c);try{val before=b.state().toString();assertTrue(AssistantRepair.apply(c,"delete_all").contains("Unsupported"));assertEquals(before,b.state().toString())}finally{b.close()}}
}
