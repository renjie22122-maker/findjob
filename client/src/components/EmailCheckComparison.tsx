import {Alert,Card,Descriptions,Space,Tag,Typography} from 'antd';
import type {EmailCheckComparison as Comparison} from '../types';
import {formatDateTime,STATUS_LABELS} from '../utils/constants';

const value=(v?:string)=>v || '未提供／待确认';
const time=(v?:string)=>v ? formatDateTime(v) : '未提供／待确认';
const place=(v:{venue?:string;address?:string;room?:string})=>[v.venue,v.address,v.room].filter(Boolean).join(' · ') || '未提供／待确认';
const stages:Record<string,string>={applied:'投递',interview:'面试',written_test:'笔试',assessment:'测评',rejected:'拒信',offer:'录用'};
const sources:Record<string,string>={body:'正文',attachment:'附件',manual:'人工确认',unknown:'待确认'};
const statuses:Record<string,string>={...STATUS_LABELS,pending:'待处理',confirmed:'已应用',dismissed:'已忽略',scheduled:'已安排',cancelled:'已取消',postponed:'延期待定'};

export function savedComparison(raw:string):Comparison|undefined {
  try {const v=JSON.parse(raw)?.comparison;return Array.isArray(v?.columns)&&Array.isArray(v?.reasons)?v:undefined;}catch{return undefined;}
}

export default function EmailCheckComparison({data}:{data?:Comparison}) {
  if(!data)return null;
  return <Space direction="vertical" style={{width:'100%',minWidth:0}} size={12}>
    <Alert type="info" message="为什么需要你确认" description={<ul style={{paddingLeft:20,margin:0}}>{data.reasons.map((r,i)=><li key={i}>{r}</li>)}</ul>}/>
    <Typography.Text type="secondary">以下为本地保存的邮件正文，可能经过截取；链接、邮箱和验证码已隐藏。缺少信息不表示相同，完整内容请在原邮箱核对。</Typography.Text>
    <div data-testid="email-evidence-columns" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',gap:12,width:'100%',alignItems:'start'}}>
      {data.columns.map((c,i)=><Card size="small" key={i} title={c.label} style={{minWidth:0,overflowWrap:'anywhere'}}>
        <Descriptions size="small" column={1} items={[
          {key:'company',label:'公司',children:value(c.company)},
          {key:'position',label:'当前岗位',children:value(c.position)},
          {key:'status',label:'当前状态',children:statuses[c.status??'']??value(c.status)},
          ...(c.label.startsWith('日程')?[
            {key:'start',label:'当前开始',children:time(c.start)},
            {key:'end',label:'当前结束／截止',children:time(c.end)},
            {key:'place',label:'当前地点／考场',children:place(c)},
            {key:'round',label:'轮次',children:value(c.round)},
          ]:[]),
        ]}/>
        {!c.mails.length && <Typography.Text type="secondary">没有其他关联邮件可供对照。</Typography.Text>}
        {c.mails.map(m=><Card key={m.id} size="small" style={{marginTop:12}} title={<span style={{whiteSpace:'normal'}}>邮件 #{m.id} · {value(m.subject)}</span>}>
          <Typography.Paragraph type="secondary">{value(m.sender)} · 收件 {time(m.receivedAt)}</Typography.Paragraph>
          <Tag>{stages[m.event??'']??value(m.event)}</Tag>
          <Descriptions size="small" column={1} items={[
            {key:'position',label:'邮件岗位',children:value(m.position)},
            {key:'job',label:'职位编号',children:value(m.jobId)},
            {key:'start',label:'开始时间',children:time(m.start)},
            {key:'end',label:'结束／截止',children:time(m.end)},
            {key:'place',label:'地点／考场',children:place(m)},
            {key:'source',label:'时间来源',children:sources[m.timeSource??'']??value(m.timeSource)},
            {key:'quote',label:'时间原文',children:value(m.timeEvidence)},
          ]}/>
          <Typography.Text strong>邮件正文（本地保存）</Typography.Text>
          <pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontFamily:'inherit',maxHeight:280,overflow:'auto',marginBottom:8}}>{m.body?.replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim() || '本地未保存正文，请查看原邮件。'}</pre>
          {m.attachments?.map((a,j)=><Typography.Paragraph key={j} type="secondary">附件：{a.name} · {a.status==='parsed'?'已提取':'未提取'} · {a.detail}</Typography.Paragraph>)}
        </Card>)}
      </Card>)}
    </div>
  </Space>;
}
