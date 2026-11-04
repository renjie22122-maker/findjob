import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
process.env.FINDJOB_DB_PATH=':memory:';
const {createApp}=await import('../dist/app.js');const {getDb,closeDb}=await import('../dist/db/connection.js');
const {applyEmailItem}=await import('../dist/services/email/email.service.js');
const db=getDb();
const body='示例集团统一笔试，2099年11月5日09:00至11:00，多个岗位只需考一次。';
for(const [i,role] of ['软件工程师','数据分析师'].entries()){
 const e={company:'示例集团',positionTitle:role,eventType:'written_test',eventTime:'2099-11-05T09:00:00',eventTimeEnd:'2099-11-05T11:00:00',timeEvidence:'2099年11月5日09:00',timeSource:'body',confidence:.98};
 const id=Number(db.prepare("INSERT INTO email_items(message_id,subject,snippet,received_at,extracted,status,created_at) VALUES (?, ?,?,'2099-11-01',?,'pending','2099-11-01')").run('graph-'+i,role+'统考通知',body,JSON.stringify(e)).lastInsertRowid);
 applyEmailItem(id,undefined,{createIfMissing:true});
}
const server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:920}});let request;
 await page.route('**/api/work/analyze',async route=>{request=route.request().postDataJSON();await route.fulfill({json:{status:'applied',results:[]}});});
 await page.goto(`http://127.0.0.1:${server.address().port}/assistant`);
 await page.getByText('关联图',{exact:true}).click();
 await page.getByRole('img',{name:'公司岗位事项通知关联图'}).waitFor();
 await page.getByRole('button',{name:'软件工程师',exact:true}).click();await page.getByRole('button',{name:'让 AI 核对此项'}).click();
 assert.match(await page.getByRole('textbox',{name:'进度助手请求'}).inputValue(),/application:/);
 await page.getByRole('button',{name:'交给 AI 处理'}).click();await page.waitForFunction(()=>document.body.textContent.includes('核对完成'));assert.match(request.message,/软件工程师/);
 await page.getByText('关联图',{exact:true}).click();
 await page.getByRole('tab',{name:'关联列表',exact:true}).click();await page.getByRole('button',{name:'软件工程师',exact:true}).waitFor();
 await page.getByRole('tab',{name:'关系图',exact:true}).click();
 mkdirSync('server/data/ui-review',{recursive:true});
 await page.locator('.progress-hub').screenshot({path:'server/data/ui-review/work-hub.png'});
 await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth+2);
 console.log('Work UI passed: graph/list, node detail, contextual chat, auto-action request, mobile containment.');
}finally{await browser.close();await new Promise(r=>server.close(r));closeDb();}
