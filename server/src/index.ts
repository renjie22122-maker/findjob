import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOST, PORT, isLoopbackHost } from './config.js';
import { closeDb, getDb } from './db/connection.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { requestLogger } from './middleware/logger.js';
import companiesRouter from './routes/companies.js';
import applicationsRouter from './routes/applications.js';
import remindersRouter from './routes/reminders.js';
import statsRouter from './routes/stats.js';
import importExportRouter from './routes/importExport.js';
import { crawlRouter, sourcesRouter } from './routes/sources.js';
import { getToday } from './services/today.service.js';
import { asyncHandler } from './middleware/error.js';
import { crawlJobsRouter, crawlRunsRouter } from './routes/crawlJobs.js';
import oauth2Router from './routes/oauth2.js';
import auditRouter from './routes/audit.js';
import resumesRouter from './routes/resumes.js';
import aiRouter from './routes/ai.js';
import autofillRouter from './routes/autofill.js';
import { startScheduler } from './scheduler.js';
import settingsRouter from './routes/settings.js';
import emailRouter from './routes/email.js';
import utilsRouter from './routes/utils.js';
import recommendationsRouter from './routes/recommendations.js';

export function createApp(): express.Express {
  const app = express();
  // 不暴露实现指纹
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));
  app.use(requestLogger);

  // 启动时初始化数据库（建表迁移）
  getDb();

  app.use('/api', utilsRouter);
  app.use('/api/companies', companiesRouter);
  app.use('/api/applications', applicationsRouter);
  app.use('/api/reminders', remindersRouter);
  app.use('/api/stats', statsRouter);
  // 设计文档约定的别名：GET /api/today
  app.get(
    '/api/today',
    asyncHandler(async (_req, res) => {
      res.json(getToday());
    }),
  );
  app.use('/api/import', importExportRouter);
  app.use('/api/export', importExportRouter);
  app.use('/api/sources', sourcesRouter);
  app.use('/api/crawl', crawlRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/email', emailRouter);
  app.use('/api/crawl-jobs', crawlJobsRouter);
  app.use('/api/crawl-runs', crawlRunsRouter);
  app.use('/api/oauth2', oauth2Router);
  app.use('/api/audit', auditRouter);
  app.use('/api/resumes', resumesRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/autofill', autofillRouter);
  app.use('/api/recommendations', recommendationsRouter);

  // 生产模式：托管前端构建产物（client/dist 存在时启用单端口访问）
  const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.path.startsWith('/api/')) {
        res.sendFile(path.join(clientDist, 'index.html'));
        return;
      }
      next();
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

// 直接运行时启动服务
if (process.argv[1]?.endsWith('index.js') || process.argv[1]?.endsWith('index.ts')) {
  const app = createApp();
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
