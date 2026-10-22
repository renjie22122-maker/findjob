import {useState} from 'react';
import {Alert,Button,Card,DatePicker,Form,Input,Space,message} from 'antd';
import {useMutation,useQueryClient} from '@tanstack/react-query';
import {http} from '../api/http';

export default function SmsImportPanel(){
  const [form]=Form.useForm();const client=useQueryClient();const [result,setResult]=useState('');
  const mutation=useMutation({mutationFn:async()=>{const v=await form.validateFields();return http.post<{message:string;status:string}>('/sms/import',{body:v.body,sender:v.sender||undefined,receivedAt:v.receivedAt?.toISOString()},120000);},onSuccess:r=>{setResult(r.message);message.success(r.message);void client.invalidateQueries();},onError:e=>message.error(e.message)});
  return <Card title="短信接入（与邮件共用日程）">
    <Space direction="vertical" style={{width:'100%'}}>
      <Alert type="info" message="Android 可通过短信转发器接入，也可先粘贴短信" description="仅分析招聘通知，验证码与登录验证在入库前过滤；不访问短信网址。缺少收件时间时记录导入时间，不推断投递日期。"/>
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
