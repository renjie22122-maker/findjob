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

## 0.4.0 本机求职工作台与可配置 AI

本版按用户要求暂缓跨设备同步。桌面和手机数据仍独立，不启动同步网关，不新增外部端口。

### 手机工作流

总览新增「申请、简历、推荐」入口，保留底部总览、待办、日历、通知、设置。申请可建立、编辑、筛选、关联简历；通知可自动建立申请并推进阶段，投递回执使用收到时间。明确的不同岗位分开跟踪。已签约、已放弃及用户主动修改的状态受保护；普通备注编辑不会停止后续自动推进。历史通知不能覆盖更新的状态。

简历支持本机 PDF / DOCX / TXT 导入、原文编辑、AI 提取、版本记录和恢复，系统打印入口可保存 PDF。仅处理可提取文本的文件，最大 2 MB；扫描件 OCR 不在本版范围。原文和简历内容会发往用户配置的 AI 服务，提取结果须有原文依据，不生成虚构经历。

推荐以用户粘贴或录入的真实职位描述为来源，结合所选简历自动分析匹配依据；分数不是录用概率。加入申请只建立待投递记录，不会提交简历。当前没有手机自动职位爬虫，也不自动复制电脑上的职位库。失败的职位提取草稿加密保留，可通过「重试自动整理」重新执行。

### API 与跨通知分析

设置支持 OpenAI Chat Completions 兼容服务：HTTPS 基础地址或完整端点、任意模型 ID、模型列表、Bearer / api-key 请求头、JSON mode / temperature 开关、超时和输出上限。DeepSeek 仅为迁移默认值，不再写死在每个业务请求里。已有密钥自动沿用；更改地址需要重新填写密钥。密钥由 Android Keystore 加密，不回传到页面；连接不跟随重定向。不同供应商专有协议不等同于 OpenAI 兼容格式。

分析包含相关已保存邮件、短信、附件提取文本及日程来源。为限制上下文与费用，最多选 16 个日程、10 条通知，总上下文约 24,000 字符；单条文本也有截断。模型判断自选时间窗口、截止时间、轮次及跨通知关联，可为只有地点的后续通知关联原日程，或依据明确改期更新原场次。关联目标必须存在，引用须来自已保存原文，不接受相互冲突的岗位或编号。关联理由写入修复记录，来源累积，完成状态不重置。

新通知分析后会触发最多 8 条相关待处理通知的重新分析，不递归触发重分析。升级后已分析的最近 200 条本地通知会按新逻辑重新检查一次；不会为此重复读取邮箱。完全没有时间的预通知进入「等待后续通知」，纯说明不生成待办。模型依然不能凭空补日期、访问链接、身份验证或替用户考试。只有真实关联冲突需要进一步确认。

数据层分离：`WorkspaceStore` 管理申请/简历/职位和版本；`LocalStore` 管理通知/日程与修复记录；`AnalysisContext` 构建有限上下文及验证关联目标；`LlmApi` 统一传输和配置；各 WorkManager Worker 负责可恢复的后台操作。定时联网任务仍受 Android 调度和省电限制，跨通知分析不保证锁屏期间实时联网。

### 0.4.0 验证

执行 JVM 单元测试、Android lint、Android 14 原生回归、手机浏览器双语/窄屏/编辑与 API 设置检查。原生测试覆盖跨通知补地点与改期、不重复建场次、保留完成状态、旧拒信保护、手动状态保护、简历版本恢复及密钥迁移。配置的真实 API 仅收到合成测试文本，验证固定场次、自选窗口、单截止时间和跨邮件补地点；没有访问真实招聘链接或代做授权。

安装使用同签名 **CareerFlow-0.4.0.apk** 覆盖旧版，不要卸载。用户手机上的真实邮箱授权、厂商省电和锁屏联网情况仍需实机确认，模拟器结果不代表已验证三星设备。

### English — 0.4.0

The local mobile workspace adds applications, versioned resumes and sourced job matching. AI settings support configurable HTTPS OpenAI-compatible endpoints, models and compatibility options. Related email/SMS/attachment text is supplied as bounded context for source-backed linking; completed events and newer decisions are preserved. Sync remains deferred, and job discovery/crawling is not included. Install over the previous release using the same signing identity. Device-specific background restrictions still apply.

## 0.4.1 性能与 API 诊断修复

