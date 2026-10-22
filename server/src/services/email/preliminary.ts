import {validEventTime} from './eventTime.js';

/** Separate dated stages from a pre-notice; never invent midnight as an activity time. */
export function preliminaryInterview(body:string,receivedAt:string) {
  const matches=[...body.matchAll(/(?:初面|面试)为([^。\n]{0,30})形式[。\s]*将于(?:(20\d{2})年)?(\d{1,2})月(\d{1,2})[-—至](\d{1,2})日[^。\n]*开展/g)];
  if(matches.length!==1)return null;
  const m=matches[0],year=m[2]??receivedAt.slice(0,4),month=m[3].padStart(2,'0');
  const start=`${year}-${month}-${m[4].padStart(2,'0')}`,end=`${year}-${month}-${m[5].padStart(2,'0')}`;
  if(!validEventTime(`${start}T00:00:00`) || !validEventTime(`${end}T00:00:00`) || end<start)return null;
  return {preliminary:true,dateStart:start,dateEnd:end,stageLabel:/AI/.test(m[1])?'AI初面':'面试',mode:'online',evidence:m[0],attendanceCondition:body.match(/如您已经[^。\n]+(?:不再安排|无需)[^。\n]+/)?.[0]??null};
}
