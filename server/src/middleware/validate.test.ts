import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError } from './error.js';
import { intQuery, optionalIntQuery, parse, parseId, statusQuery, stringQuery } from './validate.js';

describe('zod 请求体解析', () => {
  it('合法数据返回解析结果', () => {
    const schema = z.object({ name: z.string().trim().min(1) });
    expect(parse(schema, { name: '  秋招  ' })).toEqual({ name: '秋招' });
  });

  it('非法数据抛 400 校验错误并带字段名', () => {
    const schema = z.object({ name: z.string().min(2, '太短了') });
    expect(() => parse(schema, { name: 'a' })).toThrow(AppError);
    try {
      parse(schema, { name: 'a' });
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).status).toBe(400);
      expect((err as AppError).message).toContain('name');
      expect((err as AppError).message).toContain('太短了');
    }
  });
});

describe('路径参数解析', () => {
  it('只接受正整数', () => {
    expect(parseId('12')).toBe(12);
    expect(() => parseId('1.5')).toThrow(AppError);
    expect(() => parseId('-1')).toThrow(AppError);
    expect(() => parseId('abc')).toThrow(AppError);
    expect(() => parseId('')).toThrow(AppError);
  });
});

describe('整数查询参数', () => {
  it('非法或缺失时回退默认值（避免 NaN 进入 SQL 的 LIMIT/OFFSET）', () => {
    expect(intQuery(undefined, 1)).toBe(1);
    expect(intQuery('', 1)).toBe(1);
    expect(intQuery('abc', 1)).toBe(1);
    expect(intQuery('NaN', 20)).toBe(20);
    expect(intQuery('Infinity', 20)).toBe(20);
    expect(intQuery('2.5', 20)).toBe(20);
  });

  it('合法值夹紧到 [min, max]', () => {
    expect(intQuery('7', 1)).toBe(7);
    expect(intQuery('0', 1, { min: 1 })).toBe(1);
    expect(intQuery('-5', 1, { min: 1 })).toBe(1);
    expect(intQuery('1000', 20, { min: 1, max: 100 })).toBe(100);
    expect(intQuery('99', 20, { min: 1, max: 100 })).toBe(99);
  });

  it('重复参数取第一个，数字类型同样支持', () => {
    expect(intQuery(['3', '9'], 1)).toBe(3);
    expect(intQuery(5, 1)).toBe(5);
  });
});

describe('可选整数查询参数（筛选用，非法值直接 400）', () => {
  it('缺失或空串视为未传', () => {
    expect(optionalIntQuery(undefined)).toBeUndefined();
    expect(optionalIntQuery('')).toBeUndefined();
    expect(optionalIntQuery('   ')).toBeUndefined();
  });

  it('合法值返回数字', () => {
    expect(optionalIntQuery('8', { min: 1 })).toBe(8);
    expect(optionalIntQuery('8', { min: 1, max: 100 })).toBe(8);
  });

  it('非法值抛 400，而不是静默退化成不过滤', () => {
    expect(() => optionalIntQuery('abc')).toThrow(AppError);
    expect(() => optionalIntQuery('1.5')).toThrow(AppError);
    expect(() => optionalIntQuery('0', { min: 1 })).toThrow(AppError);
    expect(() => optionalIntQuery('101', { min: 1, max: 100 })).toThrow(AppError);
  });
});

describe('关键字查询参数', () => {
  it('去空白、限长、空串视为未传', () => {
    expect(stringQuery(undefined)).toBeUndefined();
    expect(stringQuery('  ')).toBeUndefined();
    expect(stringQuery('  腾讯  ')).toBe('腾讯');
    expect(stringQuery('abcdef', 3)).toBe('abc');
  });
});

describe('状态筛选解析', () => {
  it('支持单个与重复 query，并去重', () => {
    expect(statusQuery(undefined)).toBeUndefined();
    expect(statusQuery('')).toBeUndefined();
    expect(statusQuery('APPLIED')).toEqual(['APPLIED']);
    expect(statusQuery(['APPLIED', 'OFFER'])).toEqual(['APPLIED', 'OFFER']);
    expect(statusQuery(['APPLIED', 'APPLIED'])).toEqual(['APPLIED']);
  });

  it('非法状态抛 400', () => {
    expect(() => statusQuery('NOT_A_STATUS')).toThrow(AppError);
    expect(() => statusQuery(['APPLIED', 'nope'])).toThrow(AppError);
  });
});
