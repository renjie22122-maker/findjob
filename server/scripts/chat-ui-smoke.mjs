import assert from 'node:assert/strict';
import {chromium} from 'playwright';
process.env.FINDJOB_DB_PATH=':memory:';process.env.EMAIL_AUTO_ANALYZE='0';
const {createApp}=await import('../dist/index.js');const {closeDb}=await import('../dist/db/connection.js');
const server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});let turns=[],confirmed=false;
 await page.route('**/api/email/chat',async route=>{
  if(route.request().method()==='POST')turns=[{id:1,role:'user',content:route.request().postDataJSON().message,status:'message',plan:null},{id:2,role:'assistant',content:'两项信息需要一起核对；该面试已完成，可以完成其待办。',status:'proposed',plan:[{type:'complete-schedule',scheduleId:1,reason:'你已说明完成'}]}];
  await route.fulfill({json:turns});
 });
 await page.route('**/api/email/chat/2/confirm',async route=>{confirmed=true;turns[1].status='executed';await route.fulfill({json:turns});});
 await page.goto(`http://127.0.0.1:${server.address().port}/email`);
 await page.getByRole('textbox',{name:'给招聘助手发消息'}).fill('这场面试完成了，另一个还没完成');
 await page.getByRole('button',{name:'发送给助手'}).click();await page.getByText('两项信息需要一起核对；该面试已完成，可以完成其待办。').waitFor();
 assert.equal(confirmed,false);await page.getByRole('button',{name:'确认执行这份方案'}).click();await page.getByRole('button',{name:'已执行并记录'}).waitFor();assert.equal(confirmed,true);
 await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth+2);
 await page.screenshot({path:'server/data/ui-review/chat-mobile.png',fullPage:true,animations:'disabled'});
 console.log('Chat UI passed: natural message, proposal preview, explicit execution, mobile layout.');
}finally{await browser.close();await new Promise(r=>server.close(r));closeDb();}
