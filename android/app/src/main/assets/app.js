let english = localStorage.getItem('language') === 'en', active = 'home';
const t = (zh, en) => english ? en : zh, $ = id => document.getElementById(id), node = (tag, text) => { const n = document.createElement(tag); n.textContent = text; return n; }, button = (label, fn) => { const n = node('button', label); n.onclick = fn; return n; }, feedback = text => { $('feedback').textContent = text; clearTimeout(feedback.timer); feedback.timer = setTimeout(() => $('feedback').textContent = '', 4500); };
const time = v => { if (!v)
    return t('待通知', 'Not announced'); const d = new Date(v + '+08:00'); return Number.isNaN(d.getTime()) ? v : new Intl.DateTimeFormat(english ? 'en-GB' : 'zh-CN', { timeZone: 'Asia/Shanghai', month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d); };
let lastSnapshot = '';
let theme = localStorage.getItem('theme') || 'system';
function applyTheme() { if (theme === 'system')
    delete document.documentElement.dataset.theme;
else
    document.documentElement.dataset.theme = theme; $('theme').textContent = theme === 'dark' ? '☾' : theme === 'light' ? '☀' : '◐'; CareerFlow.theme?.(theme); }
const stage = value => ({ written_test: t('笔试', 'Written test'), interview: t('面试', 'Interview'), assessment: t('测评', 'Assessment'), offer: 'Offer', applied: t('投递', 'Application'), other: t('其他安排', 'Other') }[value] || value);
function overlaps(a, b) { if (a.kind !== 'start' || b.kind !== 'start' || a.done || b.done || a.cancelled || b.cancelled)
    return false; const stamp = v => Date.parse(v + '+08:00'), x = stamp(a.start), y = stamp(b.start); if (!a.end || !b.end)
    return x === y; return x < stamp(b.end) && y < stamp(a.end); }
function render() {
    lastSnapshot = CareerFlow.state();
    const state = JSON.parse(lastSnapshot);
    document.documentElement.lang = english ? 'en' : 'zh-CN';
    $('brand').textContent = t('赴程', 'CareerFlow');
    $('lang').textContent = english ? '中文' : 'EN';
    $('intro').textContent = t('专注下一场，其他交给赴程。', 'Focus on your next step.');
    applyTheme();
    $('tabs').replaceChildren();
    for (const [key, zh, en] of [['home','总览','Overview'],['schedule', '待办', 'Tasks'],['calendar','日历','Calendar'], ['inbox', '通知', 'Inbox'], ['settings', '设置', 'Settings']]) {
        const b = button(t(zh, en), () => { active = key; render(); window.scrollTo(0,0); });
        b.setAttribute('aria-label', t(zh, en));
        b.replaceChildren(node('span', ({home:'⌂',schedule:'✓',calendar:'▦',inbox:'✉',settings:'⚙'})[key]), node('span', t(zh, en)));
        b.firstChild.className = 'nav-icon';
        b.setAttribute('aria-selected', active === key);
        $('tabs').append(b);
        $(key + 'Panel').hidden = active !== key;
    }
    const labels = { overviewLabel: ["YOUR NEXT CHAPTER", "YOUR NEXT CHAPTER"], localLabel: ["本机运行", "On device"], setupReminders: ["去设置", "Set up"], refreshInbox: ["刷新", "Refresh"], reminderTitle: ["提醒与通知", "Reminders"], aiTitle: ["AI 分析", "AI analysis"], smsTitle: ["短信接入", "SMS access"], imapLabel: ["其他邮箱 · IMAP", "Other mailboxes · IMAP"], syncTitle: ["同步状态", "Sync status"], outlookTitle: ["Outlook / Microsoft 365", "Outlook / Microsoft 365"], outlookHelp: ["使用电脑端相同的微软应用客户端 ID；申请授权后由你本人前往微软官网输入设备代码。应用只读取收件箱，并自动续期令牌。", "Use the same Microsoft application client ID as your desktop configuration. Request a code, then personally authorize it on Microsoft’s website. Inbox access is read-only; tokens are renewed automatically."], outlookStart: ["获取授权代码", "Request authorization code"], outlookOpen: ["打开微软授权页面", "Open Microsoft authorization page"], outlookCancel: ["取消授权请求", "Cancel authorization request"], testReminder: ['10 秒后测试提醒', 'Test reminder in 10 seconds'], scheduleTitle: ['下一程，心中有数', 'Your next step, in view'], inboxTitle: ['邮件与短信', 'Email & SMS'], settingsTitle: ['自动化设置', 'Automation'], privacy: ['数据与密钥保存在本机，凭据加密；仅将过滤、脱敏后的招聘内容发给 DeepSeek。不打开招聘链接，不代做身份验证。', 'Data stays on this phone; credentials are encrypted. Only filtered, redacted recruitment text goes to DeepSeek. Recruitment links and authentication flows are never opened.'], saveKey: ['保存 API 密钥', 'Save API key'], autoLabel: ['自动接收招聘短信', 'Receive recruitment SMS automatically'], import: ['检查最近 200 条短信', 'Check latest 200 SMS'], mailTitle: ['邮箱增量同步', 'Incremental email sync'], mailHelp: ['支持 IMAP SSL（993）与邮箱授权码。首次检查最近 200 封，之后按 UID 增量同步；联网时约每 30 分钟调度，可能受省电影响。Outlook 请使用上方微软授权。附件仅解析有文本的 PDF、DOCX、XLSX、文本与日历，图片或失败附件需查看原件。', 'IMAP SSL (993) with an app password. Starts with the latest 200 messages, then syncs by UID. Background checks are scheduled every 30 minutes; battery policies may delay them. For Outlook, use Microsoft authorization above. Text PDF, DOCX, XLSX, text and calendar attachments are parsed; images and failed attachments need manual review.'], saveMail: ['保存并同步', 'Save & sync'], sync: ['立即同步', 'Sync now'], disableMail: ['暂停邮箱同步', 'Pause email sync'], historyTitle: ['处理记录', 'Change history'], notifications: ['允许通知', 'Allow notifications'], alarms: ['允许精确提醒', 'Allow exact alarms'] };
    for (const [id, pair] of Object.entries(labels))
        $(id).textContent = t(...pair);
    $('permissions').textContent = t('提醒：', 'Reminders: ') + (state.notifications ? t('通知已开启', 'notifications enabled') : t('通知未开启', 'notifications disabled')) + ' · ' + (state.exact ? t('精确闹钟已允许', 'exact alarms allowed') : t('精确闹钟未允许，可能延迟', 'exact alarms unavailable; delivery may be delayed'));
    $('auto').checked = state.auto;
    $('mailStatus').textContent = (state.mailConfigured ? t('邮箱已配置', 'Mailbox configured') : t('尚未配置邮箱', 'No mailbox configured')) + ' · ' + ({ syncing:t('正在同步','Syncing'),catchup:t('正在补齐历史邮件','Catching up'),ok: t('同步成功', 'Sync succeeded'), authentication: t('邮箱授权失效，请重新连接', 'Mailbox authorization expired; reconnect'), connection: t('同步失败，将自动重试', 'Sync failed; will retry'), idle: t('等待同步', 'Awaiting sync') }[state.mailStatus] || state.mailStatus) + (state.lastSync ? ' · ' + new Date(state.lastSync).toLocaleString() : '');
    renderOAuth();
    $('settingsPermissions').textContent = $('permissions').textContent;
    document.querySelector('.permission-hint').hidden = state.notifications && state.exact;
    $('apiState').textContent = state.configured ? t('密钥已加密保存', 'Key stored securely') : t('配置后自动分析招聘通知', 'Configure to analyze recruitment messages');
    renderMobile(state);
    $('inbox').replaceChildren();
    if (!state.items.length) {
        const empty = node('div', t('还没有招聘通知。新的邮件和短信会显示在这里。', 'No recruitment messages yet. New email and SMS will appear here.'));
        empty.className = 'empty-state';
        $('inbox').append(empty);
    }
    for (const item of state.items.filter(item => inboxFilter === "all" || (inboxFilter === "pending" ? ["pending","analyzing","retrying","failed"].includes(item.state) : item.state === inboxFilter))) {
        const card = node('article', '');
        if (item.state === 'review')
            card.className = 'review';
        card.append(node('small', item.source + ' · ' + new Date(item.received).toLocaleString()), node('p', item.analysis?.summary || ({failed:t('分析失败，可重试','Analysis failed; retry available'),analyzing:t('AI 正在自动整理','AI is organizing this message'),retrying:t('连接暂时失败，正在重试','Connection issue; retrying')}[item.state] || t('等待后台分析','Queued for analysis'))));
        const details = node('details', '');
        details.append(node('summary', t('查看原文', 'View source')), node('pre', item.body));
        card.append(details);
        if (item.state === 'review') {
            const reviewPanel=node('details','');reviewPanel.append(node('summary',t('证据不足 · 展开可选修正','Insufficient evidence · optional correction')));card.append(reviewPanel);
            reviewPanel.append(node('p', t('自动核查尚未找到唯一依据；新通知到达后会再次检查，也可在此补充。', 'No unique evidence yet. New messages trigger another check; you can optionally add details here.')));
            for (const [index, e] of (item.analysis?.events || []).entries()) {
                reviewPanel.append(node('pre', [e.company, e.role, e.ref, e.stage, time(e.start), time(e.end), e.location, e.action, e.evidence].filter(Boolean).join('\n')));
                const edits = {};
                for (const [field, label] of [['start', t('开始时间（北京时间）', 'Start (UTC+8)')], ['end', t('结束／截止时间', 'End / deadline')], ['location', t('地点／考场', 'Location / room')]]) {
                    const wrap = node('label', label), input = document.createElement('input');
                    input.type = field === 'location' ? 'text' : 'datetime-local';
                    input.value = e[field] || '';
                    wrap.append(input);
                    reviewPanel.append(wrap);
                    edits[field] = input;
                }
                const select = document.createElement('select');
                select.setAttribute('aria-label', t('关联日程', 'Link schedule'));
                select.append(new Option(t('新建独立日程', 'Create separate schedule'), '0'));
                for (const s of state.schedules)
                    select.append(new Option('#' + s.id + ' ' + s.company + ' ' + s.role + ' ' + s.stage + ' ' + time(s.start), s.id));
                reviewPanel.append(select, button(t('确认此场安排', 'Confirm this event'), () => { if (confirm(t('已核对时间、地点与场次，确认应用？', 'Have you verified the time, location and event? Apply changes?'))) {
                    feedback(CareerFlow.resolve(item.id, index, Number(select.value), JSON.stringify(Object.fromEntries(Object.entries(edits).map(([key, input]) => [key, input.value])))) ? t('已应用并记录', 'Applied and recorded') : t('未应用：请检查是否已关联或时间缺失', 'Not applied: check existing link and missing dates'));
                    render();
                } }));
            }
        }
        card.append(button(t('重新分析', 'Analyze again'), () => { CareerFlow.analyze(item.id); feedback(t('已加入后台队列', 'Queued for background analysis')); }));
        $('inbox').append(card);
    }
    $('history').replaceChildren(...state.history.map(h => node('p', new Date(h.at).toLocaleString() + ' · ' + h.detail)));
}

function renderOAuth() {
    const state = JSON.parse(CareerFlow.oauthState());
    const remaining = Math.max(0, Math.ceil((state.oauthExpires - Date.now()) / 1000));
    const usable = state.oauthCanOpen && remaining > 0;
    $('outlookStatus').textContent = ({idle:t('尚未授权','Not authorized'),requesting:t('正在申请设备代码','Requesting device code'),pending:t('代码已就绪，请复制后到微软官方页面粘贴','Code ready. Copy it and paste on Microsoft’s page.'),connected:t('授权成功，正在同步邮箱','Authorized; syncing email'),expired:t('代码已过期，请重新获取','Code expired; request a new one'),restart_required:t('旧版授权请求无法继续，请重新获取代码','Please request a new code after upgrading'),invalid_verification_uri:t('返回的授权地址未通过校验，请检查应用配置','Verification address was not recognized; check app configuration'),failed:t('授权失败，请重新获取代码或检查应用配置','Authorization failed; request a new code or check settings'),connection:t('网络暂时不可用，正在重试','Network unavailable; retrying')}[state.oauthStatus] || '');
    $('outlookStart').disabled = state.oauthStatus === 'requesting' || (state.oauthStatus === 'pending' && usable);
    $('outlookCopy').textContent = t('复制授权代码','Copy code');
    $('outlookCopy').disabled = !usable;
    $('outlookOpen').disabled = !usable;
    $('outlookCodeBox').hidden = !usable;
    $('outlookCode').textContent = usable ? state.oauthCode : '';
    $('outlookExpiry').textContent = usable ? t('剩余有效期 ','Expires in ') + Math.floor(remaining / 60) + ':' + String(remaining % 60).padStart(2, '0') : '';
}

$('theme').onclick = () => { theme = theme === 'system' ? 'dark' : theme === 'dark' ? 'light' : 'system'; localStorage.setItem('theme', theme); applyTheme(); };
$('setupReminders').onclick = () => { active = 'settings'; render(); window.scrollTo(0, 0); };
$('refreshInbox').onclick = () => render();
$('outlookStart').onclick = () => { feedback(CareerFlow.startOutlook($('clientId').value.trim(), $('tenant').value.trim(), $('outlookUser').value.trim()) ? t('正在请求授权代码，请稍候', 'Requesting a code; please wait') : t('请检查客户端 ID、租户和邮箱', 'Check client ID, tenant and email')); render(); };
$('outlookCopy').onclick = () => { feedback(CareerFlow.copyOutlookCode() ? t('已复制，请在微软页面粘贴，不必手输','Copied. Paste on Microsoft’s page; no typing needed.') : t('代码已失效，请重新获取','Code expired; request a new one')); renderOAuth(); };
$('outlookOpen').onclick = () => { if(!CareerFlow.openMicrosoft())feedback(t('请先获取有效代码','Request a valid code first')); };
$('outlookCancel').onclick = () => { CareerFlow.cancelOutlook(); render(); };
$('lang').onclick = () => { english = !english; localStorage.setItem('language', english ? 'en' : 'zh'); render(); };
$('saveKey').onclick = () => { if ($('key').value.length < 10)
    return feedback(t('请填写完整密钥', 'Enter a complete API key')); CareerFlow.saveKey($('key').value); $('key').value = ''; feedback(t('密钥已加密保存', 'Key saved securely')); };
$('auto').onchange = () => CareerFlow.automatic($('auto').checked);
$('import').onclick = () => { const result = CareerFlow.importRecent(); feedback(result === 'permission' ? t('授权后请再次检查', 'Grant access, then check again') : t('新增：', 'Added: ') + result); render(); };
$('saveMail').onclick = () => { if (CareerFlow.saveMail($('host').value.trim(), $('user').value.trim(), $('password').value, true)) {
    $('password').value = '';
    feedback(t('已保存，正在后台同步', 'Saved; syncing in background'));
}
else
    feedback(t('请填写完整邮箱配置', 'Complete the mailbox settings')); };
$('sync').onclick = () => { CareerFlow.syncMail(); feedback(t('同步已排队', 'Sync queued')); };
$('disableMail').onclick = () => { CareerFlow.disableMail(); feedback(t('已暂停后续同步', 'Future syncs paused')); };
$('testReminder').onclick = () => { CareerFlow.testReminder(); feedback(t('请锁屏等待测试通知；未允许精确闹钟时可能延迟', 'Lock the screen and wait for the test notification; exact alarm access avoids scheduling delay')); };
$('notifications').onclick = () => CareerFlow.notificationPermission();
$('alarms').onclick = () => CareerFlow.alarmPermission();
setInterval(() => { if (!document.hidden && (!document.querySelector('dialog[open]') && !document.querySelector('.page-panel:not([hidden]) article details[open]') && !['INPUT', 'SELECT','TEXTAREA'].includes(document.activeElement?.tagName)) && CareerFlow.state() !== lastSnapshot)
    render(); }, 15000);

setInterval(() => { if (!document.hidden && active === "settings") renderOAuth(); }, 1000);
document.addEventListener("visibilitychange", () => { if(!document.hidden){renderOAuth();if(!document.querySelector('dialog[open]')&&!['INPUT','SELECT'].includes(document.activeElement?.tagName))render();} });
