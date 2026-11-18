import assert from 'node:assert/strict';
import {chromium} from 'playwright';
process.env.FINDJOB_DB_PATH=':memory:';
const {createApp}=await import('../dist/app.js');
const {closeDb}=await import('../dist/db/connection.js');
const server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date('2026-11-18T08:00:00Z'));
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 const plot=page.locator('.trend-chart .chart-plot');await plot.locator('canvas').waitFor();
 const earlier=page.waitForResponse(r=>r.url().includes('/api/stats/trends')&&r.url().includes('end=2026-08-20'));
 await page.getByRole('button',{name:'← 更早',exact:true}).click();assert.equal((await earlier).status(),200);
 await page.getByRole('button',{name:'回到今天',exact:true}).click();assert.equal(await page.getByLabel('时间轴结束日期').inputValue(),'2026-11-18');
 const box=await plot.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+100);await page.mouse.wheel(0,-500);
 await page.mouse.down();await page.mouse.move(box.x+box.width/2+100,box.y+100,{steps:8});await page.mouse.up();
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);console.log('Trend navigation passed: historical range fetch, today reset, wheel/drag handlers, narrow layout.');
}finally{await browser.close();await new Promise(r=>server.close(r));closeDb();}
