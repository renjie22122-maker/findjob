import {translate, useLanguage} from '../i18n';
import { Alert, Button, Card, Drawer, Col, Input, List, Row, Select, Table, Typography, Space, Tag, message } from 'antd';
import {
  FileTextOutlined,
  SearchOutlined,
  SyncOutlined,
  TrophyOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useOverview, useTrends } from '../hooks';
import StatCard from '../components/StatCard';
import { FunnelChart, StatusPieChart, TrendChart } from '../components/charts';
import StatusTag from '../components/StatusTag';
import { aiApi, applicationsApi, resumesApi, sourcesApi } from '../api';
import { formatDate, formatDateTime, PRIORITY_LABELS, PRIORITY_COLORS } from '../utils/constants';
import { ALL_STATUSES } from '../utils/constants';
import { useFiltersStore } from '../stores/filters';
import {http} from '../api/http';
import {STATUS_LABELS} from '../utils/constants';
import type { Application, Paginated, ActionListItem, Priority } from '../types';

export default function Dashboard() {
  useLanguage();

  const [category,setCategory]=useState<{kind:'status'|'stage';key:string}|null>(null);
  const [detailPage,setDetailPage]=useState(1);
  const choose=(kind:'status'|'stage',key:string)=>{setCategory({kind,key});setDetailPage(1);};
  const details=useQuery({queryKey:['stats','members',category,detailPage],enabled:!!category,queryFn:()=>http.get<Paginated<Application>>(`/stats/applications?${category!.kind}=${encodeURIComponent(category!.key)}&page=${detailPage}&pageSize=20`)});
  const categoryTitle=category?.kind==='status'?STATUS_LABELS[category.key as keyof typeof STATUS_LABELS]:({applied:'曾投递',interviewed:'曾进入笔试 / 面试',offer:'曾获得 Offer'}[category?.key??'']);
  const navigate = useNavigate();
  const applicationFilters = useFiltersStore();
  const { data: stats, isLoading } = useOverview();
  const { data: trendsData } = useTrends(30);

  const { data: recent } = useQuery({
    queryKey: ['applications', 'recent'],
    queryFn: () => applicationsApi.list({ page: 1, pageSize: 10, sortBy: 'updatedAt', sortOrder: 'desc' }),
  });

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card className="workspace-hero">
        <div className="workspace-heading"><div><Typography.Text className="eyebrow">{translate("求职工作台")}</Typography.Text><Typography.Title level={2}>{translate("下一步，清晰可见")}</Typography.Title><Typography.Paragraph type="secondary">{translate("集中查看申请进展、招聘通知和待办，优先处理临近的考试与面试。")}</Typography.Paragraph></div><Space wrap><Button type="primary" icon={<CalendarOutlined />} onClick={()=>navigate('/schedules')}>{translate("查看招聘日程")}</Button><Button onClick={()=>navigate('/email')}>{translate("邮件与短信")}</Button><Button onClick={()=>navigate('/applications')}>{translate("管理申请")}</Button></Space></div>
      </Card>
      <Row gutter={[16,16]}>
        <Col xs={12} md={6}>
          <StatCard
            title={translate("总投递")}
            value={stats?.total ?? 0}
            icon={<FileTextOutlined />}
            loading={isLoading}
            onClick={() => {
              applicationFilters.reset();
              navigate('/applications');
            }}
          />
        </Col>
        <Col xs={12} md={6}>
          <StatCard
            title={translate("进行中")}
            value={stats?.active ?? 0}
            icon={<SyncOutlined />}
            color="#1677ff"
            loading={isLoading}
            onClick={() => {
              applicationFilters.reset();
              applicationFilters.set({
                statuses: ALL_STATUSES.filter((status) => !['SIGNED', 'REJECTED', 'WITHDRAWN'].includes(status)),
              });
              navigate('/applications');
            }}
          />
        </Col>
        <Col xs={12} md={6}>
          <StatCard
            title={translate("Offer/签约")}
            value={stats?.offers ?? 0}
            icon={<TrophyOutlined />}
            color="#faad14"
            loading={isLoading}
            onClick={() => {
              applicationFilters.reset();
              applicationFilters.set({ statuses: ['OFFER', 'SIGNED'] });
              navigate('/applications');
            }}
          />
        </Col>
        <Col xs={12} md={6}>
          <StatCard title={translate("今日待办")} value={(stats?.todayCount ?? 0) + (stats?.overdueCount ?? 0)} icon={<CalendarOutlined />} color="#ff4d4f" loading={isLoading} onClick={() => navigate('/today')} />
        </Col>
      </Row>

      <Row gutter={[16,16]}>
        <Col xs={24} md={12}>
          <Card title={translate("状态分布")} size="small">
            <StatusPieChart onSelect={key=>choose('status',key)} stats={stats ?? { byStatus: {}, funnel: { applied: 0, interviewed: 0, offer: 0 } } as never} />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title={translate("转化漏斗（投递 → 面试 → Offer）")} size="small">
            <FunnelChart onSelect={key=>choose('stage',key)} stats={stats ?? ({ funnel: { applied: 0, interviewed: 0, offer: 0 } } as never)} />
          </Card>
        </Col>
      </Row>

      <Drawer title={`${categoryTitle??''} · ${details.data?.total??'…'} 条申请`} open={!!category} onClose={()=>setCategory(null)} width="min(760px,100vw)">
        <Typography.Paragraph type="secondary">{category?.kind==='stage'?'按历史阶段统计，包含后来已推进或被拒的申请；同一申请只计一次。':'按申请当前状态筛选。点击岗位查看详情。'}</Typography.Paragraph>
        {details.error&&<Alert type="error" message={details.error.message} action={<Button onClick={()=>void details.refetch()}>重试</Button>}/>}
        <Table rowKey="id" loading={details.isFetching} dataSource={details.data?.items??[]} scroll={{x:480}} pagination={{current:detailPage,total:details.data?.total??0,pageSize:20,showSizeChanger:false,onChange:setDetailPage}} columns={[
          {title:'公司',dataIndex:'companyName',render:value=><Typography.Text strong>{value}</Typography.Text>},
          {title:'岗位',render:(_,row:Application)=><Button type="link" style={{whiteSpace:'normal',height:'auto',padding:0,textAlign:'left'}} onClick={()=>navigate(`/applications/${row.id}`)}>{row.positionTitle}</Button>},
          {title:'当前状态',dataIndex:'status',render:value=><StatusTag status={value}/>}
        ]}/>
      </Drawer>
      <Card title={translate("近 30 天趋势")} size="small">
        <TrendChart trends={trendsData?.items ?? []} />
      </Card>

      <Card title={translate("最近更新")} size="small">
        <Table
          rowKey="id"
          size="small"
          loading={!recent}
          dataSource={recent?.items ?? []}
          pagination={false}
          scroll={{x:720}}
          onRow={(row) => ({ onClick: () => navigate(`/applications/${row.id}`), style: { cursor: 'pointer' } })}
          columns={[
            { title: translate("公司"), dataIndex: 'companyName', width: 180 },
            { title: translate("岗位"), dataIndex: 'positionTitle', ellipsis: true },
            { title: translate("状态"), dataIndex: 'status', width: 110, render: (s) => <StatusTag status={s} /> },
            {
              title: translate("优先级"),
              dataIndex: 'priority',
              width: 90,
              render: (p: Priority) => <Tag color={PRIORITY_COLORS[p]}>{PRIORITY_LABELS[p]}</Tag>,
            },
            { title: translate("更新时间"), dataIndex: 'updatedAt', width: 150, render: (v) => formatDateTime(v) },
          ]}
        />
      </Card>
      <QuickCrawlCard />
      <ActionListCard />
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>{translate("近 7 天新投递")}{stats?.recentApplied7d ?? 0} {translate("条 · 被拒")} {stats?.rejected ?? 0}{translate("条")}</Typography.Text>
    </Space>
  );
}

