import {beforeEach,it,expect,vi} from 'vitest';
import {getDb,closeDb} from '../../db/connection.js';
import {processWorkQueue} from './queue.js';
const run=vi.hoisted(()=>vi.fn());
vi.mock('./engine.js',()=>({runWorkAnalysis:run}));
vi.mock('../settings.service.js',()=>({getLlmConfig:()=>({apiKey:'test'})}));
vi.mock('../email/check.service.js',()=>({checkExistingEmails:()=>({})}));
beforeEach(()=>{closeDb();getDb();run.mockReset();});
function seed(n=1){for(let i=1;i<=n;i++)getDb().prepare("INSERT INTO email_items(message_id,subject,snippet,received_at,extracted,status,created_at) VALUES (?,'通知','待办','2026-11-01','{}','pending','2026-11-01')").run(`queue-${i}`);}
it('内容指纹增量、每批有界，重启后不重复分析已处理通知',async()=>{
 seed(15);run.mockImplementation(async (_message:string,ids:number[])=>{for(const id of ids)getDb().prepare("UPDATE email_items SET status='confirmed' WHERE id=?").run(id);return {status:'applied'};});await processWorkQueue();expect(run.mock.calls[0][1]).toHaveLength(12);
 await processWorkQueue();expect(run.mock.calls[1][1]).toHaveLength(3);await processWorkQueue();expect(run).toHaveBeenCalledTimes(2);
 getDb().prepare("UPDATE email_items SET snippet='补充新时间' WHERE id=1").run();await processWorkQueue();expect(run.mock.calls[2][1]).toEqual([1]);
});
it('网络失败退避，busy不吞批次，新内容重新获得重试机会',async()=>{
 seed();run.mockResolvedValueOnce({status:'busy'});await processWorkQueue();expect(getDb().prepare('SELECT COUNT(*) n FROM work_scan').get()).toEqual({n:0});
 run.mockRejectedValue(new Error('offline'));await processWorkQueue();await processWorkQueue();expect(run).toHaveBeenCalledTimes(2);
 getDb().prepare("UPDATE work_scan SET attempts=3,next_attempt='2000-01-01'").run();await processWorkQueue();expect(run).toHaveBeenCalledTimes(2);
 getDb().prepare("UPDATE email_items SET snippet='新内容'").run();await processWorkQueue();expect(getDb().prepare('SELECT attempts FROM work_scan').get()).toEqual({attempts:1});
});
it('部分操作未应用时进入有限重试，不把失败当作已完成',async()=>{
 seed();run.mockResolvedValue({status:'pending'});await processWorkQueue();
 expect(getDb().prepare('SELECT attempts,error FROM work_scan').get()).toMatchObject({attempts:1,error:expect.any(String)});
 await processWorkQueue();expect(run).toHaveBeenCalledTimes(1);
});

it('空方案声称成功但通知仍待处理时，记录失败并把原因反馈给下一轮',async()=>{
 seed();run.mockResolvedValue({status:'applied'});await processWorkQueue();
 expect(getDb().prepare('SELECT error FROM work_scan').get()).toMatchObject({error:expect.stringContaining('仍待处理')});
 getDb().prepare("UPDATE work_scan SET next_attempt='2000-01-01'").run();await processWorkQueue();
 expect(run.mock.calls[1][0]).toContain('仍待处理');
});
it('同公司新证据到达后自动重新判断已经耗尽重试的通知',async()=>{
 seed();getDb().prepare(`UPDATE email_items SET extracted='{"company":"Example"}'`).run();run.mockResolvedValue({status:'pending'});await processWorkQueue();
 getDb().prepare("UPDATE work_scan SET attempts=3,next_attempt='2000-01-01'").run();await processWorkQueue();expect(run).toHaveBeenCalledTimes(1);
 getDb().prepare(`INSERT INTO email_items(message_id,subject,snippet,received_at,extracted,status,created_at) VALUES ('new-source','新通知','确认地点','2026-11-02','{"company":"Example"}','confirmed','2026-11-02')`).run();
 await processWorkQueue();expect(run.mock.calls[1][1]).toContain(1);expect(run.mock.calls[1][1]).toContain(2);
});
