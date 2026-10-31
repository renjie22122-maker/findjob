# CareerFlow · 赴程 — Android preview

手机独立运行，无需电脑在线。此版本用于验证短信读取与本地 AI 分析，不是桌面功能的完整移植。

## 使用

1. 安装 CI 构建的 `app-debug.apk`（个人测试预览版）。
2. 在手机填写自己的 DeepSeek API Key；密钥通过 Android Keystore 加密保存在本机，不包含在安装包中。
3. 开启自动接收并授予短信权限。也可手动检查最近 200 条收件箱短信。
4. 招聘短信通过本地过滤后进入数据库，后台联网时提取公司、时间、地点和摘要。可重试分析、查看原文、标记完成。

验证码与身份验证短信在保存、调用模型前排除。网址与身份证号脱敏；不会打开短信链接、登录考试平台或提交预约。仅相关短信正文发送到 DeepSeek HTTPS API。普通 SMS 以外的 RCS、聊天应用通知不在读取范围内。

重复内容按发送方与正文去重，重复导入保留完成状态。不同措辞的同场通知尚不能自动合并；模型结果始终作为待核对草稿。手机与桌面数据库目前独立，尚无同步和迁移入口。

**尚不支持**：邮件同步、附件解析、完整申请与跨来源日程关联、定时提醒、桌面数据同步。请继续使用原日程管理提醒，不要仅依赖预览版。Android 省电、强制停止及撤销权限可能影响后台运行，需在实机验证。

## Build / test

JDK 17, Android SDK 34, Gradle 8.6:

```sh
gradle -p android testDebugUnitTest assembleDebug
```

GitHub Actions: `Android preview` workflow; artifact `CareerFlow-Android-preview`. Debug APK uses a test signing key; this is not a Play Store release. Future releases need a stable private signing key to preserve upgrades.

The standalone Android preview reads permitted SMS, filters authentication messages locally, redacts links and IDs, and submits recruitment text to DeepSeek. It stores results and completion state on the phone. Email, attachment processing, cross-source scheduling, timed reminders and desktop synchronization are not implemented yet. Real-device permission and background-delivery checks remain necessary after installing.
