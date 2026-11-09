import {beforeEach,it,expect,vi} from 'vitest';
const read=vi.hoisted(()=>vi.fn(async()=>''));
vi.mock('./publicNoticePages.js',async original=>({...await original<object>(),publicNoticeExcerpt:read}));
import {getDb,closeDb} from '../../db/connection.js';
import {applyEmailItem} from './email.service.js';
import {parseMailContent} from './mime.js';
beforeEach(()=>{closeDb();getDb();read.mockClear();});
it('原通知关联活动全部完成后，重解析不会再次访问其链接；其他通知仍正常处理',async()=>{
 const db=getDb(),extraction={company:'样例',positionTitle:'工程师',eventType:'written_test',eventTime:null,schedule:{action:'create',preliminary:true,awaitingReason:'external_time'},confidence:1,summary:'邀请'};
 const id=Number(db.prepare("INSERT INTO email_items(message_id,subject,snippet,received_at,extracted,status,created_at) VALUES ('<done@example.test>','考试','时间在链接说明中','2099-11-01',?,'pending','2099-11-01')").run(JSON.stringify(extraction)).lastInsertRowid);
 applyEmailItem(id,undefined,{createIfMissing:true,markApplied:true});
 db.prepare("UPDATE recruitment_schedules SET data=json_set(data,'$.completedAt','2099-11-02')").run();
 const raw=(messageId:string)=>Buffer.from(`Message-ID: ${messageId}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n作答截止时间见链接说明`);
 await parseMailContent(raw('<done@example.test>'));expect(read).not.toHaveBeenCalled();
 await parseMailContent(raw('<new@example.test>'));expect(read).toHaveBeenCalledTimes(1);
});
