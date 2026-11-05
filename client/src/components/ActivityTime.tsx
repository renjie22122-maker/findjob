import {useLanguage} from '../i18n';
import {formatDateTime} from '../utils/constants';

type Timing={timeKind?:'start'|'deadline'|'window';eventTime?:string|null;eventTimeEnd?:string|null;timezone?:string|null};
/** Reminder delivery and activity attendance are deliberately displayed separately. */
export default function ActivityTime({data,status='scheduled',reminderAt,fallbackDeadline=false}:{data?:Timing;status?:string;reminderAt?:string;fallbackDeadline?:boolean}){
  const {t}=useLanguage();
  const window=data?.timeKind==='window',deadline=window||data?.timeKind==='deadline'||(!data&&fallbackDeadline);
  const inactive=status==='cancelled'||status==='awaiting_time';
  const primary=inactive?null:window?data?.eventTimeEnd:data?.eventTime??(!data?reminderAt:null);
  const end=!deadline&&!inactive?data?.eventTimeEnd:null;
  return <div className={`activity-time ${deadline?'is-deadline':'is-fixed'} ${inactive?'is-inactive':''}`}>
    <span className="activity-time-label">{inactive?t(status==='cancelled'?'已取消':'等待正式时间',status==='cancelled'?'Cancelled':'Awaiting confirmed time'):deadline?t('完成截止','Complete by'):data?t('固定场次','Scheduled session'):t('提醒时间','Reminder time')}</span>
    <strong className="activity-time-value">{primary?<><time dateTime={primary}>{formatDateTime(primary)}</time>{end&&end!==primary&&<> — <time dateTime={end}>{formatDateTime(end).slice(0,10)===formatDateTime(primary).slice(0,10)?formatDateTime(end).slice(11):formatDateTime(end)}</time></>}</>:t(window?'截止时间待确认':'时间待通知',window?'Deadline not confirmed':'Time not announced')}</strong>
    {window&&!inactive&&<span>{t('期限内自选时间完成','Complete at a time of your choice within the window')}{data?.eventTime&&<> · {t('开放','Opens')} {formatDateTime(data.eventTime)}</>}</span>}
    {data&&!deadline&&!inactive&&!end&&<span>{t('结束时间未提供','End time not provided')}</span>}
    {data?.timezone&&<span className="activity-time-zone">{data.timezone}</span>}
    {reminderAt&&data&&<span className="activity-time-reminder">{t('本条提醒时间','This reminder')}：{formatDateTime(reminderAt)}</span>}
  </div>;
}
