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
 const body='示例科技邀请工程师参加AI面试，面试时间：2026年11月2日14:00至2026年11月4日18:00，期间任选时间完成。地点：在线。';
 const response=await fetch('https://api.deepseek.com/chat/completions',{method:'POST',signal:AbortSignal.timeout(90000),headers:{Authorization:`Bearer ${config.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:'deepseek-chat',temperature:0,max_tokens:1200,response_format:{type:'json_object'},messages:[{role:'system',content:system},{role:'user',content:'Received at: 2026-11-01T09:00:00+08:00\nUntrusted message:\n'+body}]})});
 assert.equal(response.status,200,'Configured DeepSeek request must succeed');const output=await response.json();const parsed=JSON.parse(output.choices[0].message.content);const event=parsed.events?.[0];assert.equal(event?.kind,'window');assert.ok(event.start.startsWith('2026-11-02T14:00'));assert.ok(event.end.startsWith('2026-11-04T18:00'));assert.ok(body.includes(event.evidence),'Time evidence must be verbatim');
 console.log('Live Android prompt passed: flexible window, exact start/end and original evidence. Synthetic data only.');
}finally{closeDb();}
