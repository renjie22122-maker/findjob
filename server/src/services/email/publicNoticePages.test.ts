import {afterEach,expect,it,vi} from 'vitest';
import {approvedPublicPage,publicIPv4,publicPageText,publicNoticeExcerpt,PAGE_MARKER} from './publicNoticePages.js';
import {attachEvidence} from './evidence.js';
afterEach(()=>vi.unstubAllEnvs());
it('公开页授权精确到URL，不放行个人参数、动作路径或其他页面',()=>{
 const url='https://example.org/news/2027.html';
 expect(approvedPublicPage(url,[url])?.href).toBe(url);
 for(const value of ['http://example.org/news','https://example.org/news?token=x','https://example.org/start','https://example.org/%63onfirm','https://user:pass@example.org/news'])expect(approvedPublicPage(value,[value])).toBeNull();
 expect(approvedPublicPage('https://example.org/other',[url])).toBeNull();
});
it('拒绝本地、私网、保留地址与IPv6，避免SSRF',()=>{
 for(const ip of ['127.0.0.1','10.1.1.1','169.254.169.254','172.16.0.1','192.168.0.1','100.77.10.54','198.18.1.1','224.0.0.1','::1','::ffff:127.0.0.1'])expect(publicIPv4(ip)).toBe(false);
 expect(publicIPv4('8.8.8.8')).toBe(true);
});
it('首次访问生效的链接即使配置URL也不请求；用途不明不访问',async()=>{
 vi.stubEnv('CAREERFLOW_PUBLIC_NOTICE_URLS','["https://invalid.invalid/notice"]');
 expect(await publicNoticeExcerpt('作答有效期见链接，打开即开始考试 https://invalid.invalid/notice','')).toBe('');
 vi.stubEnv('CAREERFLOW_PUBLIC_NOTICE_URLS','[]');
 expect(await publicNoticeExcerpt('截止时间见 https://invalid.invalid/notice','')).toBe('');
});
it('公开页只保留文字，登录/表单/考试页面和过大正文不作为依据',()=>{
 expect(publicPageText('<p>截止2099年11月5日14:00</p><script>secret</script><img src="x">')).toContain('截止2099年11月5日14:00');
 expect(publicPageText('<script>secret</script>正常通知')).not.toContain('secret');
 for(const html of ['<input type=password>','第1题请选择','剩余答题时间30分钟','x'.repeat(8001)])expect(()=>publicPageText(html)).toThrow();
});
it('公开页中的日期标明网页来源，不冒充邮件正文',()=>{
 const quote='截止时间2099年11月5日14:00';
 const raw={messageId:'public',subject:'测评',sender:'HR',receivedAt:'2099-11-01',snippet:'时间详见公开通知'+PAGE_MARKER+quote};
 const result=attachEvidence({company:'样例',positionTitle:'样例岗位',eventType:'assessment',confidence:.95,summary:'测评',eventTime:'2099-11-05T14:00:00',timeEvidence:quote},raw);
 expect(result.timeSource).toBe('web');expect(result.reviewReasons).toEqual([]);
});

it('说明页上的开始按钮不阻断提取时间，也不会保留交互表单',()=>{
 const text=publicPageText('<p>作答截止2099年11月8日17:00</p><p>笔试不提供二次机会</p><form action="/start"><button>开始答题</button></form>');
 expect(text).toContain('2099年11月8日17:00');expect(text).not.toContain('开始答题');
});
