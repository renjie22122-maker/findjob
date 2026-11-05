import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
process.env.FINDJOB_DB_PATH=':memory:';
const {createApp}=await import('../dist/app.js');
const {closeDb}=await import('../dist/db/connection.js');
const server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const common={applicationId:1,companyName:'示例公司',positionTitle:'工程师',type:'written_test',done:0,doneAt:null,createdAt:'2099-11-01',scheduledAt:'2099-11-05T09:00:00'};
 const activity={id:1,kind:'written_test',status:'scheduled',timeKind:'start',eventTime:'2099-11-06T09:00:00',eventTimeEnd:'2099-11-06T11:00:00',timezone:'Asia/Shanghai',venue:'第一考场'};
 await page.route('**/api/stats/today',route=>route.fulfill({json:{date:'2099-11-05',overdue:[],upcoming:[],today:[{...common,id:1,title:'提前一天准备：笔试',activity},{...common,id:2,title:'AI 面试',activity:{...activity,id:2,timeKind:'window',eventTimeEnd:'2099-11-08T17:00:00'}}]}}));
 await page.goto(`http://127.0.0.1:${server.address().port}/today`);
 const fixed=page.locator('.reminder-card').first(),window=page.locator('.reminder-card').nth(1);
 await fixed.locator('.activity-time-value').waitFor();assert.equal(await fixed.locator('.entity-title').innerText(),'示例公司');assert.equal(await fixed.locator('.entity-subtitle').innerText(),'工程师');assert.match(await fixed.locator('.task-purpose').innerText(),/提前一天准备/);
 assert.equal(await fixed.locator('.activity-time-value').innerText(),'2099-11-06 09:00 — 11:00');
 assert.equal(await window.locator('.activity-time-value').innerText(),'2099-11-08 17:00');
 assert.match(await window.innerText(),/期限内自选时间完成/);
 assert.match(await fixed.locator('.activity-time-reminder').innerText(),/2099-11-05 09:00/);
 mkdirSync('server/data/ui-review',{recursive:true});await page.screenshot({path:'server/data/ui-review/time-priority.png',fullPage:true});
 await page.locator('.ant-select').filter({has:page.getByRole('combobox',{name:'界面主题'})}).click();await page.getByText('☾ 暗色',{exact:true}).click();await page.keyboard.press('Escape');
 await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth+2);
 await page.screenshot({path:'server/data/ui-review/time-priority-mobile.png',fullPage:true});assert.deepEqual(errors,[]);
 console.log('Time UI passed: exact interval, flexible deadline, separate advance reminder, location, dark/mobile containment.');
}finally{await browser.close();await new Promise(r=>server.close(r));closeDb();}
