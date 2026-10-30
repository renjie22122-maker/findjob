import {useState} from 'react';
import {Alert,Button,Card,DatePicker,Form,Input,Space,message} from 'antd';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {http} from '../api/http';

export default function SmsImportPanel(){
  const [form]=Form.useForm();const client=useQueryClient();const [result,setResult]=useState('');
  const status=useQuery({queryKey:['sms-status'],queryFn:()=>http.get<{receipts:{receivedAt:string;outcome:string;itemId:number|null;duplicate:number;diagnostic:number}[]}>('/sms/status'),refetchInterval:15000});
  const last=status.data?.receipts.find(r=>!r.diagnostic);
  const mutation=useMutation({mutationFn:async()=>{const v=await form.validateFields();return http.post<{message:string;status:string}>('/sms/import',{body:v.body,sender:v.sender||undefined,receivedAt:v.receivedAt?.toISOString()},120000);},onSuccess:r=>{setResult(r.message);message.success(r.message);void client.invalidateQueries();},onError:e=>message.error(e.message)});
  return <Card title="短信接入（与邮件共用日程）">
    <Space direction="vertical" style={{width:'100%'}}>
      <Alert type="info" message="Android 可通过短信转发器接入，也可先粘贴短信" description="仅分析招聘通知，验证码与登录验证在入库前过滤；不访问短信网址。缺少收件时间时记录导入时间，不推断投递日期。"/>
      <Alert type={last?'info':'warning'} message={last?`最近收到转发请求：${new Date(last.receivedAt).toLocaleString()}`:'尚无网关接收记录（从本次升级开始统计）'} description={last?`${last.duplicate?'重复通知，未重复入库':({confirmed:'已自动关联',pending:'已保存，待核对',filtered:'已过滤，无需入库',failed:'处理失败，请查看手机转发日志'} as Record<string,string>)[last.outcome]??last.outcome}${last.itemId?` · 通知 #${last.itemId}`:''}。请求成功不代表持续在线，通道测试也可能产生记录，请与手机日志核对。`:'此处仅统计网关请求，不包含手动补录。请确认手机 Tailscale 已连接，并在 SmsForwarder 查看转发日志；电脑自检单独标记。'} action={<Button size="small" onClick={()=>void status.refetch()}>刷新接收状态</Button>}/>
      <Form form={form} layout="vertical" style={{width:'100%'}}>
        <Form.Item name="sender" label="发送方（可选）"><Input placeholder="号码或短信签名"/></Form.Item>
        <Form.Item name="receivedAt" label="短信收到时间（可选）"><DatePicker showTime/></Form.Item>
        <Form.Item name="body" label="短信正文" rules={[{required:true,message:'请粘贴短信正文'}]}><Input.TextArea rows={4} maxLength={12000}/></Form.Item>
        <Button type="primary" loading={mutation.isPending} onClick={()=>mutation.mutate()}>导入并分析短信</Button>
      </Form>
      {result && <Alert message={result} type="info"/>}
    </Space>
  </Card>;
}
