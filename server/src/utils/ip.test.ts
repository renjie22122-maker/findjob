import { describe, expect, it } from 'vitest';
import { isPublicIpAddress, normalizeHostname } from './ip.js';

describe('主机名规范化', () => {
  it('去掉 IPv6 方括号、末尾根点并转小写', () => {
    expect(normalizeHostname('[::1]')).toBe('::1');
    expect(normalizeHostname('Example.COM.')).toBe('example.com');
    expect(normalizeHostname('127.0.0.1')).toBe('127.0.0.1');
  });
});

describe('公网地址判定（含 SSRF 常见绕过写法）', () => {
  it('放行公网单播地址', () => {
    expect(isPublicIpAddress('8.8.8.8')).toBe(true);
    expect(isPublicIpAddress('1.1.1.1')).toBe(true);
    expect(isPublicIpAddress('2606:4700:4700::1111')).toBe(true);
    expect(isPublicIpAddress('2a00:1450:4001:800::200e')).toBe(true);
  });

  it('拒绝回环、私网与保留地址', () => {
    expect(isPublicIpAddress('127.0.0.1')).toBe(false);
    expect(isPublicIpAddress('127.1.2.3')).toBe(false);
    expect(isPublicIpAddress('10.0.0.8')).toBe(false);
    expect(isPublicIpAddress('172.16.0.1')).toBe(false);
    expect(isPublicIpAddress('172.31.255.254')).toBe(false);
    expect(isPublicIpAddress('192.168.1.1')).toBe(false);
    expect(isPublicIpAddress('169.254.169.254')).toBe(false);
    expect(isPublicIpAddress('100.64.0.1')).toBe(false);
    expect(isPublicIpAddress('0.0.0.0')).toBe(false);
    expect(isPublicIpAddress('198.18.0.1')).toBe(false);
    expect(isPublicIpAddress('198.51.100.7')).toBe(false);
    expect(isPublicIpAddress('203.0.113.9')).toBe(false);
    expect(isPublicIpAddress('192.0.2.5')).toBe(false);
    expect(isPublicIpAddress('224.0.0.1')).toBe(false);
    expect(isPublicIpAddress('255.255.255.255')).toBe(false);
  });

  it('172 段边界只拒绝 /12 内地址', () => {
    expect(isPublicIpAddress('172.15.255.255')).toBe(true);
    expect(isPublicIpAddress('172.32.0.0')).toBe(true);
  });

  it('拒绝 IPv6 非公网与映射写法', () => {
    expect(isPublicIpAddress('::1')).toBe(false);
    expect(isPublicIpAddress('::')).toBe(false);
    expect(isPublicIpAddress('fe80::1')).toBe(false);
    expect(isPublicIpAddress('fc00::1')).toBe(false);
    expect(isPublicIpAddress('fd00::1')).toBe(false);
    expect(isPublicIpAddress('::ffff:127.0.0.1')).toBe(false);
    expect(isPublicIpAddress('::ffff:8.8.8.8')).toBe(false);
    expect(isPublicIpAddress('2001:db8::1')).toBe(false);
    expect(isPublicIpAddress('2002::1')).toBe(false);
    expect(isPublicIpAddress('2001:0:0:0:0:0:0:1')).toBe(false);
  });

  it('非 IP 字符串一律拒绝', () => {
    expect(isPublicIpAddress('example.com')).toBe(false);
    expect(isPublicIpAddress('999.1.1.1')).toBe(false);
    expect(isPublicIpAddress('8.8.8')).toBe(false);
    expect(isPublicIpAddress('')).toBe(false);
  });
});
