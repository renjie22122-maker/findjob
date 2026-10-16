import dayjs from 'dayjs';
import type { RecruitmentSchedule } from '../types';
import { useState } from 'react';
import { Alert, Button, Card, Collapse, Empty, Input, Segmented, Space, Tag, Typography, Modal, Form, Select, DatePicker, message } from 'antd';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { emailApi } from '../api';
import { formatDateTime, EMAIL_EVENT_LABELS } from '../utils/constants';

const actions: Record<string,string> = {create:'首次安排',update:'补充信息',reschedule:'改期',cancel:'取消',restore:'恢复',legacy:'历史邮件接入',stale:'旧邮件留档（未覆盖当前日程）'};
export default function Schedules() {
  const [editing,setEditing]=useState<RecruitmentSchedule|null>(null);
  const [form]=Form.useForm();const queryClient=useQueryClient();
  const mutation=useMutation({mutationFn:async()=>{
    const v=await form.validateFields();
    return emailApi.updateSchedule(editing!.id,{revision:editing!.revision,schedule:{action:v.action,mode:v.mode,venue:v.venue || null,address:v.address || null,room:v.room || null,evidence:'用户在日程页面人工确认'},eventTime:v.time?.format('YYYY-MM-DDTHH:mm:ss') ?? null,eventTimeEnd:v.end?.format('YYYY-MM-DDTHH:mm:ss') ?? null});
  },onSuccess:()=>{setEditing(null);void queryClient.invalidateQueries();message.success('日程和本场自动提醒已更新');},onError:e=>message.error(e instanceof Error?e.message:'更新失败')});
  const [filter,setFilter] = useState('active');
  const [search,setSearch] = useState('');
  const {data,isLoading,error,refetch} = useQuery({queryKey:['schedules'],queryFn:()=>emailApi.schedules(),refetchInterval:30000});
  const rows = (data?.items ?? []).filter(s => (filter === 'all' || (filter === 'cancelled' ? s.status === 'cancelled' : s.status !== 'cancelled')) && `${s.companyName} ${s.positionTitle} ${s.data.venue ?? ''} ${s.data.round ?? ''}`.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>(a.data.eventTime ?? '9999').localeCompare(b.data.eventTime ?? '9999'));
  return <Space direction="vertical" size={16} style={{width:'100%'}}>
    <Card title="招聘日程" extra={<Button onClick={()=>void refetch()}>刷新</Button>}>
      <Typography.Paragraph type="secondary">按申请与场次管理考试、面试。后续邮件可补充考点、考场，改期或取消后更新本场自动提醒。时间使用本机时区，保留原文时区说明。</Typography.Paragraph>
      <Space wrap><Segmented value={filter} onChange={setFilter} options={[{value:'active',label:'未取消'},{value:'cancelled',label:'已取消'},{value:'all',label:'全部'}]} /><Input.Search allowClear placeholder="搜索公司、岗位、考点" value={search} onChange={e=>setSearch(e.target.value)} /></Space>
    </Card>
    <Alert type="info" showIcon message="只读取邮件和已附带文件，不打开考试、预约、准考证或身份验证链接。需要本人操作的事项请回到原邮箱完成。" />
    {error && <Alert type="error" message={error instanceof Error ? error.message : '加载失败'} />}
    {isLoading && <Card loading />}
    {!isLoading && !error && !rows.length && <Empty description="暂无符合条件的日程；在邮件分析中确认并应用考试或面试通知" />}
    {rows.map(s=><Card key={s.id} title={<Space wrap><Typography.Text strong>{s.companyName} · {s.positionTitle}</Typography.Text><Tag color={s.status==='cancelled'?'red':s.status==='awaiting_time'?'orange':'blue'}>{{scheduled:'已安排',cancelled:'已取消',awaiting_time:'延期 · 等待新时间'}[s.status]}</Tag></Space>} extra={<Space><Button size="small" onClick={()=>{setEditing(s);form.setFieldsValue({action:'update',mode:s.data.mode ?? 'unknown',venue:s.data.venue,address:s.data.address,room:s.data.room,time:s.data.eventTime?dayjs(s.data.eventTime):null,end:s.data.eventTimeEnd?dayjs(s.data.eventTimeEnd):null});}}>调整</Button><Link to={`/applications/${s.applicationId}`}>查看申请</Link></Space>}>
      <Space direction="vertical" style={{width:'100%'}}>
        <Space wrap><Tag>{EMAIL_EVENT_LABELS[s.kind as keyof typeof EMAIL_EVENT_LABELS] ?? s.kind}</Tag>{s.data.round && <Tag>{s.data.round}</Tag>}{s.data.eventRef && <Tag>活动编号 {s.data.eventRef}</Tag>}<Tag>第 {s.revision} 版</Tag></Space>
        <Typography.Text strong>{s.data.timeKind==='window'?'作答有效期':s.data.timeKind==='deadline'?'截止':'开始'}：{s.data.eventTime ? formatDateTime(s.data.eventTime) : '待通知'}{s.data.eventTimeEnd ? ` — ${formatDateTime(s.data.eventTimeEnd)}` : ''}</Typography.Text>
        {s.data.timezone && <Typography.Text type="secondary">原文时区：{s.data.timezone}</Typography.Text>}
        <Typography.Text>{s.data.mode==='online'?'线上':s.data.mode==='offline'?'线下':'参加方式待确认'} · 考点：{s.data.venue || '待通知'}</Typography.Text>
        <Typography.Text>地址：{s.data.address || '待通知'} · 考场 / 房间：{s.data.room || '待通知'}</Typography.Text>
        {(s.data.preparationTasks ?? []).map((task,i)=><Typography.Text key={i} type="secondary">准备事项：{task.title} · {formatDateTime(task.scheduledAt)}</Typography.Text>)}
        <Collapse style={{width:'100%'}} items={[{key:'sources',label:`来源与变更记录（${s.sources.length} 条记录）`,children:<Space direction="vertical" style={{width:'100%'}}>{s.sources.map((source,i)=>{
          let detail: Record<string,unknown> = {}; try {detail=JSON.parse(source.snapshot);} catch { /* historical invalid JSON */ }
          return <Card key={i} size="small"><Tag>{source.action.startsWith('manual:') ? `人工${actions[source.action.slice(7)] ?? '调整'}` : actions[source.action] ?? source.action}</Tag><Typography.Text>{source.subject ?? (source.action.startsWith('manual:') ? '人工确认' : '来源邮件已删除')} · 收件 {formatDateTime(source.receivedAt)}</Typography.Text><Typography.Paragraph style={{whiteSpace:'pre-wrap',marginBottom:0}}>{[detail.eventTime,detail.venue,detail.address,detail.room,detail.evidence].filter(v=>typeof v==='string').join('\n')}</Typography.Paragraph></Card>;
        })}</Space>}]} />
      </Space>
    </Card>)}
    <Modal title="调整招聘日程" open={Boolean(editing)} onCancel={()=>setEditing(null)} onOk={()=>mutation.mutate()} confirmLoading={mutation.isPending} style={{top:24}} styles={{body:{maxHeight:'calc(100vh - 160px)',overflowY:'auto'}}}>
      <Typography.Paragraph>更改会记录在历史中，仅更新本场自动提醒。手工提醒请另行核对。</Typography.Paragraph>
      <Form form={form} layout="vertical">
        <Form.Item name="action" label="操作" rules={[{required:true}]}><Select options={[{value:'update',label:'修正地点 / 考场'},{value:'reschedule',label:'改期（新时间空白表示待通知）'},{value:'cancel',label:'取消本场活动'},{value:'restore',label:'恢复已取消活动'}]} /></Form.Item>
        <Form.Item name="time" label="新活动时间（更改或清空时间请选择改期）"><DatePicker showTime style={{width:'100%'}} /></Form.Item>
        <Form.Item name="end" label="结束时间"><DatePicker showTime style={{width:'100%'}} /></Form.Item>
        <Form.Item name="mode" label="参加方式"><Select options={[{value:'offline',label:'线下'},{value:'online',label:'线上'},{value:'unknown',label:'待确认'}]} /></Form.Item>
        <Form.Item name="venue" label="考点 / 场所"><Input /></Form.Item>
        <Form.Item name="address" label="地址"><Input /></Form.Item>
        <Form.Item name="room" label="考场 / 房间"><Input /></Form.Item>
      </Form>
    </Modal>
  </Space>;
}
