import assert from 'node:assert/strict';
process.env.FINDJOB_DB_PATH=':memory:';
const {renderInstructions}=await import('../dist/services/email/dynamicBrowser.js');
const {publicPageText}=await import('../dist/services/email/publicNoticePages.js');
const {attachEvidence}=await import('../dist/services/email/evidence.js');
const {applyEmailItem}=await import('../dist/services/email/email.service.js');
const {getDb,closeDb}=await import('../dist/db/connection.js');
const {PAGE_MARKER}=await import('../dist/services/email/publicNoticePages.js');
const calls=[];
const html='<html><body><main id="notice">加载说明</main><form action="/confirm"><button id="start">开始答题</button></form><script src="/app.js"></script></body></html>';
const script=`
fetch('/start').catch(()=>{});fetch('/confirm',{method:'POST'}).catch(()=>{});
fetch('/login?token=secret').catch(()=>{});fetch('https://outside.invalid/track').catch(()=>{});
try {new WebSocket('wss://outside.invalid/socket')} catch {}
try {document.querySelector('form').submit()} catch {}
document.querySelector('#start').onclick=()=>fetch('/begin');
fetch('/schedule.json').then(r=>r.json()).then(d=>{document.querySelector('#notice').textContent=d.text});`;
try{
 const result=await renderInstructions('https://fixture.invalid/instructions',html,async(url,kind)=>{
  calls.push({path:new URL(url).pathname,kind});
  if(url.endsWith('/app.js'))return {body:Buffer.from(script),contentType:'application/javascript'};
  if(url.endsWith('/schedule.json'))return {body:Buffer.from(JSON.stringify({text:'作答截止时间2099年11月8日17:00'})),contentType:'application/json'};
  throw Error('Unexpected resource');
 });
 assert.deepEqual(calls.map(c=>c.path).sort(),['/app.js','/schedule.json']);
 const text=publicPageText(result.html);assert.match(text,/2099年11月8日17:00/);assert.doesNotMatch(text,/开始答题/);
 const raw={messageId:'dynamic-test',subject:'笔试通知',sender:'HR',receivedAt:'2099-11-01',snippet:'样例公司笔试邀请'+PAGE_MARKER+text};
 const e=attachEvidence({company:'样例公司',positionTitle:'工程师',eventType:'written_test',eventTime:'2099-11-08T17:00:00',timeEvidence:'作答截止时间2099年11月8日17:00',confidence:1,summary:'笔试截止',schedule:{action:'create',timeKind:'deadline'}},raw);
 assert.equal(e.timeSource,'web');assert.deepEqual(e.reviewReasons,[]);
 const db=getDb(),id=Number(db.prepare("INSERT INTO email_items(message_id,subject,snippet,received_at,extracted,status,created_at) VALUES ('dynamic','考试',?,'2099-11-01',?,'pending','2099-11-01')").run(raw.snippet,JSON.stringify(e)).lastInsertRowid);
 applyEmailItem(id,undefined,{createIfMissing:true,markApplied:true});
 assert.ok(db.prepare("SELECT id FROM reminders WHERE scheduled_at='2099-11-08T17:00:00'").get());
 const auth=await renderInstructions('https://fixture.invalid/instructions','<body><input type="password"><p>截止2099年11月8日17:00</p></body>',async()=>{throw Error('No resources');});
 assert.throws(()=>publicPageText(auth.html));
 const {readDynamicInstructions}=await import('../dist/services/email/dynamicReader.js');
 const child=await readDynamicInstructions(new URL('https://fixture.invalid/instructions'),'<body><div id="t"></div><script>setTimeout(()=>document.querySelector("#t").textContent="作答截止2099年11月8日17:00",50)</script></body>');
 assert.match(child.html,/2099年11月8日17:00/);
 const started=Date.now();const hung=await readDynamicInstructions(new URL('https://fixture.invalid/instructions'),'<body><script>while(true){}</script></body>',1500);
 assert.equal(hung.html,'');assert.ok(Date.now()-started<6000,'hung renderer must be killed within its budget');
 console.log('Dynamic reader passed: actual isolated browser, dynamic JSON time, no action/auth/external requests, evidence validation and reminder creation.');
}finally{closeDb();}