- 「测试当前配置」「读取模型列表」改用独立、单请求后台执行器，不再排在邮件分析的 WorkManager 队列之后。重复点击不会增加请求；请求设置 30 秒总时限和连接/读取超时。界面区分 HTTP、超时、DNS、TLS、输出上限、JSON 格式错误；进程重启后不永久显示旧的排队状态。
- 启动、恢复及手动自动核查时的数据库/提醒维护离开主线程。工作台查询不再隐式写入、扫描和推进所有申请；日程来源批量查询，提醒和匹配仅需要概要时不加载原文。只渲染当前页面，关联原文展开后再建立节点，设置页面不轮询整份邮件数据库。
- 加密存储保持不变。对已解密值使用最多 16 项的进程内缓存，密文变化即失效，避免设置状态轮询不断调用 Android Keystore；不把密钥放入页面或日志。
- 不再在保存 API 配置时触发全部历史重分析。升级清理旧版已分析通知的排队重跑任务，不删除通知，也不取消尚未首次分析的通知。历史升级复核改为充电时每次最多 5 条；自动关联复核同一条通知每 30 分钟最多调度一次，手动重试不受此限制。新通知与本地闹钟保留原流程。
- 验证包含原生慢请求/重复点击/失败后重试、200 条带原文日程读取、WebView 模型按钮响应、真实配置 API 的模型列表和合成 JSON 请求，以及原有关联/后台提醒测试。没有连接用户手机读取 ANR 堆栈或测温，不能把模拟器测试解释为实机温度已经测量或所有闪退原因均已确认。

Install **CareerFlow-0.4.1.apk** over the existing version; do not uninstall. Interactive API diagnostics use an independent executor with bounded requests. Background maintenance and hidden-page rendering are reduced; existing data and completed state are preserved.

## 0.5.0 可恢复重分析与大数据性能

总览新增「重新分析已有通知」：按下「重新分析全部」后，创建当前本机全部通知 ID 的快照，不限最近 200 条，也不重新下载邮箱。使用当前 API/模型与已提取附件文本，会消耗 API 额度。进度显示已分析、失败、总数和百分比；支持暂停、继续未完成、重试失败项。暂停在当前通知处理结束后生效。每条结果独立持久化，重启后继续待处理项，不清空原分析、完成状态或来源。新收到的通知走原增量流程，不加入已开始批次的分母。

批量和自动通知分析共用单个执行许可，每次只处理一条；批量条目之间让出后台执行机会。API 测试保持独立。无网络、电量不足时交由 WorkManager 等待；系统报告严重热状态时暂停请求并退避。三次连续失败或认证失败自动暂停，避免大量重复失败请求；可查看最近错误并重试。API 读取与总请求时间受配置超时限制，分析输出上限遵循用户设置；输出不足会明确提示调高额度，不把截断结果写成成功。

旧通知重分析会纠正同一已关联场次中有原文依据的时间、类型和地点，记录修改前后内容并保留完成状态。不同轮次顺序发生变化时先按身份重新对应；岗位/轮次不一致、原场次未重新识别、人工修改或更晚来源存在时不会直接覆盖或删除原日程。复杂拆分、合并和缺少依据的旧错误仍可能需要核对，重分析不等于无条件替换数据库。

性能改进：通知分页且数据库筛选，每页 50 条；页面日程数据不再附带全部来源正文，原文展开时单独读取。待办与当天日程每页最多 50 张卡片。日期格式器与排序时间戳复用，固定场次冲突计算不再重复解析时间；首页折叠分组按需生成。数据库增加日期、状态和来源关联索引，提醒投递记录一次读取，模型上下文只加载选中的日程来源。新增迁移保留现有数据。

验证包含 1,200 条长通知的全量批次、分页、断点与失败恢复，错误时间修复、事件顺序改变、完成/人工记录保护，以及 1,200 条日程的有界 DOM 渲染。另以真实配置 API 对合成邮件和短信执行后台批次验证，不访问招聘链接或身份验证入口。模拟器结果不能代替三星实机测温或厂商后台策略验证。

覆盖安装 **CareerFlow-0.5.0.apk**，不要卸载。推荐先完成 API 连通测试，再从总览开始重分析；可离开页面，回来查看持久化进度。Android 强制停止应用后需重新打开才能恢复后台工作。

English: persistent, one-at-a-time reanalysis of all saved notices with progress, pause/resume and retry. Original records and completed state remain intact. Inbox/task pagination and lazy source loading bound rendering cost. Network, battery and thermal constraints may defer background work; no phone temperature measurements are claimed.

0.5.0 输出上限默认不主动限制：设置填 0 或留空，请求不发送 `max_tokens`，实际输出仍受 API 服务商/模型默认值和上下文窗口限制。已有明确保存的正数上限保留，可改为 0；请求超时仍生效。所有业务分析请求使用统一配置，不再用各模块固定值覆盖用户选择。
