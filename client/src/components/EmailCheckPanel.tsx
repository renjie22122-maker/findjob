import {translate, useLanguage} from '../i18n';
import {useState} from 'react';
import RecruitmentAssistant from './RecruitmentAssistant';
import EmailCheckComparison, {savedComparison} from './EmailCheckComparison';
import {Alert,Button,Card,Collapse,Empty,Modal,Select,Space,Tag,Typography,message} from 'antd';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {Link} from 'react-router-dom';
import {emailApi} from '../api';
import {http} from '../api/http';
import type {EmailCheckFinding} from '../types';
import {formatDateTime} from '../utils/constants';

export default function EmailCheckPanel(){
  useLanguage();

  const [showDetails,setShowDetails]=useState(false);
  const client=useQueryClient();const [selected,setSelected]=useState<EmailCheckFinding|null>(null),[target,setTarget]=useState<number>();
  const {data,error,isLoading}=useQuery({queryKey:['email','check'],queryFn:emailApi.checkState,refetchInterval:30000});
  const refresh=()=>void client.invalidateQueries();
  const check=useMutation({mutationFn:async()=>{const ai=await http.post<{results?:unknown[];message?:string}>('/work/analyze',{message:'自动复核待处理通知，记录进展、补齐明确截止和共用活动关联，保留已完成状态。'},150000);if(ai.message)message.info(ai.message);const local=await emailApi.check();return {...local,repaired:local.repaired+(ai.results?.length??0)};},onSuccess:r=>{message.success(`已检查 ${r.checked} 封邮件，修复 ${r.repaired} 项，待确认 ${r.review} 项`);refresh();},onError:e=>message.error(e.message)});
  const resolve=useMutation({mutationFn:(args:{finding:EmailCheckFinding;decision:'confirm'|'ignore'})=>emailApi.resolveCheck({key:args.finding.key,fingerprint:args.finding.fingerprint,decision:args.decision,targetId:target}),onSuccess:()=>{setSelected(null);message.success('处理结果已记录');refresh();},onError:e=>{message.error(e.message);refresh();}});
  const open=(data?.findings??[]).filter(f=>f.status==='open');const latest=data?.runs[0];
  return <Card title={translate("已有邮件核查")} extra={<Button type="primary" loading={check.isPending} onClick={()=>check.mutate()}>{translate("一键检查已有邮件")}</Button>}>
    <Space direction="vertical" style={{width:'100%'}} size={12}>
      <Typography.Text type="secondary">{translate("先用 AI 核对待处理通知，再检查提醒与重复记录。只读取本地保存的内容，不打开通知链接。")}</Typography.Text>
      <Collapse items={[{key:'legacy',label:translate('查看原核查助手'),children:<RecruitmentAssistant/>}]}/>
      {latest && <Typography.Text>{translate("最近检查：")}{formatDateTime(latest.createdAt)} · {latest.checked} {translate("封 · 修复")} {latest.repaired} {translate("项 ·")} <Tag color={open.length?'orange':'green'}>{translate("待确认")} {open.length}  {translate("项")}</Tag></Typography.Text>}
      {error && <Alert type="error" message={error.message}/>}
      {!isLoading && !open.length && <Typography.Text type="secondary">{latest?'暂无待确认问题。已完成状态与手工提醒受到保护。':'尚未检查，可点击上方按钮。'}</Typography.Text>}
      {!!open.length&&<Button onClick={()=>setShowDetails(!showDetails)}>{showDetails?'收起详细核查列表':`展开详细核查列表（${open.length}）`}</Button>}
      {showDetails&&open.map(f=><Card key={f.key} size="small" title={f.title}>
        <EmailCheckComparison data={f.comparison}/>
        <Space wrap style={{marginTop:12}}>
          {f.plan.action!=='review' && <Button onClick={()=>{setSelected(f);setTarget(f.plan.targetId);}}>{translate("核对并处理")}</Button>}
          {f.plan.mailId && <Tag>{translate("邮件 #")}{f.plan.mailId}</Tag>}
          {f.kind.includes('schedule') || f.kind.includes('time') || f.kind==='untracked' ? <Link to="/schedules">{translate("前往招聘日程核对")}</Link> : null}
          <Button loading={resolve.isPending} onClick={()=>Modal.confirm({title:translate("确认保持现状？"),content:'本次决定会保留记录。相关邮件或日程变化后会重新检查。',onOk:()=>resolve.mutateAsync({finding:f,decision:'ignore'})})}>{translate("保持现状")}</Button>
        </Space>
      </Card>)}
      <Collapse items={[{key:'history',label:`检查与修复记录（最近 ${data?.changes.length??0} 项变更）`,children:<Space direction="vertical" style={{width:'100%'}}>
        {(data?.runs??[]).slice(0,5).map(r=><Typography.Text key={r.id}>#{r.id} · {formatDateTime(r.createdAt)} · {{manual:'手动检查',incremental:'增量分析后',apply:'应用邮件后',confirmation:'确认后复查'}[r.trigger]??r.trigger} {translate("· 检查")} {r.checked} {translate("封 / 修复")} {r.repaired} {translate("项 / 待确认")} {r.review}{translate("项")}</Typography.Text>)}
        {!data?.changes.length && <Empty description={translate("暂无修复或确认记录")}/>}
        {(data?.changes??[]).map(c=><Collapse key={c.id} style={{width:'100%'}} items={[{key:String(c.id),label:`${formatDateTime(c.created_at)} · ${c.action}`,children:<><EmailCheckComparison data={savedComparison(c.before_state)}/><Typography.Text strong>{translate("变更前")}</Typography.Text><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:260,overflow:'auto'}}>{c.before_state}</pre><Typography.Text strong>{translate("变更后")}</Typography.Text><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:260,overflow:'auto'}}>{c.after_state}</pre></>}]} />)}
      </Space>}]} />
    </Space>
    <Modal width={1100} title={translate("核对本次修复")} open={Boolean(selected)} onCancel={()=>setSelected(null)} confirmLoading={resolve.isPending} onOk={()=>selected&&resolve.mutate({finding:selected,decision:'confirm'})}>
      <EmailCheckComparison data={selected?.comparison}/>
      {selected?.plan.action==='merge-app' && <><Typography.Paragraph>{translate("保留哪条申请？目标申请的当前状态将保留，源申请的完整记录会存入修复历史。")}</Typography.Paragraph><Select aria-label={translate("保留申请")} style={{width:'100%'}} value={target} onChange={setTarget} options={selected.plan.ids.map(id=>({value:id,label:`保留申请 #${id}`}))}/></>}
      <Alert style={{marginTop:16}} type="info" message={translate("会保留已完成提醒和全部来源记录。记录已变化时会拒绝操作，请重新检查。")}/>
    </Modal>
  </Card>;
}
