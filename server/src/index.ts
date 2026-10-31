import express from 'express';
import {createApp} from './app.js';
export {createApp} from './app.js';
import {HOST,PORT,isLoopbackHost,resolveBoundedInt} from './config.js';
import {closeDb} from './db/connection.js';
import {startScheduler} from './scheduler.js';
import {smsGateway} from './routes/sms.js';
import {errorHandler} from './middleware/error.js';

// 直接运行时启动服务
if (process.argv[1]?.endsWith('index.js') || process.argv[1]?.endsWith('index.ts')) {
  const app = createApp();
  const smsPort=resolveBoundedInt(process.env.SMS_GATEWAY_PORT,0,{min:1,max:65535}),smsToken=process.env.SMS_GATEWAY_TOKEN;
  const phoneApp=express();
  const phoneServer=smsPort && smsToken && smsToken.length>=32 ? phoneApp.use(smsGateway(smsToken)).use(errorHandler).listen(smsPort,process.env.SMS_GATEWAY_HOST??'127.0.0.1') : null;
  phoneServer?.on('error',()=>console.error('[sms] 手机接入端口启动失败，请检查端口和监听地址；主应用继续运行'));
  if (!isLoopbackHost(HOST)) {
    console.warn(
      `[findjob] 警告：当前监听 ${HOST}，而接口无鉴权（含邮箱 / OAuth / LLM 配置），请勿暴露到公网或不受信任的局域网。`,
    );
  }
  const server = app.listen(PORT, HOST, () => {
    const displayHost = HOST.includes(':') ? `[${HOST}]` : HOST;
    console.log(`[findjob] server listening on http://${displayHost}:${PORT}`);
    startScheduler(); // 定时抓取调度器（应用运行期间生效）
  });

  // 优雅退出：停止接收新连接 → 关闭 SQLite（WAL 落盘）→ 退出
  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    phoneServer?.close();
    console.log(`[findjob] 收到 ${signal}，正在关闭服务…`);
    server.close(() => {
      closeDb();
      process.exit(0);
    });
    // 兜底：长连接迟迟不释放时强制退出，避免进程挂死
    setTimeout(() => {
      closeDb();
      process.exit(0);
    }, 5_000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('unhandledRejection', (reason) => {
    console.error('[unhandledRejection]', reason);
  });
  process.on('uncaughtException', (err) => {
    console.error('[uncaughtException]', err);
  });
}
