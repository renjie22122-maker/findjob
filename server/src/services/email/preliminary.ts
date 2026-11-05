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

/** Explicitly unassigned appointment: a booking range is not a self-service activity window. */
export function awaitingAppointment(text:string,receivedAt:string) {
 const compact=text.replace(/\s+/g,'');
 const condition=compact.match(/(?:具体|实际)(?:面试|考试|笔试)?时间(?:以.{0,20}预约.{0,12}为准|待预约|另行通知)|(?:面试|考试|笔试)时间(?:待预约|另行通知)/);
 if(!condition)return null;
 const m=compact.match(/(?:(20\d{2})年)?(\d{1,2})月(\d{1,2})日?[-—–至](?:(20\d{2})年)?(?:(\d{1,2})月)?(\d{1,2})日/);
 if(!m)return {preliminary:true as const,evidence:condition[0]};
 const start=`${m[1]??receivedAt.slice(0,4)}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
 const end=`${m[4]??m[1]??receivedAt.slice(0,4)}-${(m[5]??m[2]).padStart(2,'0')}-${m[6].padStart(2,'0')}`;
 if(!validEventTime(`${start}T00:00:00`)||!validEventTime(`${end}T00:00:00`)||end<start)return null;
 return {preliminary:true as const,dateStart:start,dateEnd:end,evidence:condition[0]};
}
