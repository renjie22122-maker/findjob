import {beforeEach,it,expect,vi} from 'vitest';
import {getDb,closeDb} from '../../db/connection.js';
import {recordStrategyOutcome,strategyLibrary,bootstrapStrategyLibrary} from './strategies.js';
import {searchWorkSources} from './search.js';
import {workPlanSchema} from './schema.js';
const model=vi.hoisted(()=>vi.fn());
vi.mock('../llm/llm.client.js',async original=>({...await original<object>(),chatJson:model}));
beforeEach(()=>{closeDb();getDb();model.mockReset();});
const learning={key:'booking-required',revision:0,title:'需预约的活动',signals:['具体时间待预约'],approach:'保存日期范围和地点，独立建立预约截止待办；正式通知后补齐时间。'};
const plan=()=>workPlanSchema.parse({reply:'核对',actions:[],learning:[learning]});
function seedAudit(){getDb().prepare("INSERT INTO work_decisions(id,fingerprint,input,plan,result,status,created_at) VALUES ('seed','hash','核对','{}',?,'applied','2026-11-01')").run(JSON.stringify([{type:'apply-notice',extraction:{eventType:'progress',summary:'已通过考试'}}]));}
it('历史初始化只学习一次，不重复请求或改写业务数据',async()=>{
 seedAudit();model.mockResolvedValue({learning:[learning]});
 await bootstrapStrategyLibrary();await bootstrapStrategyLibrary();
 expect(model).toHaveBeenCalledTimes(1);expect(strategyLibrary()).toHaveLength(1);
 expect(getDb().prepare('SELECT COUNT(*) n FROM email_items').get()).toEqual({n:0});
 expect(getDb().prepare('SELECT COUNT(*) n FROM work_decisions').get()).toEqual({n:1});
});
it('历史初始化失败后至少一天才重试，避免空闲轮询反复消耗API',async()=>{
 seedAudit();model.mockRejectedValue(new Error('provider unavailable'));
 await bootstrapStrategyLibrary();await bootstrapStrategyLibrary();
 expect(model).toHaveBeenCalledTimes(1);expect(strategyLibrary()).toHaveLength(0);
});
it('成功分类版本化；失败不学习新方法；重复结果不重复计数',()=>{
 recordStrategyOutcome(plan(),'failed',false);expect(strategyLibrary()).toHaveLength(0);
 recordStrategyOutcome(plan(),'one',true);recordStrategyOutcome(plan(),'one',true);
 expect(strategyLibrary()[0]).toMatchObject({revision:1,successes:1,state:'trial'});
 recordStrategyOutcome({...plan(),learning:[],usedStrategies:['booking-required']},'two',true);
 expect(strategyLibrary()[0]).toMatchObject({successes:2,state:'supported'});
 recordStrategyOutcome({...plan(),learning:[],usedStrategies:['booking-required']},'three',false);
 expect(strategyLibrary()[0]).toMatchObject({failures:1,state:'needs_revision'});
 recordStrategyOutcome({...plan(),learning:[{...learning,revision:1,approach:'根据原文区分预约与自由作答，分别保留截止和活动时间。'}]},'four',true);
 expect(strategyLibrary()[0]).toMatchObject({revision:2,successes:1,failures:0,state:'trial'});
 expect(getDb().prepare('SELECT COUNT(*) n FROM work_strategy_history WHERE outcome=?').get('revision')).toEqual({n:2});
});
it('本地检索转义通配符，原文返回前脱敏',()=>{
 const d=getDb();d.prepare("INSERT INTO email_items(message_id,subject,snippet,received_at,status,created_at) VALUES ('1','完成率100%','验证码：123456 https://example.test/?token=secret','2026-11-01','pending','2026-11-01')").run();
 expect(searchWorkSources('100%').total).toBe(1);expect(searchWorkSources('不存在%').total).toBe(0);
 const result=JSON.stringify(searchWorkSources('100%'));expect(result).not.toContain('123456');expect(result).not.toContain('token=secret');
});
