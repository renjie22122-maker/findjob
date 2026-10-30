import {beforeEach,it,expect,vi} from 'vitest';
import {getDb,closeDb} from '../../db/connection.js';
import {askRecruitmentAssistant,executeChatPlan,chatHistory} from './chat.service.js';
import {applyEmailItem} from './email.service.js';
const model=vi.hoisted(()=>vi.fn());vi.mock('../llm/llm.client.js',()=>({chatCompletion:model}));
beforeEach(()=>{closeDb();getDb();model.mockReset();});
function seed(){const db=getDb(),e={company:'样例',positionTitle:'工程师',eventType:'interview',eventTime:'2099-12-20T14:00:00',timeSource:'body',confidence:.95};
 const id=Number(db.prepare("INSERT INTO email_items(message_id,subject,snippet,received_at,extracted,status,created_at) VALUES ('chat-seed','面试','2099-12-20 14:00','2099-12-01',?,'pending','2099-12-01')").run(JSON.stringify(e)).lastInsertRowid);applyEmailItem(id,undefined,{createIfMissing:true});
 return (db.prepare('SELECT id FROM recruitment_schedules').get() as {id:number}).id;}
it('对话只生成方案，确认后完成提醒并记录，不能重复执行',async()=>{
 const scheduleId=seed();model.mockResolvedValue(JSON.stringify({reply:'要把这场面试的待办标为完成吗？',actions:[{type:'complete-schedule',scheduleId,reason:'用户说已完成面试'}]}));
 const turns=await askRecruitmentAssistant('这场面试已经完成');const plan=turns.at(-1)!;
 expect(getDb().prepare('SELECT COUNT(*) n FROM reminders WHERE done=0').get()).toEqual({n:2});
 executeChatPlan(plan.id);expect(getDb().prepare('SELECT COUNT(*) n FROM reminders WHERE done=0').get()).toEqual({n:0});
 expect(()=>executeChatPlan(plan.id)).toThrow();expect(getDb().prepare('SELECT COUNT(*) n FROM email_check_changes').get()).toEqual({n:1});
});
it('连续对话带上下文，修订方案使旧方案失效',async()=>{
 const scheduleId=seed();model.mockResolvedValue(JSON.stringify({reply:'准备完成',actions:[{type:'complete-schedule',scheduleId,reason:'完成'}]}));
 const first=(await askRecruitmentAssistant('完成这个面试')).at(-1)!;
 model.mockResolvedValue(JSON.stringify({reply:'好的，暂不修改',actions:[]}));await askRecruitmentAssistant('先别改');
 expect(()=>executeChatPlan(first.id)).toThrow();expect(JSON.stringify(model.mock.calls[1][0])).toContain('完成这个面试');expect(chatHistory()).toHaveLength(4);
});
it('数据变化拒绝旧方案；未知操作和批量中不存在的日程不会部分写入',async()=>{
 const scheduleId=seed();model.mockResolvedValue(JSON.stringify({reply:'方案',actions:[{type:'complete-schedule',scheduleId,reason:'完成'},{type:'complete-schedule',scheduleId:999,reason:'完成'}]}));
 const p=(await askRecruitmentAssistant('完成这些')).at(-1)!;expect(()=>executeChatPlan(p.id)).toThrow();expect(getDb().prepare('SELECT COUNT(*) n FROM reminders WHERE done=0').get()).toEqual({n:2});
 getDb().prepare('UPDATE reminders SET done=1 WHERE id=(SELECT MIN(id) FROM reminders)').run();expect(()=>executeChatPlan(p.id)).toThrow('已有变化');
 model.mockResolvedValue('{"reply":"执行","actions":[{"type":"open-url","url":"https://example.test"}]}');await expect(askRecruitmentAssistant('继续')).rejects.toThrow();
});
