import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

process.env.FINDJOB_DB_PATH = ':memory:';
process.env.EMAIL_AUTO_ANALYZE = '0';
const { createApp } = await import('../dist/index.js');
const { getDb, closeDb } = await import('../dist/db/connection.js');
const { applyEmailItem } = await import('../dist/services/email/email.service.js');
const server = createApp().listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const out = fileURLToPath(new URL('../data/ui-review/', import.meta.url));
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const [index, type] of ['applied', 'interview', 'written_test'].entries()) {
    const extraction = { company: '示例科技', eventType: type, eventTime: type === 'written_test' ? null : '2026-10-15T14:00:00', positionTitle: '后端工程师', summary: '邀请参加秋季校园招聘', confidence: 0.95, timeSource: type === 'applied' ? 'received' : 'attachment', timeEvidence: '2026年10月15日 14:00', attachments: [{ name: '面试安排.pdf', status: 'parsed', detail: '已提取 200 字符' }], reviewReasons: type === 'written_test' ? ['未确定活动时间，请核对原邮件或附件后填写'] : [] };
    const id = Number(getDb().prepare("INSERT INTO email_items (message_id,subject,received_at,snippet,extracted,status,created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)").run(`example-${index}`, `【示例科技】${type === 'applied' ? '投递确认' : type === 'interview' ? '面试邀请' : '笔试通知'}`, '2026-10-12T08:00:00Z', '请查看附件中的考试安排；链接已隐藏，请本人在原邮箱查看。', JSON.stringify(extraction), '2026-10-12T16:00:00').lastInsertRowid);
    if (index === 0) applyEmailItem(id, undefined, { createIfMissing: true, markApplied: true });
  }
  await page.goto(base + '/email');
  await page.getByText('【示例科技】面试邀请', { exact: true }).waitFor();
  await page.locator('.ant-select').filter({ has: page.getByRole('combobox', { name: '界面主题' }) }).click();
  await page.getByText('☾ 暗色', { exact: true }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await page.screenshot({ path: out + 'email-dark.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: '应用到追踪' }).first().click();
  await page.getByText('确认提取结果（可修改后应用）', { exact: true }).waitFor();
  await page.getByLabel('关联申请').click();
  await page.getByText('新建独立申请（不与已有申请合并）', { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByLabel('职位编号（不是简历编号或验证码）').fill('DEMO-101');
  await page.screenshot({ path: out + 'modal-dark.png', animations: 'disabled' });
  await page.getByRole('button', { name: '取 消' }).click();
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await page.goto(base);
  await page.locator('canvas').first().waitFor();
  await page.screenshot({ path: out + 'dashboard-dark.png', fullPage: true, animations: 'disabled' });
  await page.locator('.ant-select').filter({ has: page.getByRole('combobox', { name: '界面主题' }) }).click();
  await page.getByText('☀ 浅色', { exact: true }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await page.screenshot({ path: out + 'dashboard-light.png', fullPage: true, animations: 'disabled' });
  await page.locator('.ant-select').filter({ has: page.getByRole('combobox', { name: '界面主题' }) }).click();
  await page.getByText('跟随系统', { exact: true }).click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + '/email');
  await page.getByText('【示例科技】面试邀请', { exact: true }).waitFor();
  await page.screenshot({ path: out + 'email-mobile.png', fullPage: true, animations: 'disabled' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, 'Mobile page should not overflow horizontally');
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
    await page.setViewportSize(viewport);
    await page.goto(base);
    await page.locator('.trend-chart canvas').waitFor();
    await page.waitForFunction(()=>{const legend=document.querySelector('.trend-chart .chart-legend').getBoundingClientRect();const plot=document.querySelector('.trend-chart .chart-plot').getBoundingClientRect();return legend.bottom<=plot.top+1;});
    const toggle=page.locator('.trend-chart').getByRole('button',{name:'投递',exact:true});
    await toggle.click();assert.equal(await toggle.getAttribute('aria-pressed'),'false');await toggle.click();
    await page.screenshot({path:out+`dashboard-layout-${viewport.width}.png`,fullPage:true,animations:'disabled'});
  }
  for(const route of ['/applications','/companies','/today','/sources','/recommendations','/resumes','/settings','/schedules']) {
    await page.goto(base+route);
    await page.locator('.ant-layout-content').waitFor();
    await page.waitForFunction(()=>!document.querySelector('[role="status"][aria-live="polite"]'));
    try {await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth+2,{},{timeout:10000});}catch(error){await page.screenshot({path:out+'overflow-diagnostic.png',fullPage:true});console.log('OVERFLOW',route,await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+2).slice(0,15).map(e=>({tag:e.tagName,cls:e.className,width:e.getBoundingClientRect().width}))));throw error;}
  }
  assert.deepEqual(errors, []);
  console.log('UI smoke passed: dark/light/system, persistence, modal, charts, mobile, no runtime errors.');
} finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); closeDb(); }
