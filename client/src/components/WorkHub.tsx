import {useMemo,useState} from 'react';
import {Alert,Button,Card,Collapse,Empty,Input,Modal,Space,Tag,Typography,Tabs,Segmented,message,theme} from 'antd';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {http} from '../api/http';
import {useLanguage} from '../i18n';
import {layoutWorkGraph} from '../utils/workGraphLayout';
import {STATUS_LABELS} from '../utils/constants';

type Node={id:string;kind:string;title:string;state:string;data:Record<string,unknown>};
type Edge={source:string;target:string;relation:string};
type Graph={nodes:Node[];edges:Edge[];total:number;hasMore:boolean};
type Decision={id:string;input:string;status:string;plan:string;result:string};
const parse=(s:string)=>{try{return JSON.parse(s);}catch{return {};}};
const colors=['#5b8ff9','#61b89b','#b084eb','#e7a04b'];
export default function WorkHub(){
  const {t}=useLanguage(),cache=useQueryClient();
  const {token}=theme.useToken();
  const [view,setView]=useState('assistant');
  const label=(value:string)=>({written_test:t('笔试','Exam'),interview:t('面试','Interview'),assessment:t('测评','Assessment'),scheduled:t('已安排','Scheduled'),active:t('进行中','Active'),done:t('已完成','Done'),completed:t('已完成','Completed'),pending:t('待整理','Pending'),confirmed:t('已关联','Linked'),cancelled:t('已取消','Cancelled'),...STATUS_LABELS}[value]??value);
  const [query,setQuery]=useState(''),[search,setSearch]=useState(''),[offset,setOffset]=useState(0),[text,setText]=useState(''),[selected,setSelected]=useState<Node|null>(null);
  const graph=useQuery({queryKey:['work-graph',search,offset],queryFn:()=>http.get<Graph>(`/work/graph?query=${encodeURIComponent(search)}&offset=${offset}&limit=40`)});
  const automation=useQuery({queryKey:['work-automation'],queryFn:()=>http.get<{enabled:boolean;state?:string;pending:number;retrying:number;paused:number;resolved?:number;at?:string}>('/work/automation'),refetchInterval:30000});
  const strategies=useQuery({queryKey:['work-strategies'],queryFn:()=>http.get<{key:string;title:string;revision:number;successes:number;failures:number;state:string;data:{signals:string[];approach:string}}[]>('/work/strategies'),refetchInterval:60000});
  const history=useQuery({queryKey:['work-history'],queryFn:()=>http.get<Decision[]>('/work/history'),refetchInterval:30000});
  const source=useQuery({queryKey:['work-source',selected?.id],enabled:!!selected?.id.startsWith('notice:'),queryFn:()=>http.get<{subject:string;snippet:string}[]>(`/work/sources/${selected!.id.split(':')[1]}`)});
  const refresh=()=>void cache.invalidateQueries();
  const analyze=useMutation({mutationFn:(request:string)=>http.post<{status:string;message?:string}>('/work/analyze',{message:request},150000),onSuccess:r=>{if(r.message)message.info(r.message);else message.success(t('核对完成，处理结果已记录','Review complete; changes recorded'));setText('');refresh();},onError:e=>message.error(e.message)});
  const confirm=useMutation({mutationFn:(id:string)=>http.post(`/work/decisions/${id}/confirm`,{}),onSuccess:refresh,onError:e=>message.error(e.message)});
  const layout=useMemo(()=>layoutWorkGraph(graph.data?.nodes??[],graph.data?.edges??[]),[graph.data]);
  const enrich=useMutation({mutationFn:(query:string)=>http.post('/work/search',{query},90000),onSuccess:()=>void cache.invalidateQueries({queryKey:['work-graph']}),onError:()=>message.info(t('已显示本地结果，AI 扩展搜索暂不可用','Local results shown; AI search is temporarily unavailable'))});
  const relation=(r:string)=>({parent_of:t('下属组织','Parent of'),subsidiary_of:t('隶属集团','Subsidiary of'),requires:t('待办','Task'),progressed:t('进度','Progress'),offers:t('提供岗位','Offers'),participates:t('参与','Participates'),supports:t('来源依据','Evidence'),shares_reminders:t('共用提醒','Shared reminders'),notifies:t('通知','Notifies'),belongs_to:t('属于','Belongs to'),depends_on:t('依赖','Depends on'),passed:t('已通过','Passed')}[r]??r);
  return <Card className="progress-hub" title={t('说一句，交给赴程','Tell CareerFlow what you need')}>
    <Space direction="vertical" size={16} style={{width:'100%'}}>
      <Typography.Paragraph type="secondary" style={{margin:0}}>{t('一个考试关联多个岗位，后续流程各自推进。AI 在后台整理进度和待办，你只需在需要时说一句“这个做完了”或“时间改了”。重大异常保留在处理记录里，已完成状态受到保护。','One exam can serve multiple roles while later stages remain separate. AI organizes progress and tasks in the background. Say “this is done” or “the time changed” to correct it. Exceptions and changes remain in the history.')}</Typography.Paragraph>
      {automation.data&&<Typography.Text type="secondary">{t('自动纠错','Automatic repair')} · {!automation.data.enabled?t('已暂停','Paused'):automation.data.state==='unconfigured'?t('待配置 API','Configure API'):automation.data.state==='running'?t('正在核对','Reviewing'):t('已开启','Enabled')} · {automation.data.pending} {t('待整理','pending')} · {automation.data.retrying} {t('自动重试','retrying')}{automation.data.paused>0?` · ${automation.data.paused} ${t('项暂存，可在对话中补充信息','paused; add context in chat')}`:''}</Typography.Text>}
      {!!strategies.data?.length&&<Collapse size="small" items={[{key:'experience',label:t(`自动积累的处理经验 · ${strategies.data.length} 类`,`Learned decision categories · ${strategies.data.length}`),children:strategies.data.map(s=><div key={s.key} style={{marginBottom:12}}><Typography.Text strong>{s.title}</Typography.Text><Typography.Paragraph type="secondary">{t('版本','Version')} {s.revision} · {s.successes} {t('次验证通过','verified')} · {s.state==='needs_revision'?t('待自动修订','Needs revision'):t('供 AI 参考，仍核对当前原文','Context only; current evidence is still checked')}</Typography.Paragraph><Typography.Paragraph>{s.data.approach}</Typography.Paragraph></div>)}]}/>}
      <Segmented block value={view} onChange={setView} options={[{value:'assistant',label:t('对话','Chat')},{value:'connections',label:t('关联图','Connections')},{value:'history',label:t('处理记录','History')}]}/>
      {view==='connections'&&<>
      <Input.Search aria-label={t('搜索关联图谱','Search connections')} value={query} onChange={e=>setQuery(e.target.value)} onSearch={v=>{setSearch(v);setOffset(0);if(v.trim()&&v.trim().length<=100)enrich.mutate(v.trim());}} placeholder={t('搜索公司、岗位、事项或编号','Search company, role, activity or ID')} allowClear/>
      {enrich.isPending&&<Typography.Text type="secondary">{t('正在补充简称、中英文和集团关联结果…','Expanding aliases, translations and group relationships…')}</Typography.Text>}
      {graph.error&&<Alert type="error" message={graph.error.message}/>}
      <Tabs items={[{key:'graph',label:t('关系图','Graph'),children:<div style={{maxHeight:460,overflow:'auto',border:'1px solid var(--ant-color-border, #8884)',borderRadius:12}}>
        {!graph.data?.nodes.length?<Empty/>:<svg role="img" aria-label={t('公司岗位事项通知关联图','Company, application, activity and message graph')} viewBox={`0 0 1100 ${layout.height}`} width="100%" style={{minWidth:800,display:'block'}}>
          {[t('公司 / 组织','Companies'),t('岗位 / 申请','Applications'),t('事项 / 里程碑','Activities / milestones'),t('邮件 / 短信','Messages')].map((label,c)=><text key={c} x={20+c*270} y={27} fill="currentColor" fontSize={15} fontWeight={600}>{label}</text>)}
          {layout.edges.map((e,i)=><path key={i} d={layout.path(e)} stroke={e.relation==='shares_reminders'?'#e7a04b':'#8a95a5'} strokeOpacity=".45" fill="none"><title>{relation(e.relation)}</title></path>)}
          {graph.data.nodes.map(n=>{const p=layout.positions.get(n.id)!;return <g key={n.id} role="button" tabIndex={0} aria-label={n.title} onClick={()=>setSelected(n)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(n);}}} style={{cursor:'pointer'}}>
            <rect x={p.x} y={p.y} width={230} height={62} rx={10} fill={token.colorBgContainer} stroke={colors[p.column]} strokeWidth={1.5}/>
            <text x={p.x+12} y={p.y+25} fill={token.colorText} fontSize={14} fontWeight={500}>{label(n.title).length>15?label(n.title).slice(0,15)+'…':label(n.title)}</text>
            <text x={p.x+12} y={p.y+46} fill={token.colorTextSecondary} fontSize={11}>{n.id} · {label(n.state)}</text><title>{n.title}</title>
          </g>;})}
        </svg>}
      </div>},{key:'list',label:t('关联列表','List'),children:<Space direction="vertical" style={{width:'100%'}}>{graph.data?.nodes.map(n=><Card key={n.id} size="small" title={<Button type="link" style={{whiteSpace:'normal',height:'auto'}} onClick={()=>setSelected(n)}>{n.title}</Button>}><Tag>{n.kind}</Tag><Tag>{n.state}</Tag>{graph.data.edges.filter(e=>e.source===n.id).map((e,i)=><div key={i}>{relation(e.relation)} → {graph.data?.nodes.find(x=>x.id===e.target)?.title??e.target}</div>)}</Card>)}</Space>}]}/>
      <Space><Button disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-40))}>{t('上一页','Previous')}</Button><Button disabled={!graph.data?.hasMore} onClick={()=>setOffset(offset+40)}>{t('下一页','Next')}</Button><Typography.Text type="secondary">{t('分页展示匹配项及直接关联，关系不等于合并。','Paged matches and direct neighbours. A link does not merge records.')}</Typography.Text></Space>
      </>}
      {view==='assistant'&&<>
      {!!history.data?.length&&<div className="progress-conversation" aria-label={t('进度对话记录','Progress conversation')}>{history.data.slice(0,6).reverse().map(d=><div className="progress-turn" key={d.id}><Typography.Paragraph className="progress-user">{d.input}</Typography.Paragraph><Typography.Paragraph style={{whiteSpace:'pre-wrap'}}>{parse(d.plan).reply}</Typography.Paragraph><Space><Tag color="green">{t('实际执行','Applied')} {Array.isArray(parse(d.result))?parse(d.result).length:0}</Tag>{d.status==='pending'&&<Button type="link" size="small" onClick={()=>setView('history')}>{t('查看未解决事项','View unresolved items')}</Button>}</Space></div>)}</div>}
      <Input.TextArea value={text} onChange={e=>setText(e.target.value)} rows={3} maxLength={4000} placeholder={t('例如：检查近期通知，把共用考试关联到各岗位，补齐截止待办；不要更改已完成状态。','Review recent messages, connect shared exams to roles, and fill missing deadlines while preserving completion.')} aria-label={t('进度助手请求','Progress assistant request')}/>
      <Space wrap><Button type="primary" loading={analyze.isPending} disabled={!text.trim()} onClick={()=>analyze.mutate(text)}>{t('交给 AI 处理','Ask AI to handle')}</Button><Button loading={analyze.isPending} onClick={()=>analyze.mutate(t('核查近期通知，自动处理明确的进度、截止待办及共用活动关联，只问真正有歧义的问题。','Review recent messages, automate clear progress, deadlines and shared activities. Ask only about genuine ambiguity.'))}>{t('自动整理近期通知','Organize recent messages')}</Button></Space>
      <Typography.Text type="secondary">{t('每次最多分析 40 条脱敏通知。后台按内容增量检查；不会打开通知链接、登录或代做考试。下方记录以实际执行结果为准。','Up to 40 redacted messages per analysis. Background checks process changed content. No links, logins or exams are opened. Execution records below show actual results.')}</Typography.Text>
      </>}
      {view==='history'&&<>
      {history.error&&<Alert type="error" message={history.error.message}/>}
      <Collapse items={history.data?.slice(0,10).map(d=>{const plan=parse(d.plan),results=parse(d.result);return {key:d.id,label:<Space><Tag color={d.status==='pending'?'orange':'green'}>{d.status==='pending'?t('有待澄清','Needs clarification'):t('已处理','Processed')}</Tag>{d.input.slice(0,50)}</Space>,children:<Space direction="vertical" style={{width:'100%'}}><Typography.Paragraph style={{whiteSpace:'pre-wrap'}}>{plan.reply}</Typography.Paragraph><Typography.Text strong>{t('实际执行','Applied')}: {Array.isArray(results)?results.length:0}</Typography.Text>{plan.actions?.map((a:{question?:string;reason:string;type:string},i:number)=><Alert key={i} type="warning" message={a.question||a.reason} description={`${a.type} · ${a.reason}`}/>)}{d.status==='pending'&&<Button loading={confirm.isPending} onClick={()=>confirm.mutate(d.id)}>{t('确认以上待决方案','Confirm these pending changes')}</Button>}<Collapse items={[{key:'record',label:t('查看完整修改记录','Full change record'),children:<pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(results,null,2)}</pre>}]}/></Space>};})}/>
      </>}
    </Space>
    <Modal open={!!selected} title={selected?.title} onCancel={()=>setSelected(null)} footer={null}>
      {selected&&<><Tag>{selected.id}</Tag><Tag>{label(selected.state)}</Tag><Collapse style={{marginBlock:12}} items={[{key:"details",label:t("关联信息与属性","Details and attributes"),children:<pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify(selected.data,null,2)}</pre>}]}/>{source.data?.map((n,i)=><Typography.Paragraph key={i} style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{n.snippet}</Typography.Paragraph>)}<Button onClick={()=>{setText(t(`核对 ${selected.id} ${selected.title} 的关联、进度和待办。`,`Review connections, progress and tasks for ${selected.id} ${selected.title}.`));setView('assistant');setSelected(null);}}>{t('让 AI 核对此项','Review this item with AI')}</Button></>}
    </Modal>
  </Card>;
}
