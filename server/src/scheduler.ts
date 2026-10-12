import { isJobDue, listCrawlJobs, runCrawlJob } from './services/crawlJobs.service.js';
import {
  isProfileDue,
  listSearchProfiles,
  runProfile,
  type RecommendationRun,
} from './services/recommendations.service.js';
import { isAutoAnalyzeDue, latestDueSlot, runAutoEmailAnalyze } from './services/email/autoAnalyze.service.js';

/**
 * 定时任务调度器（应用运行期间生效）：
 * 每分钟检查一次到期任务，串行执行（爬虫本身有限速，避免并发风控）：
 *   1) 定时抓取任务（crawl_jobs）
 *   2) 搜索画像推荐（job_search_profiles）
 *   3) 邮件自动分析（每天 EMAIL_AUTO_ANALYZE_HOURS，默认 8/20 点；服务重启会补跑错过的时段）
 */
let queue: Promise<void> = Promise.resolve();
let started = false;

/** 距时间槽超过该阈值即视为“补跑”（服务当时没运行） */
const CATCH_UP_THRESHOLD_MS = 5 * 60_000;

async function processDueJobs(): Promise<void> {
  try {
    const jobs = listCrawlJobs();
    for (const job of jobs) {
      if (isJobDue(job)) {
        console.log(`[scheduler] 任务「${job.keyword}」到期，开始抓取…`);
        await runCrawlJob(job.id);
      }
    }

    const profiles = listSearchProfiles();
    for (const profile of profiles) {
      if (isProfileDue(profile)) {
        console.log(`[scheduler] 搜索画像「${profile.name}」到期，开始生成岗位推荐…`);
        await runProfile(profile.id);
      }
    }

    if (isAutoAnalyzeDue()) {
      const slot = latestDueSlot();
      const slotTime = slot ? new Date(slot).getTime() : Date.now();
      const isCatchUp = Date.now() - slotTime > CATCH_UP_THRESHOLD_MS;
      console.log(`[scheduler] 邮件自动分析到期（${isCatchUp ? '补跑错过的时段' : '准点'}），开始…`);
      await runAutoEmailAnalyze(isCatchUp ? 'catch-up' : 'schedule');
    }
  } catch (err) {
    console.error('[scheduler]', err);
  }
}

/** 手动触发一次任务执行（run-now 端点用），并入串行队列避免并发 */
export function enqueueJobRun(jobId: number): void {
  const task = queue.then(async () => {
    await runCrawlJob(jobId);
  });
  queue = task.catch((err: unknown) => {
    console.error('[scheduler] 手动抓取任务失败：', err);
  });
}

/** 手动触发画像执行，并与抓取任务共用串行队列，避免多路爬虫同时访问上游。 */
export function enqueueRecommendationRun(profileId: number): Promise<RecommendationRun> {
  const task = queue.then(() => runProfile(profileId));
  queue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

export function startScheduler(intervalMs = 60_000): void {
  if (started) return;
  started = true;
  const tick = () => {
    const task = queue.then(processDueJobs);
    queue = task.catch((err: unknown) => {
      console.error('[scheduler] 定时任务失败：', err);
    });
  };
  tick(); // 启动时先检查一轮（重启补跑错过的邮件分析时段）
  setInterval(tick, intervalMs);
}
