import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../../client/src/utils/scheduleConflicts.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {schedulesConflict}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const describe=(_name,run)=>run();
const it=(name,run)=>{run();console.log('PASS '+name);};
const expect=value=>({toBe:expected=>assert.equal(value,expected)});

function event(id,data) {
  return {id,applicationId:id,companyName:'示例',positionTitle:'工程师',kind:'written_test',status:'scheduled',revision:1,sources:[],data};
}
const fixed={timeKind:'start',eventTime:'2026-10-25T14:00:00',eventTimeEnd:'2026-10-25T16:00:00'};
describe('固定场次与灵活窗口的冲突语义',()=>{
  it('只把重叠固定场次标为冲突，首尾相接不冲突',()=>{
    expect(schedulesConflict(event(1,fixed),event(2,{...fixed,eventTime:'2026-10-25T15:00:00'}))).toBe(true);
    expect(schedulesConflict(event(1,fixed),event(2,{...fixed,eventTime:'2026-10-25T16:00:00',eventTimeEnd:'2026-10-25T17:00:00'}))).toBe(false);
  });
  it('几天内任选时间的测评、AI面试和截止事项不占用整个窗口',()=>{
    for(const kind of ['window','deadline']){
      const flexible=event(2,{timeKind:kind,eventTime:'2026-10-24T14:00:00',eventTimeEnd:'2026-10-27T16:00:00'});
      expect(schedulesConflict(event(1,fixed),flexible)).toBe(false);
      expect(schedulesConflict(flexible,event(1,fixed))).toBe(false);
      expect(schedulesConflict(flexible,event(3,{...flexible.data}))).toBe(false);
    }
  });
  it('共用同一场次不冲突，改到不同时段后重新判断',()=>{
    expect(schedulesConflict(event(1,fixed),event(2,{...fixed,sharedWithScheduleId:1}))).toBe(false);
    expect(schedulesConflict(event(1,fixed),event(2,{...fixed,eventTime:'2026-10-25T15:00:00',sharedWithScheduleId:1}))).toBe(true);
  });
  it('支持时区和仅开始时刻，拒绝无效时间及取消日程',()=>{
    expect(schedulesConflict(event(1,{eventTime:'2026-10-25T14:00:00+08:00'}),event(2,{eventTime:'2026-10-25T06:00:00Z'}))).toBe(true);
    expect(schedulesConflict(event(1,fixed),event(2,{eventTime:'invalid'}))).toBe(false);
    expect(schedulesConflict(event(1,fixed),{...event(2,fixed),status:'cancelled'})).toBe(false);
  });
});
