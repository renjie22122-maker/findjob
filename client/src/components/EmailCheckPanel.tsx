import {useState} from 'react';
import EmailCheckComparison, {savedComparison} from './EmailCheckComparison';
import {Alert,Button,Card,Collapse,Empty,Modal,Select,Space,Tag,Typography,message} from 'antd';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {Link} from 'react-router-dom';
import {emailApi} from '../api';
import type {EmailCheckFinding} from '../types';
import {formatDateTime} from '../utils/constants';

export default function EmailCheckPanel(){
  const client=useQueryClient();const [selected,setSelected]=useState<EmailCheckFinding|null>(null),[target,setTarget]=useState<number>();
  const {data,error,isLoading}=useQuery({queryKey:['email','check'],queryFn:emailApi.checkState,refetchInterval:30000});
  const refresh=()=>void client.invalidateQueries();
  const check=useMutation({mutationFn:emailApi.check,onSuccess:r=>{message.success(`已检查 ${r.checked} 封邮件，修复 ${r.repaired} 项，待确认 ${r.review} 项`);refresh();},onError:e=>message.error(e.message)});
  const resolve=useMutation({mutationFn:(args:{finding:EmailCheckFinding;decision:'confirm'|'ignore'})=>emailApi.resolveCheck({key:args.finding.key,fingerprint:args.finding.fingerprint,decision:args.decision,targetId:target}),onSuccess:()=>{setSelected(null);message.success('处理结果已记录');refresh();},onError:e=>{message.error(e.message);refresh();}});
  const open=(data?.findings??[]).filter(f=>f.status==='open');const latest=data?.runs[0];
  return <Card title="已有邮件核查" extra={<Button type="primary" loading={check.isPending} onClick={()=>check.mutate()}>一键检查已有邮件</Button>}>
    <Space direction="vertical" style={{width:'100%'}} size={12}>
      <Typography.Text type="secondary">检查本地已保存的邮件和日程，自动补齐提醒、去重同场自动待办。增量分析后也会检查；不会重新读取邮箱或打开任何邮件链接。</Typography.Text>
      {latest && <Typography.Text>最近检查：{formatDateTime(latest.createdAt)} · {latest.checked} 封 · 修复 {latest.repaired} 项 · <Tag color={open.length?'orange':'green'}>待确认 {open.length} 项</Tag></Typography.Text>}
      {error && <Alert type="error" message={error.message}/>}
      {!isLoading && !open.length && <Typography.Text type="secondary">{latest?'暂无待确认问题。已完成状态与手工提醒受到保护。':'尚未检查，可点击上方按钮。'}</Typography.Text>}
      {open.map(f=><Card key={f.key} size="small" title={f.title}>
        <EmailCheckComparison data={f.comparison}/>
        <Space wrap style={{marginTop:12}}>
          {f.plan.action!=='review' && <Button onClick={()=>{setSelected(f);setTarget(f.plan.targetId);}}>核对并处理</Button>}
          {f.plan.mailId && <Tag>邮件 #{f.plan.mailId}</Tag>}
          {f.kind.includes('schedule') || f.kind.includes('time') || f.kind==='untracked' ? <Link to="/schedules">前往招聘日程核对</Link> : null}
          <Button loading={resolve.isPending} onClick={()=>Modal.confirm({title:'确认保持现状？',content:'本次决定会保留记录。相关邮件或日程变化后会重新检查。',onOk:()=>resolve.mutateAsync({finding:f,decision:'ignore'})})}>保持现状</Button>
        </Space>
      </Card>)}
      <Collapse items={[{key:'history',label:`检查与修复记录（最近 ${data?.changes.length??0} 项变更）`,children:<Space direction="vertical" style={{width:'100%'}}>
        {(data?.runs??[]).slice(0,5).map(r=><Typography.Text key={r.id}>#{r.id} · {formatDateTime(r.createdAt)} · {{manual:'手动检查',incremental:'增量分析后',apply:'应用邮件后',confirmation:'确认后复查'}[r.trigger]??r.trigger} · 检查 {r.checked} 封 / 修复 {r.repaired} 项 / 待确认 {r.review} 项</Typography.Text>)}
        {!data?.changes.length && <Empty description="暂无修复或确认记录"/>}
        {(data?.changes??[]).map(c=><Collapse key={c.id} style={{width:'100%'}} items={[{key:String(c.id),label:`${formatDateTime(c.created_at)} · ${c.action}`,children:<><EmailCheckComparison data={savedComparison(c.before_state)}/><Typography.Text strong>变更前</Typography.Text><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:260,overflow:'auto'}}>{c.before_state}</pre><Typography.Text strong>变更后</Typography.Text><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:260,overflow:'auto'}}>{c.after_state}</pre></>}]} />)}
      </Space>}]} />
    </Space>
    <Modal width={1100} title="核对本次修复" open={Boolean(selected)} onCancel={()=>setSelected(null)} confirmLoading={resolve.isPending} onOk={()=>selected&&resolve.mutate({finding:selected,decision:'confirm'})}>
      <EmailCheckComparison data={selected?.comparison}/>
      {selected?.plan.action==='merge-app' && <><Typography.Paragraph>保留哪条申请？目标申请的当前状态将保留，源申请的完整记录会存入修复历史。</Typography.Paragraph><Select aria-label="保留申请" style={{width:'100%'}} value={target} onChange={setTarget} options={selected.plan.ids.map(id=>({value:id,label:`保留申请 #${id}`}))}/></>}
      <Alert style={{marginTop:16}} type="info" message="会保留已完成提醒和全部来源记录。记录已变化时会拒绝操作，请重新检查。"/>
    </Modal>
  </Card>;
}
