import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
const assets = new URL('../../android/app/src/main/assets/', import.meta.url);
const server = createServer((req, res) => { const file = req.url === '/' ? 'index.html' : req.url.slice(1); if (!['index.html', 'app.js', 'style.css'].includes(file)) {
    res.writeHead(404).end();
    return;
} res.setHeader('Content-Type', file.endsWith('js') ? 'text/javascript' : file.endsWith('css') ? 'text/css' : 'text/html'); res.end(readFileSync(new URL(file, assets))); }).listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { const schedule = { id: 1, company: 'Example', role: 'Engineer', ref: 'JOB-1', stage: 'interview', round: 'Technical interview', kind: 'start', start: '2026-11-05T14:00:00', end: '2026-11-05T16:00:00', location: 'Room A', done: false, cancelled: false, sources: [{ source: 'email', body: '<script>alert(1)</script> original evidence', received: 1 }, { source: 'sms', body: 'Same event', received: 2 }] }; const state = { configured: true, auto: true, exact: false, notifications: false, mailConfigured: true, mailStatus: 'ok', lastSync: 1, history: [], items: [], schedules: [schedule, { ...schedule, id: 2, company: 'Window', kind: 'window' }] }; window.CareerFlow = { state: () => JSON.stringify(state), complete: (id, value) => { state.schedules.find(x => x.id === id).done = value; }, notificationPermission: () => { }, alarmPermission: () => { }, syncMail: () => { }, saveMail: () => true, disableMail: () => { }, automatic: () => { }, importRecent: () => '0', saveKey: () => { }, analyze: () => { } }; });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByText('Example · Engineer', { exact: true }).waitFor();
    assert.equal(await page.locator('.conflict').count(), 0, 'Flexible windows must not conflict');
    await page.getByRole('button', { name: '标记完成', exact: true }).first().click();
    assert.equal(await page.locator('.complete').count(), 1);
    await page.getByText('关联依据 · 2', { exact: true }).first().click();
    await page.getByText('<script>alert(1)</script> original evidence', { exact: true }).first().waitFor();
    await page.getByRole('button', { name: 'EN', exact: true }).click();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByText('Other mailboxes · IMAP', { exact: true }).click();
    await page.getByText('Incremental email sync', { exact: true }).waitFor();
    await page.getByRole('button', { name: '主题 / Theme', exact: true }).click();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
    assert.deepEqual(errors, []);
    mkdirSync('server/data/ui-review', { recursive: true });
    await page.screenshot({ path: 'server/data/ui-review/android-settings.png', fullPage: true });
    await page.getByRole('button', { name: 'Schedule', exact: true }).click();
    await page.screenshot({ path: 'server/data/ui-review/android-home-dark.png', fullPage: true });
    console.log('Android UI passed: bilingual, completion, evidence escaping, window conflicts, mobile width.');
}
finally {
    await browser.close();
    await new Promise(r => server.close(r));
}
