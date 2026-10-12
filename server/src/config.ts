import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 解析有界的整数环境变量：非法值（NaN / 小数 / 越界）回退默认值，
 * 避免 `PORT=abc` 这类配置让 listen 抛错、或让爬虫限速失效。
 */
export function resolveBoundedInt(
  value: string | undefined,
  fallback: number,
  options: { min: number; max: number },
): number {
  const parsed = Number(value?.trim());
  if (!Number.isInteger(parsed) || parsed < options.min || parsed > options.max) return fallback;
  return parsed;
}

export function resolvePort(value: string | undefined): number {
  return resolveBoundedInt(value, 3001, { min: 1, max: 65535 });
}

/**
 * 是否仅监听回环地址。非回环（0.0.0.0 / 局域网 IP）意味着无鉴权的本地管理接口
 * 会暴露给同网段，启动时应显式告警。
 */
export function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1' || normalized === '[::1]';
}

export const PORT = resolvePort(process.env.PORT);

/**
 * 默认仅监听本机，避免无鉴权的本地管理接口（含邮箱及 OAuth 配置）
 * 意外暴露到局域网。确需容器/局域网访问时可显式设置 HOST=0.0.0.0。
 */
export function resolveHost(value: string | undefined): string {
  return value?.trim() || '127.0.0.1';
}

export const HOST = resolveHost(process.env.HOST);

/** SQLite 数据文件路径（可用 FINDJOB_DB_PATH 覆盖，测试用 ':memory:'） */
export const DB_PATH = process.env.FINDJOB_DB_PATH ?? path.resolve(__dirname, '../data/findjob.db');

/** 爬虫限速（毫秒/请求，下限 200ms 防止风控） */
export const CRAWL_RATE_LIMIT_MS = resolveBoundedInt(process.env.CRAWL_RATE_LIMIT_MS, 1500, {
  min: 200,
  max: 60_000,
});
export const CRAWL_MAX_PAGES = resolveBoundedInt(process.env.CRAWL_MAX_PAGES, 10, { min: 1, max: 50 });

/** 邮件分析默认参数 */
export const EMAIL_ANALYZE_MAX_DAYS = 30;
/** 拉取给模型看的正文长度（字符）：越大模型判断越准，但 token 越多 */
export const EMAIL_SNIPPET_LENGTH = resolveBoundedInt(process.env.EMAIL_SNIPPET_LENGTH, 800, {
  min: 100,
  max: 4000,
});

/**
 * 邮件分析模式：
 * - llm-first（默认，需已配置 LLM Key）：不用关键词筛，直接把正文交给模型判断「是否招聘相关 + 事件类型」；
 * - keyword：仅用本地关键词初筛 + 规则提取（无 Key 时的降级路径）。
 */
export const EMAIL_ANALYZE_MODE: 'llm-first' | 'keyword' =
  process.env.EMAIL_ANALYZE_MODE === 'keyword' ? 'keyword' : 'llm-first';

/** llm-first 模式下单次分析最多送给模型的邮件数（控制 token 消耗） */
export const EMAIL_LLM_MAX_EMAILS = resolveBoundedInt(process.env.EMAIL_LLM_MAX_EMAILS, 40, {
  min: 1,
  max: 200,
});

/** 单次邮件拉取中「下载正文摘要」的时间预算（毫秒）：超预算仅降级为无摘要，不阻塞整次分析 */
export const EMAIL_FETCH_BUDGET_MS = resolveBoundedInt(process.env.EMAIL_FETCH_BUDGET_MS, 60_000, {
  min: 5_000,
  max: 600_000,
});

/** IMAP socket 超时（毫秒）：上游不回应时快速失败，避免一次分析挂死 5 分钟 */
export const IMAP_SOCKET_TIMEOUT_MS = resolveBoundedInt(process.env.IMAP_SOCKET_TIMEOUT_MS, 30_000, {
  min: 5_000,
  max: 300_000,
});

/** 单次分析最多处理的邮件数（取最新的 N 封） */
export const IMAP_MAX_SCAN_MESSAGES = resolveBoundedInt(process.env.IMAP_MAX_SCAN_MESSAGES, 30, {
  min: 1,
  max: 200,
});

/** 单次分析最多为多少封邮件下载正文摘要 */
export const IMAP_MAX_SNIPPET_DOWNLOADS = resolveBoundedInt(process.env.IMAP_MAX_SNIPPET_DOWNLOADS, 15, {
  min: 0,
  max: 100,
});

/** 单封正文摘要的下载超时（毫秒）：超时则该封降级为无摘要 */
export const IMAP_SNIPPET_TIMEOUT_MS = resolveBoundedInt(process.env.IMAP_SNIPPET_TIMEOUT_MS, 4_000, {
  min: 1_000,
  max: 30_000,
});

/** 每次 FETCH 携带的 UID 数量：上游对大批量 UID FETCH 可能不响应，分批更稳 */
export const IMAP_FETCH_BATCH = resolveBoundedInt(process.env.IMAP_FETCH_BATCH, 5, { min: 1, max: 50 });

/**
 * 解析每日执行时间点（本地时区）：如 EMAIL_AUTO_ANALYZE_HOURS=8,20
 * 非法值会被丢弃；全部非法时回退到默认值。
 */
export function parseHours(raw: string | undefined, fallback: number[]): number[] {
  if (!raw) return [...fallback];
  const hours = [
    ...new Set(
      raw
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 23),
    ),
  ].sort((a, b) => a - b);
  return hours.length > 0 ? hours : [...fallback];
}

/** 邮件自动分析开关（EMAIL_AUTO_ANALYZE=0 可关闭） */
export const EMAIL_AUTO_ANALYZE_ENABLED = process.env.EMAIL_AUTO_ANALYZE !== '0';
/** 每日自动分析时间点（默认早 8 点、晚 8 点） */
export const EMAIL_AUTO_ANALYZE_HOURS = parseHours(process.env.EMAIL_AUTO_ANALYZE_HOURS, [8, 20]);
/** 自动分析回看天数 */
export const EMAIL_AUTO_ANALYZE_DAYS = resolveBoundedInt(process.env.EMAIL_AUTO_ANALYZE_DAYS, 7, {
  min: 1,
  max: 30,
});
/** 自动分析后是否自动应用高置信度结果（含 “投递确认→已投递”、“缺记录则创建”） */
export const EMAIL_AUTO_APPLY = process.env.EMAIL_AUTO_APPLY !== '0';
const autoApplyMinRaw = Number(process.env.EMAIL_AUTO_APPLY_MIN_CONFIDENCE ?? 0.8);
export const EMAIL_AUTO_APPLY_MIN_CONFIDENCE =
  Number.isFinite(autoApplyMinRaw) && autoApplyMinRaw >= 0 && autoApplyMinRaw <= 1 ? autoApplyMinRaw : 0.8;

/** 设为 1 时输出 imapflow 命令级日志（排查上游不响应问题用） */
export const IMAP_DEBUG = process.env.IMAP_DEBUG === '1';
