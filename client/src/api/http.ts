export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }

  /** 网络层错误（后端未启动 / 超时）：status 为 0，便于 UI 区分“没连上”与“接口报错” */
  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

/** 普通接口超时：本地服务不应长时间无响应 */
const DEFAULT_TIMEOUT_MS = 20_000;
/** 上传/下载（Excel、PDF、证书图片）超时放宽 */
const TRANSFER_TIMEOUT_MS = 120_000;

interface RequestOptions extends RequestInit {
  timeoutMs?: number;
}

/** AbortSignal.timeout 在旧版浏览器可能不存在，此时退化为不设超时（与改造前行为一致） */
function timeoutSignal(timeoutMs: number): AbortSignal | undefined {
  return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(timeoutMs)
    : undefined;
}

/** fetch 包装：把「连不上 / 超时」翻译成可读的 ApiError，而不是裸 TypeError: Failed to fetch */
async function fetchApi(path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  try {
    return await fetch(`/api${path}`, { ...init, signal: init.signal ?? timeoutSignal(timeoutMs) });
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'TimeoutError') {
      throw new ApiError(0, 'TIMEOUT', '请求超时：后端可能未启动，或数据量过大仍在处理中');
    }
    if (name === 'AbortError') {
      throw new ApiError(0, 'ABORTED', '请求已取消');
    }
    throw new ApiError(0, 'NETWORK_ERROR', '无法连接后端服务：请确认已执行 pnpm dev，且 http://localhost:3001/api/health 可访问');
  }
}

/** 统一解析后端错误结构 { error: { code, message } } */
async function toApiError(res: Response, fallback: string): Promise<ApiError> {
  const data = await res.json().catch(() => null);
  return new ApiError(
    res.status,
    data?.error?.code ?? 'UNKNOWN',
    data?.error?.message ?? `${fallback}（HTTP ${res.status}）`,
  );
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...init } = options;
  // 仅在有请求体时才声明 JSON，避免给 GET/DELETE 带上无意义的 Content-Type
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetchApi(path, { ...init, headers }, timeoutMs);
  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.error?.code ?? 'UNKNOWN',
      data?.error?.message ?? `请求失败（HTTP ${res.status}）`,
    );
  }
  return data as T;
}

export const http = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown, timeoutMs?: number) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body), timeoutMs }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

/** 优先使用服务端 Content-Disposition 给出的文件名（导出文件名带时间戳） */
function fileNameFromResponse(res: Response, fallbackName: string): string {
  const disposition = res.headers.get('content-disposition') ?? '';
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  const raw = match?.[1]?.trim();
  if (!raw) return fallbackName;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** 文件下载（导出 Excel / 快照） */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const res = await fetchApi(path, {}, TRANSFER_TIMEOUT_MS);
  if (!res.ok) throw await toApiError(res, '下载失败');

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileNameFromResponse(res, fallbackName);
    a.rel = 'noopener';
    // 必须挂到 DOM 上再点击，否则部分浏览器（Firefox）不会触发下载
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // 立即 revoke 可能中断尚未开始的下载，延后释放
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

/** 文件上传（Excel 导入 / PDF 简历解析） */
export async function uploadFile<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetchApi(path, { method: 'POST', body: form }, TRANSFER_TIMEOUT_MS);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.error?.code ?? 'UNKNOWN',
      data?.error?.message ?? `上传失败（HTTP ${res.status}）`,
    );
  }
  return data as T;
}
