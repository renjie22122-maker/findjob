import {useState} from 'react';
import {Layout,Menu,Badge,Typography,Space,Select,Alert,Button,Drawer} from 'antd';
import {DashboardOutlined,FileTextOutlined,CalendarOutlined,GlobalOutlined,MailOutlined,SettingOutlined,ApartmentOutlined,IdcardOutlined,RobotOutlined,MenuOutlined} from '@ant-design/icons';
import {Link,Outlet,useLocation,useNavigate} from 'react-router-dom';
import {useToday,usePendingEmailCount} from '../hooks';
import {useAppTheme} from '../theme';
import {useLanguage} from '../i18n';
import {formatDateTime} from '../utils/constants';
const items=[
 ['/', '总览','Overview',<DashboardOutlined/>],['/today','待办','Tasks',<CalendarOutlined/>],['/schedules','日程','Schedule',<CalendarOutlined/>],['/applications','申请','Applications',<FileTextOutlined/>],['/assistant','助手','Assistant',<RobotOutlined/>],['/email','通知中心','Inbox',<MailOutlined/>],['/sources','发现岗位','Discover',<GlobalOutlined/>],['/recommendations','职位推荐','Matches',<RobotOutlined/>],['/companies','公司','Companies',<ApartmentOutlined/>],['/resumes','简历','Resumes',<IdcardOutlined/>],['/settings','设置','Settings',<SettingOutlined/>],
] as const;
export default function AppLayout(){
 const {t,language,setLanguage}=useLanguage(),{mode,setMode}=useAppTheme(),location=useLocation(),navigate=useNavigate();
 const [menuOpen,setMenuOpen]=useState(false);
 const {data:today,isError}=useToday(),{data:pending}=usePendingEmailCount();
 const active=items.find(i=>location.pathname===i[0]||(i[0]!=='/'&&location.pathname.startsWith(i[0])))??items[0];
 const navigateTo=(key:string)=>{navigate(key);setMenuOpen(false);};
 const menuItem=([key,zh,en,icon]:typeof items[number])=>({key,icon,label:key==='/email'&&pending?<Badge count={pending} size="small" offset={[12,0]}>{t(zh,en)}</Badge>:t(zh,en)});
 const menu=<Menu mode="inline" selectedKeys={[active[0]]} defaultOpenKeys={['/sources','/recommendations','/companies','/resumes'].includes(active[0])?['tools']:[]} onClick={({key})=>navigateTo(key)} items={[...items.filter(i=>['/','/today','/schedules','/applications','/assistant','/email'].includes(i[0])).map(menuItem),{key:'tools',icon:<ApartmentOutlined/>,label:t('更多工具','More tools'),children:items.filter(i=>['/sources','/recommendations','/companies','/resumes'].includes(i[0])).map(menuItem)},...items.filter(i=>i[0]==='/settings').map(menuItem)]}/>;
 const next=today?.today[0]??today?.upcoming[0];
 return <Layout className="app-shell career-shell">
  <aside className="desktop-sidebar"><Link to="/" className="brand"><span className="brand-symbol">↗</span><span>{t('赴程','CareerFlow')}<small>{t('每一步，都有方向','Your next chapter')}</small></span></Link>{menu}<p className="sidebar-note">{t('申请 · 日程 · 下一步','Applications · Plans · Progress')}</p></aside>
  <Layout>
   <Layout.Header className="workspace-header"><Space><Button className="mobile-menu" aria-label={t('打开菜单','Open menu')} icon={<MenuOutlined/>} onClick={()=>setMenuOpen(true)}/><div><Typography.Text type="secondary" className="header-brand">{t('赴程 · 求职工作台','CareerFlow · Workspace')}</Typography.Text><Typography.Title level={4} style={{margin:0}}>{t(active[1],active[2])}</Typography.Title></div></Space><Space><Select aria-label="Language / 语言" value={language} onChange={setLanguage} options={[{value:'zh',label:'中文'},{value:'en',label:'EN'}]} style={{width:82}}/><Select aria-label="界面主题" value={mode} onChange={setMode} style={{width:120}} options={[{value:'system',label:t('跟随系统','System')},{value:'light',label:t('☀ 浅色','☀ Light')},{value:'dark',label:t('☾ 暗色','☾ Dark')}]}/></Space></Layout.Header>
   <Layout.Content className="workspace-content">
    {isError&&<Alert type="warning" showIcon message={t('连接暂时中断','Connection interrupted')} description={t('当前显示的内容可能不是最新。网络恢复后会重新同步。','Displayed information may be out of date. We will refresh when the connection returns.')} style={{marginBottom:16}}/>}
    {next&&location.pathname==='/'&&<Alert className="next-task-banner" type="info" showIcon message={t('接下来','Up next')+' · '+(next.companyName??'')+' · '+formatDateTime(next.scheduledAt)} description={next.title} action={<Button onClick={()=>navigate('/today')}>{t('查看待办','View tasks')}</Button>}/>}
    <Outlet/>
   </Layout.Content>
  </Layout>
  <Drawer title={t('赴程','CareerFlow')} placement="left" width={280} open={menuOpen} onClose={()=>setMenuOpen(false)}>{menu}</Drawer>
  <nav className="mobile-tabbar" aria-label={t('主要导航','Primary navigation')}>{items.filter(i=>['/','/today','/schedules','/assistant'].includes(i[0])).map(([path,zh,en,icon])=><Link key={path} to={path} aria-current={active[0]===path?'page':undefined}>{icon}<span>{t(zh,en)}</span></Link>)}<button onClick={()=>setMenuOpen(true)}><MenuOutlined/><span>{t('更多','More')}</span></button></nav>
 </Layout>;
}
