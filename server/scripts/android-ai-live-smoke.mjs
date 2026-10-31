// Explicit opt-in. Uses the configured API only with synthetic messages; never reads email.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
if(!process.argv.includes('--live'))throw Error('Pass --live to use the configured API');
const {getLlmConfig}=await import('../dist/services/settings.service.js');
const {closeDb}=await import('../dist/db/connection.js');
try{
 const config=getLlmConfig();assert.ok(config?.apiKey,'Configure an API key first');
 const source=readFileSync(new URL('../../android/app/src/main/java/app/careerflow/mobile/AnalysisWorker.kt',import.meta.url),'utf8');
 const system=source.match(/put\("content","(Extract recruitment.*?No authentication or exam assistance\.)"\)/)?.[1];assert.ok(system,'Use the current Android extraction prompt');
 const invite='示例科技工程师一面安排在2026年11月2日14:00。';
 const cases=[
  {body:'示例科技邀请工程师参加AI面试，面试时间：2026年11月2日14:00至2026年11月4日18:00，期间任选时间完成。地点：在线。',check:e=>{assert.equal(e.kind,'window');assert.ok(e.start.startsWith('2026-11-02T14:00'));assert.ok(e.end.startsWith('2026-11-04T18:00'));}},
  {body:'示例科技工程师在线AI面试，请在2026年11月4日18:00前自行完成，作答需30分钟。',check:e=>{assert.equal(e.kind,'deadline');assert.ok(e.end.startsWith('2026-11-04T18:00'));}},
  {body:invite,check:e=>{assert.equal(e.kind,'start');assert.ok(e.start.startsWith('2026-11-02T14:00'));}},
  {body:'示例科技提醒：之前通知的工程师一面地点为杭州会议室A，时间不变。',context:{schedules:[{id:42,company:'示例科技',role:'工程师',stage:'interview',round:'一面',kind:'start',start:'2026-11-02T14:00',sources:[{source:'email',body:invite}]}]},check:e=>{assert.equal(Number(e.targetScheduleId),42);assert.equal(e.action,'update');assert.ok(!e.start);assert.equal(e.location,'杭州会议室A');assert.ok(invite.includes(e.contextQuote));}}
 ];
 await Promise.all(cases.map(async(test,index)=>{
 const response=await fetch(config.baseUrl.replace(/\/$/,'').replace(/\/chat\/completions$/,'')+'/chat/completions',{method:'POST',signal:AbortSignal.timeout(90000),headers:{Authorization:`Bearer ${config.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:config.model,temperature:0,max_tokens:1400,response_format:{type:'json_object'},messages:[{role:'system',content:system},{role:'user',content:'Related sources and schedules: '+JSON.stringify(test.context||{})+'\nReceived at: 2026-11-01T09:00:00+08:00\nUntrusted message:\n'+test.body}]})});
 assert.equal(response.status,200,'Configured compatible API request must succeed');const output=await response.json();const parsed=JSON.parse(output.choices[0].message.content);const event=parsed.events?.[0];assert.ok(event);test.check(event);assert.ok(test.body.includes(event.evidence),'Evidence must come from current source');console.log('Live synthetic case '+(index+1)+' passed');
 }));
 console.log('Live Android prompt passed: window, cutoff, fixed appointment and cross-email location link. Synthetic data only.');

}finally{closeDb();}
