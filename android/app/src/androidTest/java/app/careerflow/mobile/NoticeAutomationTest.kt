package app.careerflow.mobile
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.*
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.json.JSONArray
import org.json.JSONObject

@RunWith(AndroidJUnit4::class)
class NoticeAutomationTest {
 private val context=InstrumentationRegistry.getInstrumentation().targetContext
 private lateinit var store:LocalStore
 @Before fun setup(){context.deleteDatabase("notice-automation-test.db");store=LocalStore(context,"notice-automation-test.db")}
 @After fun cleanup(){store.close();context.deleteDatabase("notice-automation-test.db")}
 private fun analyze(id:Long,e:Event)=store.analyzed(id,JSONObject().put("events",JSONArray().put(EventJson.write(e))))
 @Test fun positiveResultReusesSourceBackedApplicationAndDoesNotResetExam(){
  val company="进度测试科技";val role="算法工程师";val quote="$company 招聘$role，笔试2026年11月18日09:00。"
  val exam=Event(company=company,role=role,stage="written_test",start="2026-11-18T09:00:00",evidence=quote)
  analyze(store.save("HR",quote,1,"email","progress-source"),exam)
  val sid=store.schedules().getJSONObject(0).getLong("id");store.complete(sid,true)
  val workspace=WorkspaceStore(context)
  try {
   val app=workspace.ensureApplication(company,role,"written_test")
   val text="进度测试科技有限公司：恭喜您通过算法工程师岗位笔试，后续电话联系协商面试时间。"
   val result=EventJson.write(Event(company="进度测试科技有限公司",role=role,stage="other",intent="progress",evidence=text)).put("targetApplicationId",app).put("associationConfidence",.99).put("contextQuote",quote).put("linkReason","同岗位考试后续结果，通知使用全称")
   val id=store.save("HR",text,2)
   store.analyzed(id,JSONObject().put("events",JSONArray().put(result)))
   assertEquals(1,store.schedules().length());assertTrue(store.schedules().getJSONObject(0).getBoolean("done"))
   assertEquals("linked",store.items().getJSONObject(0).getString("state"))
   val apps=workspace.list("application");assertFalse((0 until apps.length()).any{apps.getJSONObject(it).getJSONObject("data").optString("companyName")=="进度测试科技有限公司"})
  }finally{workspace.close()}
 }
 @Test fun provisionalEmailThenAssignedSmsAndCompletedReminder(){
  val text="测试自动化单位 工程师二面11月19日（周四）-11月20日（周五）其中半天，具体时间以后续正式通知为准，地点宁波。"
  val e=Event(company="测试自动化单位",role="工程师",stage="interview",round="二面",evidence=text,location="宁波")
  val id=store.save("HR",text,1,"email","notice-auto-1");analyze(id,e)
  assertEquals(1,store.schedules().length());val sid=store.schedules().getJSONObject(0).getLong("id")
  assertTrue(store.schedules().getJSONObject(0).getBoolean("preliminary"))
  val assigned="测试自动化单位 工程师二面2026年11月20日09:00至2026年11月20日10:00，地点宁波A楼301。"
  val fixed=e.copy(start="2026-11-20T09:00:00",end="2026-11-20T10:00:00",location="宁波A楼301",evidence=assigned)
  val sms=store.save("HR",assigned,2);analyze(sms,fixed)
  assertEquals(1,store.schedules().length());assertEquals(fixed.start,store.schedules().getJSONObject(0).getString("start"))
  store.complete(sid,true)
  val repeat=store.save("HR","提醒：$assigned",3);analyze(repeat,fixed);analyze(id,e)
  val result=store.schedules().getJSONObject(0);assertTrue(result.getBoolean("done"));assertEquals(fixed.start,result.getString("start"));assertEquals(3,result.getJSONArray("sources").length())
 }
 @Test fun correctionDoesNotCompleteTaskAndRepeatedDeadlinesMerge(){
  val text="材料测试单位 工程师 请于2026年11月19日14点前补充学历材料"
  val task=Event(company="材料测试单位",role="工程师",stage="other",kind="deadline",start="2026-11-19T14:00:00",end="2026-11-19T14:00:00",intent="task",evidence=text,round="补充学历材料")
  analyze(store.save("HR",text,1,"email","notice-task-1"),task)
  val correction="如您已提交补充资料，请耐心等待，无需再次补充资料。"
  analyze(store.save("HR",correction,2),task.copy(evidence=correction,start="",end=""))
  assertEquals(1,store.schedules().length());assertFalse(store.schedules().getJSONObject(0).getBoolean("done"))
  store.complete(store.schedules().getJSONObject(0).getLong("id"),true)
  analyze(store.save("HR","提醒：$text",3),task)
  assertEquals(1,store.schedules().length());assertTrue(store.schedules().getJSONObject(0).getBoolean("done"))
 }
}
