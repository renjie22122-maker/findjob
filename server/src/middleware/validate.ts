import { z } from 'zod';
import { AppError } from './error.js';
import { isStatus } from '../domain/status.js';
import type { AppStatus } from '../domain/status.js';

/** zod 解析请求数据，失败抛 400 VALIDATION_ERROR */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw AppError.validation(
      result.error.issues.map((i) => `${i.path.join('.') || '字段'}: ${i.message}`).join('；'),
    );
  }
  return result.data as z.infer<T>;
}

/** 整数路径参数 */
export function parseId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw AppError.validation('无效的 id');
  return id;
}

/** 查询参数可能是 string / string[] / 其它混合类型，统一成去空白的字符串数组 */
function queryValues(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : [value];
  return raw
    .filter((item): item is string | number => typeof item === 'string' || typeof item === 'number')
    .map((item) => String(item).trim())
    .filter((item) => item !== '');
}

interface IntQueryOptions {
  min?: number;
  max?: number;
}

/**
 * 解析整数查询参数：非法值（NaN / Infinity / 小数 / 空串）回退默认值，并夹紧到 [min, max]。
 *
 * 必须显式校验：`Number('abc')` 得到 NaN，若直接绑定进 SQL 的 LIMIT/OFFSET，
 * SQLite 会把它当作 NULL，等于「不限制」——分页参数写错就会一次返回全表。
 */
export function intQuery(value: unknown, fallback: number, options: IntQueryOptions = {}): number {
  const first: string | undefined = queryValues(value)[0];
  if (first === undefined) return fallback;
  const parsed = Number(first);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return fallback;
  const min = options.min ?? Number.NEGATIVE_INFINITY;
  const max = options.max ?? Number.POSITIVE_INFINITY;
  return Math.min(max, Math.max(min, parsed));
}

/**
 * 可选整数查询参数：缺省/空串返回 undefined；显式传入非法值直接 400，
 * 避免「筛选条件写错 → 静默退化成不过滤」。
 */
export function optionalIntQuery(value: unknown, options: IntQueryOptions = {}): number | undefined {
  const first: string | undefined = queryValues(value)[0];
  if (first === undefined) return undefined;
  const parsed = Number(first);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw AppError.validation(`查询参数必须是整数：${first}`);
  }
  const min = options.min ?? Number.NEGATIVE_INFINITY;
  const max = options.max ?? Number.POSITIVE_INFINITY;
  if (parsed < min || parsed > max) {
    throw AppError.validation(`查询参数超出允许范围（${min} ~ ${max}）：${first}`);
  }
  return parsed;
}

/** 关键字查询参数：去空白、限长，空串视为未传 */
export function stringQuery(value: unknown, maxLength = 200): string | undefined {
  const first: string | undefined = queryValues(value)[0];
  return first === undefined ? undefined : first.slice(0, maxLength);
}

/** 状态筛选：支持重复 query（?status=A&status=B）；出现非法状态直接 400 */
export function statusQuery(value: unknown): AppStatus[] | undefined {
  const values = queryValues(value);
  if (values.length === 0) return undefined;
  const invalid = values.filter((item) => !isStatus(item));
  if (invalid.length > 0) throw AppError.validation(`无效的状态值：${invalid.join('、')}`);
  return [...new Set(values as AppStatus[])];
}
