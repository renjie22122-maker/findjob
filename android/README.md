# 赴程 · CareerFlow Android

独立运行的 Android 应用。手机负责保存通知、通过 IMAP 同步邮箱、接收短信、调用 DeepSeek、关联日程和调度系统通知，无需电脑或自建服务器。

## 安装后设置

1. 在「设置」填写自己的 DeepSeek API Key，密钥使用 Android Keystore 加密保存，不打包进 APK。
2. 开启自动接收短信，授予 SMS 权限；可检查最近 200 条历史短信。验证码和无关短信在入库前排除。RCS、微信等应用通知不属于 SMS。
3. 填写 IMAP 主机、邮箱和授权码（SSL 993）。首次检查最近 200 封；随后按账号、UIDVALIDITY、UID 游标增量同步。可点「立即同步」，定期任务约每 30 分钟调度。Outlook / Microsoft 365 使用专用授权区：填写与电脑端相同的微软应用 Client ID、租户和邮箱，申请设备代码后由用户本人打开微软官网授权；访问令牌和续期令牌加密保存，后续自动刷新。
4. 在「设置」允许通知和精确闹钟。未授权精确闹钟时使用非精确提醒，页面会显示可能延迟。建议在三星电池设置中允许本应用后台运行。

首次安装尚无电脑端历史数据；手机和桌面数据库目前独立，未实现双向同步。不要把桌面已完成状态当作已自动迁移到手机。

## 时间与关联

- 日程统一以北京时间（Asia/Shanghai）解析、显示与提醒。省略年份时仅允许按收件日期校验前后半年内的日期；缺失月日、时间或场次证据时保留待确认，不能仅凭模型补写。
- 公司、岗位／场次编号、阶段和时间共同匹配；同公司不同岗位编号、多轮次、多场考试分别保留。主阶段用于归类，`round` 保存邮件原文中的具体阶段名。
- 关联成功后原邮件与短信作为证据展示。同场后续通知补充时间地点；改期更新原日程，取消停止提醒。旧通知不会覆盖较新的安排，完成状态不因重新分析而清空。
- 几天内自行作答的窗口按截止时间提醒，不与固定场次判冲突。固定场次时间重叠显示红色；结束时间未知时不凭空假设考试时长。
- 默认在目标时间前一天、前一小时和到点提醒。窗口用结束时间，固定场次用开始时间。同一日程同一提醒时刻只投递一次。已完成和已取消日程不提醒。
- 有歧义时在通知原文旁选择已有日程或新建，确认操作保存记录。缺失时间仍需补充来源证据后重新分析；系统不会自动访问考试链接补齐。

## 邮件与安全边界

IMAP 收件箱只读访问，不标已读、不删邮件、不访问邮件或附件中的 URL。按大小、递归深度和页数限制提取正文、文本 PDF、DOCX、XLSX、纯文本和日历；扫描图片、加密文件和超限附件标记未解析。XLSX 为文本提取，不保证保留单元格日期格式和表格关系，需要核对原件。

正文中的 URL 与身份证号在保存和调用模型前隐藏。认证码消息排除；模型仅提取结构化数据，不能调用工具、打开链接或执行身份验证。人工确认的操作也不代为报名、预约或参加考试。

## 可靠性边界

Android 的省电、强制停止、权限撤销和系统调度会影响后台执行。定期同步不是严格实时；强制停止后需重新打开应用。重启、时间变化和更新后会重建提醒，后台任务提供补偿检查。未授予通知权限不能收到系统通知。

本版本为个人安装测试构建。需要用户在实际手机确认权限、邮箱授权和锁屏后的通知送达；模拟器测试不能证明所有厂商的省电行为。

## 开发与测试

JDK 17、Gradle 8.6、Android SDK 34：

```sh
gradle -p android testDebugUnitTest assembleDebug assembleDebugAndroidTest
gradle -p android connectedDebugAndroidTest
```

`ScheduleRules` 是无 Android 依赖的匹配／时间规则；`LocalStore` 管理迁移、来源关联、完成状态和修复记录；`MailWorker` 与 `AnalysisWorker` 负责后台采集和分析；`Reminders` 负责系统通知与重启恢复；WebView 仅加载本地受 CSP 约束的资源，通过有限桥接调用本地服务。

APK 不含邮箱、API Key 或个人招聘记录。首次交付使用本机构建签名；后续升级应保留同一签名文件，避免卸载丢失数据。

## English

CareerFlow runs directly on Android: encrypted credentials, read-only incremental IMAP, filtered SMS ingestion, local evidence-linked schedules and system reminders. No desktop is required. Configure DeepSeek, an IMAP SSL mailbox with an app password, SMS access, notification permission and exact alarms in the app. All schedule times use UTC+8. Flexible assessment windows are tracked by deadline rather than treated as meeting conflicts. Completed/canceled schedules suppress reminders, and ambiguous matches require explicit confirmation.

Outlook / Microsoft 365 supports device-code authorization with your own public-client application ID, followed by encrypted token storage and renewal. Authorization must be completed personally on Microsoft’s official page. Desktop synchronization and image OCR are not available. Initial import is limited to the latest 200 emails/SMS. Attachment extraction is bounded and may require manual verification. Android battery restrictions can delay sync and alarms; force-stopping the app disables background operation until reopened. Test notification delivery on the actual phone before relying on it.

### 安装版签名与验证记录

日常安装包使用 `assembleRelease`，关闭调试；通过 `CAREERFLOW_KEYSTORE_PATH` 和 `CAREERFLOW_STORE_PASSWORD` 环境变量传入本机专用签名配置。私钥与密码不进入 Git。维护者应备份本机签名文件，后续版本使用同一签名升级。CI 默认产出调试测试包，不能覆盖专用签名安装版。

