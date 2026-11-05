import ActivityTime from '../components/ActivityTime';
import {translate, useLanguage} from '../i18n';
import dayjs from 'dayjs';
import {schedulesConflict} from '../utils/scheduleConflicts';
import type { RecruitmentSchedule } from '../types';
import { useState } from 'react';
import { Alert, Button, Card, Drawer, Collapse, Empty, Input, Segmented, Space, Tag, Typography, Modal, Form, Select, DatePicker, message } from 'antd';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { emailApi } from '../api';
import {http} from '../api/http';
import { formatDateTime, EMAIL_EVENT_LABELS } from '../utils/constants';

const actions: Record<string,string> = {supplement:'补充短信来源',share:'确认共用提醒',create:'首次安排',update:'补充信息',reschedule:'改期',cancel:'取消',restore:'恢复',legacy:'历史邮件接入',stale:'旧邮件留档（未覆盖当前日程）'};
export default function Schedules() {
  useLanguage();

  const [detail,setDetail]=useState<RecruitmentSchedule|null>(null);
  const [editing,setEditing]=useState<RecruitmentSchedule|null>(null);
  const [sharing,setSharing]=useState<RecruitmentSchedule|null>(null),[shareTarget,setShareTarget]=useState<number>();
  const [form]=Form.useForm();const queryClient=useQueryClient();
  const share=useMutation({mutationFn:()=>http.post(`/email/schedules/${sharing!.id}/share`,{targetId:shareTarget}),onSuccess:()=>{setSharing(null);void queryClient.invalidateQueries();message.success('共用提醒关系已记录，申请与来源仍独立保留');},onError:e=>message.error(e.message)});
  const mutation=useMutation({mutationFn:async()=>{
    const v=await form.validateFields();
    return emailApi.updateSchedule(editing!.id,{revision:editing!.revision,schedule:{action:v.action,timeKind:v.timeKind,mode:v.mode,venue:v.venue || null,address:v.address || null,room:v.room || null,evidence:'用户在日程页面人工确认'},eventTime:v.time?.format('YYYY-MM-DDTHH:mm:ss') ?? null,eventTimeEnd:v.end?.format('YYYY-MM-DDTHH:mm:ss') ?? null});
  },onSuccess:()=>{setEditing(null);void queryClient.invalidateQueries();message.success('日程和本场自动提醒已更新');},onError:e=>message.error(e instanceof Error?e.message:'更新失败')});
  const [filter,setFilter] = useState('active');
  const [search,setSearch] = useState('');
  const {data,isLoading,error,refetch} = useQuery({queryKey:['schedules'],queryFn:()=>emailApi.schedules(),refetchInterval:30000});
  const conflicts=(s:RecruitmentSchedule)=>(data?.items??[]).filter(other=>new Date(s.data.eventTimeEnd??s.data.eventTime??'').getTime()>=Date.now() && new Date(other.data.eventTimeEnd??other.data.eventTime??'').getTime()>=Date.now() && schedulesConflict(s,other));
  const rows = (data?.items ?? []).filter(s => (filter === 'all' || (filter === 'conflicts' ? conflicts(s).length > 0 : filter === 'awaiting' ? s.status === 'awaiting_time' : filter === 'cancelled' ? s.status === 'cancelled' : s.status !== 'cancelled' && (s.status==='awaiting_time' || !s.data.eventTime || new Date(s.data.eventTimeEnd??s.data.eventTime).getTime()>=Date.now()))) && `${s.companyName} ${s.positionTitle} ${s.data.venue ?? ''} ${s.data.round ?? ''} ${s.data.address ?? ''} ${s.data.room ?? ''}`.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>(a.data.timeKind==='window'?a.data.eventTimeEnd??'9999':a.data.eventTime??'9999').localeCompare(b.data.timeKind==='window'?b.data.eventTimeEnd??'9999':b.data.eventTime??'9999'));
  return <Space direction="vertical" size={16} style={{width:'100%'}}>
    <Card className="schedule-overview" title={translate("招聘日程")} extra={<Button onClick={()=>void refetch()}>{translate("刷新")}</Button>}>
      <Typography.Paragraph type="secondary">{translate("先看时间和地点；来源、准备事项与调整操作在详情中。")}</Typography.Paragraph>
      <div className="schedule-metrics" aria-label={translate("日程概览")}>
        {[{label:translate("全部日程"),value:'all',count:data?.items.length??0},{label:translate("时间冲突"),value:'conflicts',count:(data?.items??[]).filter(s=>conflicts(s).length>0).length},{label:translate("等待正式时间"),value:'awaiting',count:(data?.items??[]).filter(s=>s.status==='awaiting_time').length}].map(metric=><button key={metric.value} className={`schedule-metric ${metric.value==='conflicts'&&metric.count?'is-danger':''}`} aria-pressed={filter===metric.value} onClick={()=>setFilter(metric.value)}><span>{metric.label}</span><strong>{metric.count}</strong><span>{translate("查看日程 →")}</span></button>)}
      </div>
      <Space wrap><Segmented value={filter} onChange={setFilter} options={[{value:'active',label:translate("待进行")},{value:'cancelled',label:translate("已取消")},{value:'all',label:translate("全部")},{value:'conflicts',label:translate("冲突")},{value:'awaiting',label:translate("待通知")}]} /><Input.Search allowClear placeholder={translate("搜索公司、岗位、考点")} value={search} onChange={e=>setSearch(e.target.value)} /></Space>
    </Card>

    {error && <Alert type="error" message={error instanceof Error ? error.message : '加载失败'} />}
    {isLoading && <Card loading />}
    {!isLoading && !error && !rows.length && <Empty description={translate("暂无符合条件的日程；在邮件分析中确认并应用考试或面试通知")} />}
    {rows.map(s=><Card className={`schedule-card ${conflicts(s).length ? 'has-conflict' : ''}`} key={s.id} title={<Space wrap><Typography.Text className="entity-title" strong>{s.companyName}</Typography.Text><Typography.Text className="entity-subtitle">{EMAIL_EVENT_LABELS[s.kind as keyof typeof EMAIL_EVENT_LABELS]??s.kind}{s.data.round?` · ${s.data.round}`:''}</Typography.Text><Tag color={s.status==='cancelled'?'red':s.status==='awaiting_time'?'orange':'blue'}>{{scheduled:'已安排',cancelled:'已取消',awaiting_time:s.data.preliminary?'预通知 · 等待正式时间':'延期 · 等待新时间'}[s.status]}</Tag></Space>} extra={<Button onClick={()=>setDetail(s)}>查看详情</Button>}>
      <Space direction="vertical" style={{width:'100%'}}>
        <Typography.Text type="secondary">{s.positionTitle}</Typography.Text>
        {conflicts(s).length>0 && <Alert type="error" showIcon message={translate("时间冲突")} description={conflicts(s).map(o=>`${o.companyName} · ${EMAIL_EVENT_LABELS[o.kind as keyof typeof EMAIL_EVENT_LABELS]??o.kind} · ${formatDateTime(o.data.eventTime!)}${o.data.eventTimeEnd?' — '+formatDateTime(o.data.eventTimeEnd):''}`).join('；')}/>}
        {s.data.sharedWithScheduleId && <Typography.Text type="secondary">{`已确认共用日程 #${s.data.sharedWithScheduleId} 的活动提醒；本申请独立保留`}</Typography.Text>}

        {s.data.preliminary && <Alert type="warning" message={`${s.data.stageLabel??'时间待确定'}${s.data.dateStart&&s.data.dateEnd?`：${s.data.dateStart} 至 ${s.data.dateEnd}`:''}，等待预约结果或正式时间`} description={s.data.attendanceCondition??'不推断具体时刻，正式通知后补齐提醒'}/>}
        <ActivityTime data={s.data} status={s.status}/>
        <Typography.Text>{s.data.mode==='online'?'线上参加':s.data.mode==='offline'?'线下参加':'参加方式待通知'}{[s.data.venue,s.data.address,s.data.room].filter(Boolean).length?' · '+[s.data.venue,s.data.address,s.data.room].filter(Boolean).join(' · '):s.data.mode==='offline'?' · 地点待通知':''}</Typography.Text>
        {!!s.data.preparationTasks?.length&&<Typography.Text type="secondary">{s.data.preparationTasks.length} 项准备事项 · 详情中查看</Typography.Text>}

      </Space>
    </Card>)}
    <Drawer title={detail?`${detail.companyName} · 日程详情`:''} open={!!detail} onClose={()=>setDetail(null)} width="min(680px,100vw)">
      {detail&&<Space direction="vertical" size={16} style={{width:'100%'}}>
        <Typography.Text>{detail.positionTitle}</Typography.Text>
        <ActivityTime data={detail.data} status={detail.status}/>
        <Space wrap><Tag>第 {detail.revision} 版</Tag>{detail.data.eventRef&&<Tag>活动编号 {detail.data.eventRef}</Tag>}</Space>
        {(detail.data.preparationTasks??[]).map((task,i)=><div key={i}><Typography.Text strong>{task.title}</Typography.Text><div>{formatDateTime(task.scheduledAt)}</div></div>)}
        <Space wrap><Button onClick={()=>{setEditing(detail);form.setFieldsValue({action:'update',mode:detail.data.mode??'unknown',timeKind:detail.data.timeKind??'start',venue:detail.data.venue,address:detail.data.address,room:detail.data.room,time:detail.data.eventTime?dayjs(detail.data.eventTime):null,end:detail.data.eventTimeEnd?dayjs(detail.data.eventTimeEnd):null});setDetail(null);}}>调整</Button><Link to={`/applications/${detail.applicationId}`}>查看申请</Link></Space>
        {detail.status==='scheduled' && !detail.data.sharedWithScheduleId && <Button size="small" onClick={()=>{setSharing(detail);setDetail(null);setShareTarget(undefined);}}>{translate("与同场日程共用提醒")}</Button>}
        <Collapse style={{width:'100%'}} items={[{key:'sources',label:`来源与变更记录（${detail.sources.length} 条记录）`,children:<Space direction="vertical" style={{width:'100%'}}>{detail.sources.map((source,i)=>{
          let detail: Record<string,unknown> = {}; try {detail=JSON.parse(source.snapshot);} catch { /* historical invalid JSON */ }
          return <Card key={i} size="small"><Tag>{source.action.startsWith('manual:') ? `人工${actions[source.action.slice(7)] ?? '调整'}` : actions[source.action] ?? source.action}</Tag><Typography.Text>{source.subject ?? (source.action.startsWith('manual:') ? '人工确认' : '来源邮件已删除')} · {detail.receivedAtUnknown ? '收件日期未知（补录来源）' : `收件 ${formatDateTime(source.receivedAt)}`}</Typography.Text><Typography.Paragraph style={{whiteSpace:'pre-wrap',marginBottom:0}}>{[detail.eventTime,detail.venue,detail.address,detail.room,detail.evidence].filter(v=>typeof v==='string').join('\n')}</Typography.Paragraph></Card>;
        })}</Space>}]} />
      </Space>}
    </Drawer>
    <Modal title={translate("调整招聘日程")} open={Boolean(editing)} onCancel={()=>setEditing(null)} onOk={()=>mutation.mutate()} confirmLoading={mutation.isPending} style={{top:24}} styles={{body:{maxHeight:'calc(100vh - 160px)',overflowY:'auto'}}}>
      <Typography.Paragraph>{translate("更改会记录在历史中，仅更新本场自动提醒。手工提醒请另行核对。")}</Typography.Paragraph>
      <Form form={form} layout="vertical">
        <Form.Item name="action" label={translate("操作")} rules={[{required:true}]}><Select options={[{value:'update',label:translate("修正地点 / 考场")},{value:'reschedule',label:translate("改期（新时间空白表示待通知）")},{value:'cancel',label:translate("取消本场活动")},{value:'restore',label:translate("恢复已取消活动")}]} /></Form.Item>
        <Form.Item name="timeKind" label={translate("时间性质")}><Select options={[{value:'start',label:translate("固定场次 · 同时参加会冲突")},{value:'window',label:translate("灵活作答窗口 · 期限内自行安排")},{value:'deadline',label:translate("截止事项 · 只提醒截止时间")}]}/></Form.Item>
        <Form.Item name="time" label={translate("新活动时间（更改或清空时间请选择改期）")}><DatePicker showTime style={{width:'100%'}} /></Form.Item>
        <Form.Item name="end" label={translate("结束时间")}><DatePicker showTime style={{width:'100%'}} /></Form.Item>
        <Form.Item name="mode" label={translate("参加方式")}><Select options={[{value:'offline',label:translate("线下")},{value:'online',label:translate("线上")},{value:'unknown',label:translate("待确认")}]} /></Form.Item>
        <Form.Item name="venue" label={translate("考点 / 场所")}><Input /></Form.Item>
        <Form.Item name="address" label={translate("地址")}><Input /></Form.Item>
        <Form.Item name="room" label={translate("考场 / 房间")}><Input /></Form.Item>
      </Form>
    </Modal>
    <Modal title={translate("确认是同一场活动")} open={Boolean(sharing)} onCancel={()=>setSharing(null)} confirmLoading={share.isPending} okButtonProps={{disabled:!shareTarget}} onOk={()=>share.mutate()}>
      <Typography.Paragraph>{translate("仅在确认实际为同一场考试或面试时共用提醒。申请与邮件来源保持独立，已完成记录保留；独有的准备事项仍单独提醒。")}</Typography.Paragraph>
      <Select aria-label={translate("共用提醒的主日程")} style={{width:'100%'}} value={shareTarget} onChange={setShareTarget} placeholder={translate("选择保留活动提醒的日程")} options={(data?.items??[]).filter(o=>sharing && o.id!==sharing.id && !o.data.sharedWithScheduleId && o.kind===sharing.kind && o.status==='scheduled' && o.data.eventTime===sharing.data.eventTime && (o.data.eventTimeEnd??null)===(sharing.data.eventTimeEnd??null)).map(o=>({value:o.id,label:`#${o.id} ${o.companyName} · ${o.positionTitle}`}))}/>
    </Modal>
  </Space>;
}
