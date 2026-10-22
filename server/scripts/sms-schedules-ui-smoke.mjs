import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
process.env.FINDJOB_DB_PATH=':memory:';
const {createApp}=await import('../dist/index.js');
const {getDb,closeDb}=await import('../dist/db/connection.js');
const {applyEmailItem}=await import('../dist/services/email/email.service.js');
const {shareScheduleReminders,trackPreliminaryStages}=await import('../dist/services/email/schedules.service.js');
const db=getDb();
for(let i=1;i<=3;i++){
 const e={company:`日程示例${i}`,positionTitle:'工程师',eventType:'written_test',eventTime:'2099-10-25T14:00:00',eventTimeEnd:'2099-10-25T16:00:00',confidence:.95,timeSource:'body',timeEvidence:'2099年10月25日14:00-16:00',summary:'考试'};
 const id=Number(db.prepare("INSERT INTO email_items(message_id,subject,sender,snippet,received_at,extracted,status,created_at) VALUES (?,'笔试邀请','HR','考试时间2099年10月25日14:00-16:00','2099-10-20T08:00:00Z',?,'pending','2099-10-20')").run(`sms-ui-${i}`,JSON.stringify(e)).lastInsertRowid);
 applyEmailItem(id,undefined,{createIfMissing:true});
}
shareScheduleReminders(3,1);
trackPreliminaryStages(1,1,'2099-10-20T08:00:00Z','初面为AI面试形式。将于10月30-31日开展。正式时间另行通知。');
const server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:'msedge',headless:true});const out=fileURLToPath(new URL('../data/ui-review/',import.meta.url));mkdirSync(out,{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url+'/email');await page.getByLabel('短信正文',{exact:true}).fill('您的快递已经到达驿站');await page.getByRole('button',{name:'导入并分析短信'}).click();await page.getByText('已过滤非招聘短信，未存储或发送给模型',{exact:true}).first().waitFor();
 assert.equal(db.prepare('SELECT COUNT(*) n FROM email_items').get().n,3);
 await page.goto(url+'/schedules');await page.getByText('AI初面：2099-10-30 至 2099-10-31，等待正式时间',{exact:true}).waitFor();
 assert.equal(await page.locator('.ant-alert-error').count(),3);
 await page.getByText('已确认共用日程 #1 的活动提醒；本申请独立保留',{exact:true}).waitFor();
 await page.getByRole('button',{name:'等待正式时间 1 查看日程 →'}).click();assert.equal(await page.locator('.schedule-card').count(),1);
 await page.getByRole('button',{name:'时间冲突 3 查看日程 →'}).click();assert.equal(await page.locator('.schedule-card').count(),3);
 await page.getByRole('button',{name:'全部日程 4 查看日程 →'}).click();assert.equal(await page.locator('.schedule-card').count(),4);
 await page.locator('.ant-select').filter({has:page.getByRole('combobox',{name:'界面主题'})}).click();await page.getByText('☾ 暗色',{exact:true}).click();await page.keyboard.press('Escape');await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
 await page.screenshot({path:out+'sms-conflicts-dark.png',fullPage:true,animations:'disabled'});
 await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth+2);await page.screenshot({path:out+'sms-conflicts-mobile.png',fullPage:true,animations:'disabled'});
 assert.deepEqual(errors,[]);console.log('SMS and schedules UI passed: filtering, red conflicts, preliminary stage, shared reminders, dark/mobile.');
}finally{await browser.close();await new Promise(r=>server.close(r));closeDb();}
