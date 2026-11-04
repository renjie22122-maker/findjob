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
 seed(15);run.mockResolvedValue({status:'applied'});await processWorkQueue();expect(run.mock.calls[0][1]).toHaveLength(12);
 await processWorkQueue();expect(run.mock.calls[1][1]).toHaveLength(3);await processWorkQueue();expect(run).toHaveBeenCalledTimes(2);
 getDb().prepare("UPDATE email_items SET snippet='补充新时间' WHERE id=1").run();await processWorkQueue();expect(run.mock.calls[2][1]).toEqual([1]);
});
it('网络失败退避，busy不吞批次，新内容重新获得重试机会',async()=>{
 seed();run.mockResolvedValueOnce({status:'busy'});await processWorkQueue();expect(getDb().prepare('SELECT COUNT(*) n FROM work_scan').get()).toEqual({n:0});
 run.mockRejectedValue(new Error('offline'));await processWorkQueue();await processWorkQueue();expect(run).toHaveBeenCalledTimes(2);
 getDb().prepare("UPDATE work_scan SET attempts=3,next_attempt='2000-01-01'").run();await processWorkQueue();expect(run).toHaveBeenCalledTimes(2);
 getDb().prepare("UPDATE email_items SET snippet='新内容'").run();await processWorkQueue();expect(getDb().prepare('SELECT attempts FROM work_scan').get()).toEqual({attempts:1});
});
