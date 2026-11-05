import {beforeEach,it,expect} from 'vitest';
import {closeDb,getDb} from '../db/connection.js';
import {createCompany} from './companies.service.js';
import {createApplication,listApplications,transitionApplication} from './applications.service.js';
import {getOverview} from './stats.service.js';
beforeEach(()=>{closeDb();getDb();});
it('funnel details share counts and retain progressed/rejected applications without duplicates',()=>{
 const c=createCompany({name:'测试机构'});
 const a=createApplication({companyId:c.id,positionTitle:'曾面试',status:'APPLIED'});
 transitionApplication(a.id,{toStatus:'INTERVIEW_1'});transitionApplication(a.id,{toStatus:'REJECTED'});
 const b=createApplication({companyId:c.id,positionTitle:'已签约',status:'OFFER'});transitionApplication(b.id,{toStatus:'SIGNED'});
 createApplication({companyId:c.id,positionTitle:'待投递'});
 const stats=getOverview();
 for(const stage of ['applied','interviewed','offer'] as const){const result=listApplications({funnelStage:stage,pageSize:1});expect(result.total).toBe(stats.funnel[stage]);expect(new Set(listApplications({funnelStage:stage}).items.map(r=>r.id)).size).toBe(result.total);}
 expect(listApplications({funnelStage:'interviewed'}).items.map(r=>r.id)).toContain(a.id);
 expect(listApplications({statuses:['INTERVIEW_1']}).total).toBe(0);
 for(const [status,count] of Object.entries(stats.byStatus))expect(listApplications({statuses:[status as 'APPLIED']}).total).toBe(count);
});
