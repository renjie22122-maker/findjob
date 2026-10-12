import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { AppError } from '../middleware/error.js';
import { isPublicIpAddress, normalizeHostname } from './ip.js';

export const MAX_PUBLIC_HTML_BYTES = 2 * 1024 * 1024;
export const MAX_PUBLIC_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 8_000;

interface ResolvedAddress {
  address: string;
}

export type HostResolver = (hostname: string) => Promise<readonly ResolvedAddress[]>;

const defaultResolver: HostResolver = (hostname) => lookup(hostname, { all: true, verbatim: true });

// IP / 主机名判定拆分到 ./ip.ts（纯函数模块，可独立单测，含 IPv4-mapped IPv6 等绕过用例）。

/** 只接受不含凭据的公网 HTTP(S) URL；域名解析在 assertPublicHttpUrl 中完成。 */
export function parsePublicHttpUrl(input: string | URL): URL {
  let url: URL;
  try {
    url = input instanceof URL ? new URL(input.href) : new URL(input);
  } catch {
    throw AppError.validation('链接格式不正确');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw AppError.validation('仅支持 http 或 https 链接');
  }
  if (url.username || url.password) {
    throw AppError.validation('链接中不能包含用户名或密码');
  }

  const hostname = normalizeHostname(url.hostname);
  const ipVersion = isIP(hostname);
  if (ipVersion > 0 && !isPublicIpAddress(hostname)) {
    throw AppError.validation('不允许访问本机、内网或保留地址');
  }
  if (
    ipVersion === 0
    && (hostname === 'localhost' || hostname.endsWith('.localhost') || !hostname.includes('.'))
  ) {
    throw AppError.validation('不允许访问本机或内部主机名');
  }
  return url;
}

/** 解析域名并确保所有返回地址均为公网地址。每次重定向都会重新调用。 */
export async function assertPublicHttpUrl(
  input: string | URL,
  resolver: HostResolver = defaultResolver,
): Promise<URL> {
  const url = parsePublicHttpUrl(input);
  const hostname = normalizeHostname(url.hostname);
  if (isIP(hostname) > 0) return url;

  let addresses: readonly ResolvedAddress[];
  try {
    addresses = await resolver(hostname);
  } catch {
    throw AppError.badGateway('目标域名解析失败');
  }
  if (addresses.length === 0) throw AppError.badGateway('目标域名没有可用地址');
  if (addresses.some(({ address }) => !isPublicIpAddress(address))) {
    throw AppError.validation('目标域名解析到了本机、内网或保留地址');
  }
  return url;
}

async function readTextBodyLimited(response: Response, maxBytes: number): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw AppError.badGateway(`页面响应体超过 ${Math.ceil(maxBytes / 1024 / 1024)} MB 限制`);
  }
  if (!response.body) return '';

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw AppError.badGateway(`页面响应体超过 ${Math.ceil(maxBytes / 1024 / 1024)} MB 限制`);
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

export interface PublicHtmlResult {
  html: string;
  finalUrl: string;
}

/**
 * 安全抓取公网 HTML：禁用自动重定向，逐跳复检目标，并流式限制解压后的响应大小。
 */
export async function fetchPublicHtml(
  input: string | URL,
  options: { timeoutMs?: number; maxBytes?: number; maxRedirects?: number } = {},
): Promise<PublicHtmlResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? MAX_PUBLIC_HTML_BYTES;
  const maxRedirects = options.maxRedirects ?? MAX_PUBLIC_REDIRECTS;
  let current = parsePublicHttpUrl(input);

  for (let redirects = 0; ; redirects++) {
    current = await assertPublicHttpUrl(current);
    let response: Response;
    try {
      response = await fetch(current, {
        headers: {
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.8',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw AppError.badGateway(`页面请求失败：${message}`);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel().catch(() => undefined);
      if (redirects >= maxRedirects) throw AppError.badGateway('页面重定向次数过多');
      const location = response.headers.get('location');
      if (!location) throw AppError.badGateway('页面返回了无目标的重定向');
      try {
        current = new URL(location, current);
      } catch {
        throw AppError.badGateway('页面返回了无效的重定向地址');
      }
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw AppError.badGateway(`页面请求失败：HTTP ${response.status}`);
    }
    const contentType = response.headers.get('content-type')?.toLowerCase();
    if (contentType && !contentType.startsWith('text/') && !contentType.startsWith('application/xhtml+xml')) {
      await response.body?.cancel().catch(() => undefined);
      throw AppError.badGateway('目标响应不是 HTML 文本');
    }

    try {
      return { html: await readTextBodyLimited(response, maxBytes), finalUrl: current.href };
    } catch (err) {
      if (err instanceof AppError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw AppError.badGateway(`读取页面失败：${message}`);
    }
  }
}
