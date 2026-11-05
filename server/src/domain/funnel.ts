import {STATUS} from './status.js';
export type FunnelStage='applied'|'interviewed'|'offer';
/** One membership definition for totals and drill-down; includes historical progression. */
export function funnelMembership(stage:FunnelStage){
 const states=stage==='interviewed'?[STATUS.WRITTEN_TEST,STATUS.INTERVIEW_1,STATUS.INTERVIEW_2,STATUS.INTERVIEW_3,STATUS.HR_INTERVIEW]:[STATUS.OFFER,STATUS.SIGNED];
 return {sql:`SELECT DISTINCT application_id FROM timeline_events WHERE event_type='status_change' AND ${stage==='applied'?'to_status IS NOT NULL AND to_status <> ?':`to_status IN (${states.map(()=>'?').join(',')})`}`,params:stage==='applied'?[STATUS.WISHLIST]:states};
}
