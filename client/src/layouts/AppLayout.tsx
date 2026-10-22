import { Layout, Menu, Badge, Typography, Space, Select, theme, Alert, Button } from 'antd';
import { formatDateTime } from '../utils/constants';
import { useAppTheme } from '../theme';
import {
  DashboardOutlined,
  FileTextOutlined,
  CalendarOutlined,
  GlobalOutlined,
  MailOutlined,
  SettingOutlined,
  ApartmentOutlined,
  IdcardOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useToday } from '../hooks';
import { usePendingEmailCount } from '../hooks';

const { Sider, Content, Header } = Layout;

const MENU_ITEMS = [
  { key: '/', icon: <DashboardOutlined />, label: '看板' },
  { key: '/applications', icon: <FileTextOutlined />, label: '投递管理' },
  { key: '/today', icon: <CalendarOutlined />, label: '今日待办' },
  { key: '/schedules', icon: <CalendarOutlined />, label: '招聘日程' },
  { key: '/sources', icon: <GlobalOutlined />, label: '网上找岗位' },
  { key: '/recommendations', icon: <RobotOutlined />, label: '智能推荐' },
  { key: '/email', icon: <MailOutlined />, label: '通知中心' },
  { key: '/companies', icon: <ApartmentOutlined />, label: '公司管理' },
  { key: '/resumes', icon: <IdcardOutlined />, label: '简历管理' },
  { key: '/settings', icon: <SettingOutlined />, label: '设置' },
];

/** 顶部快捷入口（窄屏折叠菜单时依然可见） */
const QUICK_NAV: Array<{ path: string; label: string }> = [
  { path: '/applications', label: '📋 投递管理' },
  { path: '/sources', label: '🔎 网上找岗位' },
  { path: '/recommendations', label: '✨ 智能推荐' },
  { path: '/resumes', label: '📄 简历' },
  { path: '/today', label: '🔔 待办' },
  { path: '/schedules', label: '📅 日程' },
];

export default function AppLayout() {
  const { mode, setMode } = useAppTheme();
  const { token } = theme.useToken();
  const location = useLocation();
  const navigate = useNavigate();
  const { data: today } = useToday();
  const { data: pendingEmails } = usePendingEmailCount();

  const todayCount = (today?.today.length ?? 0) + (today?.overdue.length ?? 0);
  const selectedKey = MENU_ITEMS.find((m) => location.pathname === m.key || (m.key !== '/' && location.pathname.startsWith(m.key)))?.key ?? '/';

  return (
    <Layout className="app-shell" style={{ minHeight: '100vh' }}>
      <Sider breakpoint="lg" collapsedWidth="0" width={200}>
        <div style={{ color: '#fff', fontSize: 18, fontWeight: 700, textAlign: 'center', padding: '18px 8px' }}>
          🎯 FindJob
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          onClick={({ key }) => navigate(key)}
          items={MENU_ITEMS.map((m) => ({
            ...m,
            label:
              m.key === '/today' && todayCount > 0 ? (
                <Badge count={todayCount} size="small" offset={[10, 0]}>
                  {m.label}
                </Badge>
              ) : m.key === '/email' && (pendingEmails ?? 0) > 0 ? (
                <Badge count={pendingEmails} size="small" offset={[10, 0]}>
                  {m.label}
                </Badge>
              ) : (
                m.label
              ),
          }))}
        />
      </Sider>
      <Layout>
        <Header style={{ background: token.colorBgContainer, padding: '12px 24px', gap: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', height: 'auto', minHeight: 64, lineHeight: 'normal' }}>
          <Space align="center" wrap>
            <Typography.Title level={4} style={{ margin: 0 }}>
              FindJob · 求职工作台
            </Typography.Title>
            {QUICK_NAV.map((q) => (
              <Link key={q.path} to={q.path} style={{ fontSize: 13 }}>
                {q.label}
              </Link>
            ))}
          </Space>
          <Select aria-label="界面主题" value={mode} onChange={setMode} style={{ width: 132 }} options={[{ value: 'system', label: '跟随系统' }, { value: 'light', label: '☀ 浅色' }, { value: 'dark', label: '☾ 暗色' }]} />
        </Header>
        <Content style={{ margin: 16, minWidth: 0 }}>
          {location.pathname !== '/today' && ((today?.today.length ?? 0) + (today?.upcoming.length ?? 0) > 0) && <Alert style={{ marginBottom: 12 }} showIcon type="warning" message={`待办提醒：今天 ${today?.today.length ?? 0} 项，未来 3 天 ${today?.upcoming.length ?? 0} 项`} description={(() => { const next = today?.today[0] ?? today?.upcoming[0]; return next ? `${next.companyName ?? ''} · ${next.title} · ${formatDateTime(next.scheduledAt)}` : ''; })()} action={<Button size="small" onClick={() => navigate('/today')}>查看全部</Button>} />}
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