本次验证：13 项 JVM 单元测试通过；Android 14 模拟器 8 项测试通过，覆盖邮件文本/附件读取、加密存储、系统通知实际送达、来源去重、完成状态保留、改期取消、旧通知保护、人工确认与旧版数据库迁移。`node server/scripts/android-ui-smoke.mjs` 检查双语、窄屏、原文转义与灵活窗口；网页完整 UI 回归也通过。

真实手机的微软授权需要用户本人完成；未代用户触发新授权或访问招聘链接。真实邮箱网络连通性、三星省电行为和锁屏送达仍需安装后核验。

### 0.2.1 Outlook 授权修复

授权页面使用微软响应中的 `verification_uri`，仅允许受信任的官方 HTTPS 设备授权入口，不再写死设备登录页。代码支持一键复制与有效期倒计时；过期、取消和旧版本缺少有效期的请求不能继续打开。输入框保持焦点时也会刷新授权状态。

从 0.2.0 升级请使用相同签名 APK 覆盖安装，**不要卸载**，以保留本机数据与配置。取消旧请求并重新获取代码，点击“复制授权代码”，再点击“打开微软授权页面”粘贴；登录和授权仍由用户本人完成。测试使用合成代码，不提交真实设备代码或代做身份验证。

## 0.3.0 手机工作台与自动整理

- 底部总览、待办、日历、通知、设置五入口。总览优先显示接下来的三项安排，统计可点击；待办按今天、待完成、已过期、已完成过滤，并可搜索公司、岗位、地点。
- 月历支持切月、回到今天、查看当日安排；弹性窗口与固定场次使用不同标记。所有日期以北京时间解释，不随手机时区漂移。可手动新增、编辑安排；原有完成状态和证据保持不变。
- 总览提供公司／岗位进展分组与阶段分布。这里是已识别日程的统计，不冒充完整投递漏斗。
- 「问赴程」使用已配置的 DeepSeek API，可查询本机日程，用户明确要求时标记／撤销完成。只发送受限的日程摘要和当前对话；不能预约、操作考试或打开链接。其他修改通过安排编辑器完成。存在不唯一目标时用对话询问，不猜测。
- 每封新通知分析时带入已有日程上下文。原文校验失败时自动进行一次修正分析。每次成功分析后重新检查已有未关联通知；唯一同公司、同阶段、同场时间的简短短信可以自动补充已有日程，即使短信未重复岗位。已明确的不同岗位、编号、轮次或时间冲突保持独立。未能确定的内容折叠收起，不用逐条处理才能继续使用。
- 手动同步与定时同步串行运行，游标持久化后才继续。积压批次自动续跑；暂停邮箱、切换账号不会被旧令牌续期重新启用或覆盖。授权成功后明确注册定时同步。
- 提醒恢复不再一律丢弃延迟超过十五分钟的提醒：活动尚未到期时补发最新一条；到期后两小时内补偿，较早提醒合并抑制，不连续发送三条。已经投递、已完成或已取消的提醒不重复发送。
- 设置显示最近提醒检查、下次闹钟、短信权限、后台限制；提供系统应用设置入口。三星需自行允许后台电池运行并移出深度休眠名单。系统强行停止不能被应用自行解除。

### 验证范围与尚未迁移的功能

本地测试包含日期／关联规则、月历边界、搜索过滤、中英界面、手动编辑保留、跨来源去重、旧数据保护、升级兼容，以及 Android 14 **真实日程在 Home 后、屏幕关闭、强制 Doze 下触发系统通知**。这些是模拟器结果；没有在用户手机上代做授权，也没有用模拟器结果声称三星实机已验证。IMAP 的真实网络可用性仍取决于用户账号授权和手机网络。WorkManager 在 Doze 期间可能推迟联网任务；本地闹钟和邮件联网同步不是相同保证。

桌面与手机数据库仍独立。桌面的完整申请 CRUD／漏斗、简历库、职位采集与推荐、跨设备数据同步、桌面对话式批量修复能力尚未完整迁移；手机的日程分组和对话入口不能替代这些模块。不要卸载旧版，使用相同签名 APK 覆盖安装。

新增可复现检查：

```sh
node server/scripts/android-model-test.mjs
node server/scripts/android-ui-smoke.mjs
gradle -p android testDebugUnitTest assembleDebug assembleDebugAndroidTest
```

省电行为参考 [Android Doze 与 App Standby 官方说明](https://developer.android.com/training/monitoring-device-state/doze-standby)。


0.3.0 实测补充：使用模拟器 modem 的 `adb emu sms send` 注入合成短信，应用处于后台，原生 `SMS_RECEIVED` 接收器完成入库；随后以合成解析结果检查与已有邮件日程关联及完成状态保留。另用已配置 DeepSeek 对 Android 当前提示词执行真实 API 测试，仅发送合成数据，验证窗口、起止时间和逐字引文。此测试不代表已经访问用户手机邮箱。

```sh
# 需显式许可的真实 API 冒烟测试；不会读取邮件
node server/scripts/android-ai-live-smoke.mjs --live
# 可选模拟器短信接收测试：启动后 50 秒内在另一终端注入下方短信
adb shell am instrument -w -e class app.careerflow.mobile.SmsBackgroundTest -e smsSmoke true app.careerflow.mobile.test/androidx.test.runner.AndroidJUnitRunner
adb emu sms send 15551234567 "CareerFlow background interview smoke 2026-11-05 14:00 to 2026-11-05 16:00 Room A"
```
