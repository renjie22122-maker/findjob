import {useState} from 'react';
import {Alert,Button,Card,Empty,Input,Space,Tag,Typography,message} from 'antd';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {http} from '../api/http';
type Turn={id:number;role:string;content:string;status:string;plan:({type:string;reason:string;mailId?:number;applicationId?:number;scheduleId?:number;key?:string;decision?:string})[]|null};
export default function RecruitmentAssistant(){
 const [text,setText]=useState('');const client=useQueryClient();
 const history=useQuery({queryKey:['recruitment-chat'],queryFn:()=>http.get<Turn[]>('/email/chat')});
 const send=useMutation({mutationFn:()=>http.post<Turn[]>('/email/chat',{message:text},90000),onSuccess:r=>{client.setQueryData(['recruitment-chat'],r);setText('');},onError:e=>message.error(e.message)});
 const confirm=useMutation({mutationFn:(id:number)=>http.post<Turn[]>(`/email/chat/${id}/confirm`,{}),onSuccess:()=>{void client.invalidateQueries();message.success('方案已执行并保留记录');},onError:e=>message.error(e.message)});
 return <Card title="招聘助手 · 直接聊就能核对">
  <Space direction="vertical" size={12} style={{width:'100%'}}>
   <Typography.Text type="secondary">使用设置中的 AI，结合本地通知、申请和日程一起判断。你可以一次说明多件事，助手会集中追问并提出处理方案。</Typography.Text>
   {history.error&&<Alert type="error" message={history.error.message}/>}
   <div aria-label="招聘助手对话记录" style={{width:'100%',maxHeight:520,overflowY:'auto'}}>
    {!history.data?.length&&<Empty description="例如：一起看看剩下的核查，哪些能合并？中国移动的测评归到统一招聘申请。"/>}
    {history.data?.map(t=><Card key={t.id} size="small" style={{marginBottom:12}} title={<Tag color={t.role==='user'?'blue':'purple'}>{t.role==='user'?'你':'招聘助手'}</Tag>}>
     <Typography.Paragraph style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{t.content}</Typography.Paragraph>
     {!!t.plan?.length&&<><Typography.Text strong>拟执行操作（确认前不会修改）</Typography.Text>{t.plan.map((a,i)=><Typography.Paragraph key={i}>{i+1}. {a.type==='apply-mail'?`通知 #${a.mailId} → 申请 #${a.applicationId}`:a.type==='complete-schedule'?`日程 #${a.scheduleId} 的全部待办标为完成`:`核查 ${a.key}：${a.decision==='ignore'?'保持现状':'按建议修复'}`} · {a.reason}</Typography.Paragraph>)}<Button type="primary" disabled={t.status!=='proposed'||send.isPending} loading={confirm.isPending} onClick={()=>confirm.mutate(t.id)}>{t.status==='executed'?'已执行并记录':t.status==='superseded'?'已被后续对话替代':'确认执行这份方案'}</Button></>}
    </Card>)}
   </div>
   <Input.TextArea aria-label="给招聘助手发消息" value={text} onChange={e=>setText(e.target.value)} rows={3} maxLength={4000} placeholder="直接描述：哪些是同一申请、哪个已完成，或让助手一起分析剩下的问题……"/>
   <Space wrap><Button type="primary" loading={send.isPending} disabled={!text.trim()||confirm.isPending} onClick={()=>send.mutate()}>发送给助手</Button><Button onClick={()=>setText('请综合分析当前待确认事项，先说明能自动处理什么，再集中问我确实有歧义的问题。')}>帮我一起核对</Button></Space>
   <Typography.Text type="secondary">只发送脱敏的本地证据给已配置的 API；不打开招聘链接、不登录、不进行身份验证。可继续对话修改方案，确认后才执行。</Typography.Text>
  </Space>
 </Card>;
}
