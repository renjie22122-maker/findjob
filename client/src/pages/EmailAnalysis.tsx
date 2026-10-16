import { Alert, Button, Card, Descriptions, Modal, Spin, Pagination, Segmented, Space, Switch, Tag, Typography, message, Form, Input, DatePicker, Select } from 'antd';
import { CheckOutlined, CloseOutlined, MailOutlined, SettingOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { emailApi, settingsApi, applicationsApi } from '../api';
import type { EmailExtraction, EmailItem } from '../types';
import { EMAIL_EVENT_COLORS, EMAIL_EVENT_LABELS, STATUS_LABELS, formatDateTime } from '../utils/constants';
import dayjs from 'dayjs';
import EmailCheckPanel from '../components/EmailCheckPanel';

export default function EmailAnalysis() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('pending');
  const [page, setPage] = useState(1);
  const [rescan, setRescan] = useState(false);
  const [days, setDays] = useState(14);
  const [editItem, setEditItem] = useState<EmailItem | null>(null);
  const [editForm] = Form.useForm();
  const {data: scheduleChoices} = useQuery({queryKey:['schedules'],queryFn:()=>emailApi.schedules(),enabled:Boolean(editItem)});
  const [applicationSearch, setApplicationSearch] = useState('');
  const { data: applicationChoices } = useQuery({ queryKey: ['applications', 'mail-targets', applicationSearch], queryFn: () => applicationsApi.list({ page: 1, pageSize: 100, keyword: applicationSearch }), enabled: Boolean(editItem) });
  // 应用邮件时的行为（默认开启）：“投递确认”类邮件可一并把匹配到的申请标为已投递；库里没有记录则自动创建
  const [markApplied, setMarkApplied] = useState(true);
  const [createIfMissing, setCreateIfMissing] = useState(true);

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });
  const { data: auto } = useQuery({ queryKey: ['email', 'auto'], queryFn: emailApi.autoStatus, refetchInterval: 5000 });
  const autoMutation = useMutation({ mutationFn: emailApi.runAuto, onSuccess: (r) => {
    (r.ran ? message.success : message.warning)(r.message);
    queryClient.invalidateQueries();
  }, onError: (err) => message.error(err instanceof Error ? err.message : '运行失败') });

  const { data, isLoading, error } = useQuery({
    queryKey: ['email', 'items', tab, page],
    queryFn: () => emailApi.items({ status: tab, page, pageSize: 20 }),
    refetchInterval: auto?.running ? 5000 : 30000,
  });

  const analyzeMutation = useMutation({
    mutationFn: () => emailApi.analyze(days, { fullRescan: rescan, reanalyzePending: rescan }),
    onSuccess: (r) => {
      message.success(
        `分析完成（${r.mode === 'llm-first' ? 'AI 读正文判定' : '关键词降级'}）：拉取 ${r.fetched} 封，候选 ${r.candidates} 封，新分析 ${r.analyzed} 封，判定无关 ${r.irrelevant} 封（去重跳过 ${r.skipped}）`,
      );
      queryClient.invalidateQueries({ queryKey: ['email'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: (err) => message.error(err instanceof Error ? err.message : '分析失败'),
  });

  const applyMutation = useMutation({
    mutationFn: (item: EmailItem) =>
      emailApi.apply(item.id, item.extracted ?? undefined, { markApplied, createIfMissing, targetScheduleId: editForm.getFieldValue('targetScheduleId') === 'new' ? null : editForm.getFieldValue('targetScheduleId'), expectedScheduleRevision: editForm.getFieldValue('expectedScheduleRevision'), targetApplicationId: editForm.getFieldValue('targetApplicationId') === 'new' ? null : editForm.getFieldValue('targetApplicationId') }),
    onSuccess: (r) => {
      if (r.statusChange) {
        message.success(`已应用，申请 #${r.statusChange.applicationId} 状态已更新为「${STATUS_LABELS[r.statusChange.to as keyof typeof STATUS_LABELS]}」`);
      } else message.success(r.timelineEvent ? `已生成时间线${r.reminder ? '与提醒' : ''}` : '已应用');
      if (r.warning) message.warning(r.warning);
      setEditItem(null);
      queryClient.invalidateQueries({ queryKey: ['email'] });
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
    },
    onError: (err) => message.error(err instanceof Error ? err.message : '应用失败'),
  });

  const dismissMutation = useMutation({
    mutationFn: (id: number) => emailApi.dismiss(id),
    onSuccess: () => {
      message.success('已忽略');
      queryClient.invalidateQueries({ queryKey: ['email'] });
    },
    onError: (err) => message.error(err instanceof Error ? err.message : '忽略失败'),
  });

  const batchApplyMutation = useMutation({
    mutationFn: () => emailApi.applyBatch(0.8, { markApplied, createIfMissing }),
    onSuccess: (r) => {
      const failures = r.results.filter((item) => !item.ok);
      if (failures.length) message.warning(`${failures.length} 条未应用：${failures[0].message}`);
      message.info(
        r.applied > 0
          ? `批量应用完成：应用 ${r.applied} 条，${r.skipped} 条需复核`
          : `没有可安全自动应用的邮件（${r.skipped} 条需复核）`,
      );
      queryClient.invalidateQueries({ queryKey: ['email'] });
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
    },
    onError: (err) => message.error(err instanceof Error ? err.message : '批量应用失败'),
  });

  const configured = Boolean(settings?.email);

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <EmailCheckPanel />
      {!configured && (
        <Alert
          type="warning"
          showIcon
          message="尚未配置邮箱"
          description="请先在设置页配置 IMAP 邮箱（QQ 邮箱/163 等需使用授权码）。未配置 LLM Key 时会自动降级本地规则提取。"
          action={
            <Button size="small" icon={<SettingOutlined />} onClick={() => navigate('/settings')}>
              去配置
            </Button>
          }
        />
      )}

      <Card
        className="email-workspace"
        size="small"
        title={
          <Space>
            <MailOutlined /> 邮件智能分析
          </Space>
        }
        extra={
          <Space wrap>
            <Segmented options={[7, 14, 30]} value={days} onChange={(v) => setDays(v as number)} />
            <Space size={4}><Switch size="small" checked={rescan} onChange={setRescan} /><Typography.Text type="secondary" style={{ fontSize: 12 }}>补扫并重分析待处理</Typography.Text></Space>
            <Space size={4}>
              <Switch size="small" checked={markApplied} onChange={setMarkApplied} />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>按事件推进状态</Typography.Text>
            </Space>
            <Space size={4}>
              <Switch size="small" checked={createIfMissing} onChange={setCreateIfMissing} />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>缺记录则创建</Typography.Text>
            </Space>
            <Button
              icon={<ThunderboltOutlined />}
              loading={batchApplyMutation.isPending}
              onClick={() => batchApplyMutation.mutate()}
            >
              批量应用高置信度（≥0.8）
            </Button>
            <Button type="primary" loading={analyzeMutation.isPending} disabled={!configured || auto?.running || autoMutation.isPending} onClick={() => analyzeMutation.mutate()}>
              {rescan ? `补扫最近 ${days} 天` : '增量分析新邮件'}
            </Button>
          </Space>
        }
      >
        <Alert
          type="info"
          showIcon
          message="投递按收件时间；笔试、面试和测评按正文或附件；Offer 优先正文中的录用日期，否则按收件时间。"
          description="默认按文件夹 UID 游标增量读取，首次从所选天数开始；历史补扫会重分析待处理邮件，保留已应用结果。只读邮箱，不打开链接、不执行身份验证。缺少时间、附件未读或匹配有歧义时请人工复核。"
        />
        {auto && <Card size="small" style={{ marginTop: 12 }} title="自动分析与时间线" extra={<Button loading={autoMutation.isPending} disabled={!configured || auto.running || analyzeMutation.isPending} onClick={() => autoMutation.mutate()}>立即运行自动流程</Button>}>
          <Space wrap><Tag color={auto.enabled ? 'green' : 'default'}>{auto.enabled ? '自动分析已开启' : '自动分析已关闭'}</Tag><Tag>{auto.autoApply ? '符合条件自动生成时间线' : '分析后人工应用'}</Tag><Typography.Text type="secondary">{auto.nextRunAt ? `下次 ${formatDateTime(auto.nextRunAt)}（服务需运行）` : '无自动计划'}</Typography.Text></Space>
          {auto.lastResult && <Typography.Paragraph type="secondary" style={{ marginBottom: 0, marginTop: 8 }}>{auto.lastResult}</Typography.Paragraph>}
        </Card>}
        <div style={{ marginTop: 12 }}>
          <Segmented
            options={[
              { value: 'pending', label: `待处理（${tab === 'pending' ? data?.total ?? 0 : '?'}）` },
              { value: 'confirmed', label: '已应用' },
              { value: 'dismissed', label: '已忽略' },
            ]}
            value={tab}
            onChange={(v) => { setTab(v as string); setPage(1); }}
          />
        </div>

        {(analyzeMutation.isPending || autoMutation.isPending || auto?.running) && <Space role="status" style={{ marginTop: 12 }}><Spin size="small" /><Typography.Text>正在读取并分析邮件，可以稍后刷新查看结果…</Typography.Text></Space>}
        {error && <Alert type="error" showIcon message={error.message} />}
        {isLoading && <Spin style={{ margin: 16 }} />}

        <Space direction="vertical" style={{ width: '100%', marginTop: 12 }}>
          {(data?.items ?? []).length === 0 && !isLoading && (
            <Typography.Text type="secondary">暂无{tab === 'pending' ? '待处理' : tab === 'confirmed' ? '已应用' : '已忽略'}邮件</Typography.Text>
          )}
          {(data?.items ?? []).map((item) => (
            <Card key={item.id} size="small" loading={isLoading}>
              <Space direction="vertical" size={6} style={{ width: '100%' }}>
                <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
                  <Typography.Text strong>{item.subject}</Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {item.sender} · {formatDateTime(item.receivedAt)}
                  </Typography.Text>
                </Space>
                <Space wrap size={8}>
                  {item.extracted?.company && <Tag color="blue">公司：{item.extracted.company}</Tag>}
                  {item.extracted?.eventType && (
                    <Tag color={EMAIL_EVENT_COLORS[item.extracted.eventType]}>
                      事件：{EMAIL_EVENT_LABELS[item.extracted.eventType]}
                    </Tag>
                  )}
                  {(item.extracted?.eventTime || item.extracted?.eventTimeEnd) && (
                    <Tag color="orange">
                      时间：
                      {item.extracted?.eventTime
                        ? formatDateTime(item.extracted.eventTime)
                        : formatDateTime(item.extracted?.eventTimeEnd ?? '')}
                      {item.extracted?.eventTime && item.extracted?.eventTimeEnd
                        ? `–${item.extracted.eventTimeEnd.slice(0,10) === item.extracted.eventTime.slice(0,10) ? item.extracted.eventTimeEnd.slice(11,16) : formatDateTime(item.extracted.eventTimeEnd)}`
                        : ''}
                    </Tag>
                  )}
                  {item.extracted?.schedule && <Tag color="blue">日程：{{create:'安排',update:'补充',reschedule:'改期',cancel:'取消',restore:'恢复'}[item.extracted.schedule.action]} · {[item.extracted.schedule.venue,item.extracted.schedule.address,item.extracted.schedule.room].filter(Boolean).join(' · ')}</Tag>}
                  {item.extracted?.recruitmentId && <Tag>职位编号：{item.extracted.recruitmentId}</Tag>}
                  {item.extracted?.preparationTasks?.map((task, i) => <Tag key={i} color="orange">{task.title} · {formatDateTime(task.scheduledAt)}</Tag>)}
                  {item.extracted?.positionTitle && <Tag>岗位：{item.extracted.positionTitle}</Tag>}
                  <Tag color={item.extracted && item.extracted.confidence >= 0.7 ? 'green' : item.extracted && item.extracted.confidence >= 0.4 ? 'gold' : 'red'}>
                    置信度 {Math.round((item.extracted?.confidence ?? 0) * 100)}%
                  </Tag>
                  <Tag>时间来源：{{ received: '收件时间', body: '正文', attachment: '附件', manual: '人工确认', unknown: '待确认' }[item.extracted?.timeSource ?? 'unknown']}</Tag>
                  {item.applicationId && <Button size="small" type="link" onClick={() => navigate(`/applications/${item.applicationId}`)}>查看申请 #{item.applicationId} →</Button>}
                </Space>
                {!!item.extracted?.reviewReasons?.length && <Alert type="warning" showIcon message="需要复核" description={item.extracted.reviewReasons.join('；')} />}
                {item.extracted?.timeEvidence && <Typography.Paragraph style={{ margin: 0 }}>时间原文：{item.extracted.timeEvidence}</Typography.Paragraph>}
                {!!item.extracted?.attachments?.length && <Space wrap>{item.extracted.attachments.map((a, i) => <Tag key={i} color={a.status === 'parsed' ? 'cyan' : 'orange'}>{a.name} · {a.detail}</Tag>)}</Space>}
                {item.extracted?.summary && (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {item.extracted.summary}
                  </Typography.Text>
                )}
                {item.snippet && (
                  <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 0 }} ellipsis={{ rows: 1, expandable: true, symbol: '展开' }}>
                    正文：{item.snippet}
                  </Typography.Paragraph>
                )}
                {item.status === 'pending' && (
                  <Space>
                    <Button
                      size="small"
                      type="primary"
                      icon={<CheckOutlined />}
                      onClick={() => {
                        setEditItem(item);
                        setApplicationSearch(item.extracted?.company ?? '');
                        editForm.resetFields();
                        editForm.setFieldsValue({
                          recruitmentId: item.extracted?.recruitmentId,
                          scheduleAction: item.extracted?.schedule?.action ?? 'create',
                          eventRef: item.extracted?.schedule?.eventRef,
                          round: item.extracted?.schedule?.round,
                          venue: item.extracted?.schedule?.venue,
                          address: item.extracted?.schedule?.address,
                          room: item.extracted?.schedule?.room,
                          mode: item.extracted?.schedule?.mode,
                          timeKind: item.extracted?.schedule?.timeKind,
                          previousTime: item.extracted?.schedule?.previousTime ? dayjs(item.extracted.schedule.previousTime) : undefined,
                          company: item.extracted?.company ?? undefined,
                          eventType: item.extracted?.eventType ?? undefined,
                          eventTime: item.extracted?.eventTime ? dayjs(item.extracted.eventTime) : undefined,
                          eventTimeEnd: item.extracted?.eventTimeEnd ? dayjs(item.extracted.eventTimeEnd) : undefined,
                          positionTitle: item.extracted?.positionTitle ?? undefined,
                          summary: item.extracted?.summary ?? undefined,
                          confidence: item.extracted?.confidence ?? 0,
                        });
                      }}
                    >
                      应用到追踪
                    </Button>
                    <Button size="small" icon={<CloseOutlined />} onClick={() => dismissMutation.mutate(item.id)}>
                      忽略
                    </Button>
                  </Space>
                )}
              </Space>
            </Card>
          ))}
        </Space>
        <Pagination current={page} pageSize={20} total={data?.total ?? 0} onChange={setPage} showSizeChanger={false} showTotal={(total) => `共 ${total} 封`} style={{ marginTop: 16 }} />
      </Card>

      <Modal
        title="确认提取结果（可修改后应用）"
        style={{ top: 24 }}
        styles={{ body: { maxHeight: 'calc(100vh - 160px)', overflowY: 'auto', paddingRight: 4 } }}
        open={Boolean(editItem)}
        onCancel={() => setEditItem(null)}
        onOk={() => {
          const v = editForm.getFieldsValue();
          const extracted: EmailExtraction = {
            schedule: ['interview','written_test','assessment'].includes(v.eventType) ? {
              ...editItem?.extracted?.schedule,
              action: v.scheduleAction ?? 'create', eventRef: v.eventRef || undefined, round: v.round || undefined,
              venue: v.venue || undefined, address: v.address || undefined, room: v.room || undefined, mode: v.mode,
              timeKind: v.timeKind, previousTime: v.previousTime ? (v.previousTime as dayjs.Dayjs).format('YYYY-MM-DDTHH:mm:ss') : undefined,
            } : undefined,
            recruitmentId: v.recruitmentId || null,
            preparationTasks: editItem?.extracted?.preparationTasks,
            attachments: editItem?.extracted?.attachments,
            timeSource: 'manual',
            timeEvidence: editItem?.extracted?.timeEvidence,
            company: v.company || null,
            eventType: v.eventType || null,
            eventTime: v.eventTime ? (v.eventTime as dayjs.Dayjs).format('YYYY-MM-DDTHH:mm:ss') : null,
            eventTimeEnd: v.eventTimeEnd ? (v.eventTimeEnd as dayjs.Dayjs).format('YYYY-MM-DDTHH:mm:ss') : null,
            positionTitle: v.positionTitle || null,
            summary: v.summary || null,
            confidence: Number(v.confidence ?? 0),
          };
          if (editItem) applyMutation.mutate({ ...editItem, extracted });
        }}
        confirmLoading={applyMutation.isPending}
      >
        <Descriptions column={1} size="small" style={{ marginBottom: 8 }}>
          <Descriptions.Item label="邮件主题">{editItem?.subject}</Descriptions.Item>
        </Descriptions>
        {editItem?.extracted?.preparationTasks?.map((task, i) => <Typography.Paragraph key={i}>准备提醒：{task.title} · {formatDateTime(task.scheduledAt)}</Typography.Paragraph>)}
        <Form form={editForm} layout="vertical">
          <Form.Item name="company" label="公司">
            <Input placeholder="与库中公司名称精确匹配" />
          </Form.Item>
          <Form.Item name="targetApplicationId" label="关联申请" extra="缺岗位或编号时请明确选择；拒信只影响所选申请。搜索可查找更多记录。">
            <Select allowClear showSearch filterOption={false} onSearch={setApplicationSearch} placeholder="按职位编号 / 唯一岗位匹配" options={[{ value: 'new', label: '新建独立申请（不与已有申请合并）' }, ...(applicationChoices?.items ?? []).map(a => ({ value: a.id, label: `#${a.id} ${a.companyName} · ${a.positionTitle}` }))]} />
          </Form.Item>
          <Form.Item name="recruitmentId" label="职位编号（不是简历编号或验证码）"><Input /></Form.Item>
          <Form.Item name="eventType" label="事件类型">
            <Select allowClear options={Object.entries(EMAIL_EVENT_LABELS).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(previous,current)=>previous.eventType!==current.eventType}>
            {({getFieldValue})=>['interview','written_test','assessment'].includes(getFieldValue('eventType')) ? <>
          <Form.Item hidden name="expectedScheduleRevision"><Input /></Form.Item>
          <Form.Item name="targetScheduleId" label="关联日程 / 场次" extra="改期、取消或仅补地点时，请选原日程。缺少活动编号或原时间不会自动猜测。">
            <Select allowClear showSearch optionFilterProp="label" onChange={(id) => {
              const selected = scheduleChoices?.items.find(s => s.id === id);
              editForm.setFieldValue('expectedScheduleRevision', selected?.revision);
              if (selected) editForm.setFieldsValue({targetApplicationId:selected.applicationId,company:selected.companyName,eventType:selected.kind});
            }} options={[{value:'new',label:'新场次（不覆盖已有日程）'},...(scheduleChoices?.items ?? []).map(s=>({value:s.id,label:`#${s.id} ${s.companyName} · ${s.positionTitle} · ${s.data.round ?? s.kind} · ${s.data.eventTime ?? '时间待定'} · ${s.status === 'cancelled' ? '已取消' : '待参加'}`}))]} />
          </Form.Item>
          <Form.Item name="scheduleAction" label="日程操作"><Select options={[{value:'create',label:'首次安排 / 新场次'},{value:'update',label:'补充地点、考场等信息'},{value:'reschedule',label:'改期（无新时间则等待通知）'},{value:'cancel',label:'取消本场活动'},{value:'restore',label:'明确恢复已取消活动'}]} /></Form.Item>
          <Form.Item name="eventRef" label="活动编号（不是职位或个人编号）"><Input /></Form.Item>
          <Form.Item name="round" label="轮次 / 场次"><Input /></Form.Item>
          <Form.Item name="previousTime" label="原活动时间（改期关联依据）"><DatePicker showTime style={{width:'100%'}} /></Form.Item>
          <Form.Item name="mode" label="参加方式"><Select options={[{value:'unknown',label:'待确认'},{value:'offline',label:'线下'},{value:'online',label:'线上（不读取会议或考试链接）'}]} /></Form.Item>
          <Form.Item name="venue" label="考点 / 场所"><Input /></Form.Item>
          <Form.Item name="address" label="详细地址"><Input /></Form.Item>
          <Form.Item name="room" label="考场 / 房间"><Input /></Form.Item>
          <Form.Item name="timeKind" label="时间含义"><Select options={[{value:'start',label:'活动开始'},{value:'deadline',label:'完成或登录截止'},{value:'window',label:'有效期内自行完成'}]} /></Form.Item>
            </> : null}
          </Form.Item>
          <Form.Item name="eventTime" label="事件时间（未来时间将自动创建提醒）">
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="positionTitle" label="岗位">
            <Input />
          </Form.Item>
          <Form.Item name="eventTimeEnd" label="结束时间（可选，需晚于开始时间）"><DatePicker showTime style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="summary" label="摘要">
            <Input />
          </Form.Item>
          <Form.Item name="confidence" label="置信度 (0-1)">
            <Input type="number" min={0} max={1} step={0.1} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
