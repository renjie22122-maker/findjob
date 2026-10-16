import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
process.env.FINDJOB_DB_PATH=':memory:';process.env.EMAIL_AUTO_ANALYZE='0';
const {createApp}=await import('../dist/index.js');
const {getDb,closeDb}=await import('../dist/db/connection.js');
const {applyEmailItem}=await import('../dist/services/email/email.service.js');
const server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const base=`http://127.0.0.1:${server.address().port}`,db=getDb();
const e={company:'核查测试企业',positionTitle:'工程师',recruitmentId:'J-101',eventType:'interview',eventTime:'2099-10-18T09:00:00',timeSource:'body',timeEvidence:'2099-10-18 09:00',confidence:0.95,summary:'邀请',schedule:{action:'create'}};
for(let i=1;i<=2;i++){
 const mail={...e,positionTitle:i===1?'工程师':'工程师（项目名）'};
 const id=Number(db.prepare("INSERT INTO email_items(message_id,subject,sender,received_at,snippet,extracted,status,created_at) VALUES (?,'面试通知','HR','2026-10-01T08:00:00Z','面试时间：2099-10-18 09:00',?,'pending','2026-10-01')").run(`audit-ui-${i}`,JSON.stringify(mail)).lastInsertRowid);
 applyEmailItem(id,undefined,{createIfMissing:true,targetApplicationId:null,targetScheduleId:null});
}
db.prepare('UPDATE reminders SET done=1,done_at=? WHERE id=1').run('2026-10-16');db.prepare('DELETE FROM reminders WHERE id=2').run();
const browser=await chromium.launch({channel:'msedge',headless:true});const out=fileURLToPath(new URL('../data/ui-review/',import.meta.url));mkdirSync(out,{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/email');await page.getByRole('button',{name:'一键检查已有邮件'}).click();await page.getByText('可能重复的申请 #1 / #2',{exact:true}).waitFor();
 assert.equal(db.prepare('SELECT COUNT(*) n FROM reminders WHERE done=1').get().n,1);
 await page.getByRole('button',{name:'核对并处理'}).click();await page.getByText('核对本次修复',{exact:true}).waitFor();
 const result=page.waitForResponse(r=>r.url().endsWith('/check/resolve'));await page.getByRole('button',{name:'确 定',exact:true}).click();assert.equal((await result).status(),200);
 await page.getByText('可能重复的日程 #1 / #2',{exact:true}).waitFor();await page.getByRole('button',{name:'核对并处理'}).click();
 const merged=page.waitForResponse(r=>r.url().endsWith('/check/resolve'));await page.getByRole('button',{name:'确 定',exact:true}).click();assert.equal((await merged).status(),200);
 await page.getByText('暂无待确认问题。已完成状态与手工提醒受到保护。',{exact:true}).waitFor();
 const stable=db.prepare('SELECT * FROM reminders ORDER BY id').all();await page.getByRole('button',{name:'一键检查已有邮件'}).click();await page.waitForResponse(r=>r.url().endsWith('/check')&&r.request().method()==='GET');assert.deepEqual(db.prepare('SELECT * FROM reminders ORDER BY id').all(),stable);
 await page.getByText(/检查与修复记录（最近/).click();await page.getByText(/用户确认：可能重复的申请/).first().waitFor();
 await page.locator('.ant-select').filter({has:page.getByRole('combobox',{name:'界面主题'})}).click();await page.getByText('☾ 暗色',{exact:true}).click();await page.keyboard.press('Escape');await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');await page.screenshot({path:out+'email-check-dark.png',fullPage:true,animations:'disabled'});
 await page.setViewportSize({width:390,height:844});await page.goto(base+'/email');await page.getByRole('button',{name:'一键检查已有邮件'}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);await page.screenshot({path:out+'email-check-mobile.png',fullPage:true,animations:'disabled'});
 assert.deepEqual(errors,[]);console.log('Email check UI passed: repair, application merge, schedule merge, history, repeat, completed state, dark/mobile.');
}finally{await browser.close();await new Promise(r=>server.close(r));closeDb();}