/** 网上自动找岗位：看板快捷抓取（关键词 → 牛客网抓取并导入） */
function QuickCrawlCard() {
  useLanguage();

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = useState('');
  const [recruitType, setRecruitType] = useState<'school' | 'intern'>('school');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);

  const handleCrawl = async () => {
    if (!keyword.trim()) {
      message.warning('请输入关键词，如：后端 / 前端 / 算法');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const crawled = await sourcesApi.crawl({
        sourceId: 'nowcoder',
        params: { keyword: keyword.trim(), recruitType, maxPages: 1 },
      });
      if (crawled.records.length === 0) {
        message.info('未抓到职位，换个关键词试试');
        return;
      }
      const imported = await sourcesApi.importRecords(crawled.records);
      setResult({ imported: imported.imported, skipped: imported.skipped });
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      message.success(`抓取 ${crawled.count} 条：新导入 ${imported.imported} 条，重复跳过 ${imported.skipped} 条`);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '抓取失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card
      title={translate("🔎 网上自动找岗位（牛客网）")}
      size="small"
      extra={
        <Button size="small" type="link" onClick={() => navigate('/sources')}>{translate("高级：定时自动抓取 + 批量 AI 匹配 →")}</Button>
      }
    >
      <Space wrap>
        <Input
          placeholder={translate("输入岗位关键词，如：后端")}
          style={{ width: 220 }}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onPressEnter={handleCrawl}
        />
        <Select
          style={{ width: 100 }}
          value={recruitType}
          onChange={setRecruitType}
          options={[
            { value: 'school', label: translate("校招") },
            { value: 'intern', label: translate("实习") },
          ]}
        />
        <Button type="primary" icon={<SearchOutlined />} loading={loading} onClick={handleCrawl}>{translate("抓取并导入")}</Button>
        {result && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{translate("上次：新导入")}{result.imported} {translate("条 · 去重跳过")} {result.skipped}{translate("条")}</Typography.Text>
        )}
      </Space>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 6, marginBottom: 0 }}>{translate("自动抓取牛客网职位（公司/薪资/城市/JD/截止日期）并去重入库，重复岗位自动跳过；「网上找岗位」页支持定时任务（每日/每周自动找）。")}</Typography.Paragraph>
    </Card>
  );
}

