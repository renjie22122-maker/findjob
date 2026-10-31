import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),m=require('../../android/app/src/main/assets/mobile-model.js');
const fixed={id:1,company:'A',role:'R',start:'2026-11-01T14:00:00',end:'2026-11-01T16:00:00',kind:'start'};
const window={...fixed,id:2,kind:'window',start:'2026-10-30T08:00:00',end:'2026-11-02T00:00:00'};
const now=Date.parse('2026-11-01T09:00:00+08:00');
assert.equal(m.day(Date.parse('2026-10-31T17:00:00Z')),'2026-11-01');
assert.equal(m.onDay(window,'2026-11-01'),true);
assert.equal(m.onDay(fixed,'2026-11-02'),false);
assert.equal(m.month('2028-02').length,42);
assert.ok(m.month('2028-02').includes('2028-02-29'));
assert.deepEqual(m.tasks([window,fixed],'upcoming','',now).map(s=>s.id),[1,2]);
assert.equal(m.tasks([{...fixed,done:true},fixed],'done','',now).length,1);
assert.equal(m.tasks([fixed],'upcoming','missing',now).length,0);
assert.equal(m.tasks([fixed],'overdue','',Date.parse('2026-11-01T17:00:00+08:00')).length,1);
console.log('Mobile model passed: Beijing dates, month boundaries, windows, sorting, completion and search.');

assert.equal(m.tasks([fixed],'upcoming','',Date.parse('2026-11-01T15:00:00+08:00')).length,1);
