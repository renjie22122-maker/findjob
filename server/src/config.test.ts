import { describe, expect, it } from 'vitest';
import { isLoopbackHost, resolveBoundedInt, resolveHost, resolvePort } from './config.js';

describe('服务监听地址', () => {
  it('未配置或空白 HOST 时仅监听回环地址', () => {
    expect(resolveHost(undefined)).toBe('127.0.0.1');
    expect(resolveHost('   ')).toBe('127.0.0.1');
  });

  it('显式 HOST 配置会被保留', () => {
    expect(resolveHost(' 0.0.0.0 ')).toBe('0.0.0.0');
    expect(resolveHost('::1')).toBe('::1');
  });
});

describe('回环地址判定（用于暴露告警）', () => {
  it('识别回环主机名', () => {
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost(' localhost ')).toBe(true);
    expect(isLoopbackHost('::1')).toBe(true);
    expect(isLoopbackHost('[::1]')).toBe(true);
  });

  it('非回环主机名视为对外暴露', () => {
    expect(isLoopbackHost('0.0.0.0')).toBe(false);
    expect(isLoopbackHost('192.168.1.20')).toBe(false);
    expect(isLoopbackHost('::')).toBe(false);
  });
});

describe('数值环境变量解析', () => {
  it('非法端口回退默认值', () => {
    expect(resolvePort(undefined)).toBe(3001);
    expect(resolvePort('abc')).toBe(3001);
    expect(resolvePort('0')).toBe(3001);
    expect(resolvePort('70000')).toBe(3001);
    expect(resolvePort('8080')).toBe(8080);
  });

  it('有界整数越界回退默认值', () => {
    expect(resolveBoundedInt('1500', 1500, { min: 200, max: 60_000 })).toBe(1500);
    expect(resolveBoundedInt('10', 1500, { min: 200, max: 60_000 })).toBe(1500);
    expect(resolveBoundedInt('1e3', 1500, { min: 200, max: 60_000 })).toBe(1000);
    expect(resolveBoundedInt('3.5', 1500, { min: 200, max: 60_000 })).toBe(1500);
    expect(resolveBoundedInt(undefined, 10, { min: 1, max: 50 })).toBe(10);
  });
});