/** 今日投递清单：匹配度 × 紧急度（借鉴 Career-Search「AI 告诉你今天该投哪家」） */
function ActionListCard() {
  useLanguage();

  const navigate = useNavigate();
  const [resumeId, setResumeId] = useState<number | undefined>(undefined);
  const [items, setItems] = useState<ActionListItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  const { data: resumesData } = useQuery({ queryKey: ['resumes'], queryFn: resumesApi.list });
  const resumes = resumesData?.items ?? [];

  const handleLoad = async () => {
    if (!resumeId) return;
    setLoading(true);
    try {
      const r = await aiApi.actionList(resumeId, 10);
      setItems(r.items);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card
      title={translate("🎯 今日投递清单（匹配度 × 截止紧急度）")}
      size="small"
      extra={
        <Space>
          <Select
            size="small"
            placeholder={translate("选简历")}
            style={{ width: 160 }}
            value={resumeId}
            onChange={setResumeId}
            options={resumes.map((r) => ({ value: r.id, label: r.name }))}
          />
          <Button size="small" type="primary" loading={loading} disabled={!resumeId} onClick={handleLoad}>{translate("生成清单")}</Button>
        </Space>
      }
    >
      {items === null ? (
        <Typography.Text type="secondary">{translate("选择一份简历生成「今天该投哪家」清单")}</Typography.Text>
      ) : items.length === 0 ? (
        <Typography.Text type="secondary">{translate("没有可投递的待办岗位")}</Typography.Text>
      ) : (
        <List
          size="small"
          dataSource={items}
          renderItem={(m, i) => (
            <List.Item
              style={{ cursor: 'pointer' }}
              onClick={() => navigate(`/applications/${m.applicationId}`)}
            >
              <Space>
                <Typography.Text strong>#{i + 1}</Typography.Text>
                <Tag color={m.actionScore >= 70 ? 'green' : m.actionScore >= 50 ? 'blue' : 'default'}>{translate("综合")}{m.actionScore}
                </Tag>
                <Typography.Text>
                  {m.companyName} · {m.positionTitle}
                </Typography.Text>
                {m.deadline && <Tag color={m.urgency >= 30 ? 'red' : m.urgency > 0 ? 'orange' : 'default'}>{translate("截止")} {formatDate(m.deadline)}</Tag>}
              </Space>
            </List.Item>
          )}
        />
      )}
    </Card>
  );
}
