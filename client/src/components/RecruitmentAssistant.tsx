import {translate, useLanguage} from '../i18n';
import {useState} from 'react';
import {Alert,Button,Card,Empty,Input,Space,Tag,Typography,message} from 'antd';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {http} from '../api/http';
type Turn={id:number;role:string;content:string;status:string;plan:({type:string;reason:string;mailId?:number;applicationId?:number;scheduleId?:number;key?:string;decision?:string})[]|null};
export default function RecruitmentAssistant(){
  const {t:localize}=useLanguage();

 const [text,setText]=useState('');const client=useQueryClient();
 const history=useQuery({queryKey:['recruitment-chat'],queryFn:()=>http.get<Turn[]>('/email/chat')});
 const send=useMutation({mutationFn:()=>http.post<Turn[]>('/email/chat',{message:text},90000),onSuccess:r=>{client.setQueryData(['recruitment-chat'],r);setText('');},onError:e=>message.error(e.message)});
 const confirm=useMutation({mutationFn:(id:number)=>http.post<Turn[]>(`/email/chat/${id}/confirm`,{}),onSuccess:()=>{void client.invalidateQueries();message.success(localize('方案已执行并保留记录','Changes applied and recorded'));},onError:e=>message.error(e.message)});
 return <Card title={translate("招聘助手 · 直接聊就能核对")}>
  <Space direction="vertical" size={12} style={{width:'100%'}}>
   <Typography.Text type="secondary">{translate("使用设置中的 AI，结合本地通知、申请和日程一起判断。你可以一次说明多件事，助手会集中追问并提出处理方案。")}</Typography.Text>
   {history.error&&<Alert type="error" message={history.error.message}/>}
   <div aria-label={translate("招聘助手对话记录")} style={{width:'100%',maxHeight:520,overflowY:'auto'}}>
    {!history.data?.length&&<Empty description={translate("例如：一起看看剩下的核查，哪些能合并？中国移动的测评归到统一招聘申请。")}/>}
    {history.data?.map(t=><Card key={t.id} size="small" style={{marginBottom:12}} title={<Tag color={t.role==='user'?'blue':'purple'}>{t.role==='user'?localize('你','You'):localize('招聘助手','Assistant')}</Tag>}>
     <Typography.Paragraph style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{t.content}</Typography.Paragraph>
     {!!t.plan?.length&&<><Typography.Text strong>{translate("拟执行操作（确认前不会修改）")}</Typography.Text>{t.plan.map((a,i)=><Typography.Paragraph key={i}>{i+1}. {a.type==='apply-mail'?`通知 #${a.mailId} → 申请 #${a.applicationId}`:a.type==='complete-schedule'?`日程 #${a.scheduleId} 的全部待办标为完成`:`核查 ${a.key}：${a.decision==='ignore'?'保持现状':'按建议修复'}`} · {a.reason}</Typography.Paragraph>)}<Button type="primary" disabled={t.status!=='proposed'||send.isPending} loading={confirm.isPending} onClick={()=>confirm.mutate(t.id)}>{t.status==='executed'?localize('已执行并记录','Applied and recorded'):t.status==='superseded'?localize('已被后续对话替代','Replaced by a newer proposal'):localize('确认执行这份方案','Confirm these changes')}</Button></>}
    </Card>)}
   </div>
   <Input.TextArea aria-label={translate("给招聘助手发消息")} value={text} onChange={e=>setText(e.target.value)} rows={3} maxLength={4000} placeholder={translate("直接描述：哪些是同一申请、哪个已完成，或让助手一起分析剩下的问题……")}/>
   <Space wrap><Button type="primary" loading={send.isPending} disabled={!text.trim()||confirm.isPending} onClick={()=>send.mutate()}>{translate("发送给助手")}</Button><Button onClick={()=>setText(localize('请综合分析当前待确认事项，先说明能自动处理什么，再集中问我确实有歧义的问题。','Review the outstanding items together. Explain which can be handled automatically, and ask me only about genuine ambiguities. Please reply in English.'))}>{translate("帮我一起核对")}</Button></Space>
   <Typography.Text type="secondary">{translate("只发送脱敏的本地证据给已配置的 API；不打开招聘链接、不登录、不进行身份验证。可继续对话修改方案，确认后才执行。")}</Typography.Text>
  </Space>
 </Card>;
}
