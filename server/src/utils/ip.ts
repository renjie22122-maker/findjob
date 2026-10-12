/**
 * 纯函数 IP / 主机名判定（只依赖 node:net，无业务依赖）。
 *
 * 从 utils/safeFetch.ts 拆出：SSRF 防护的核心判定不依赖 Express、AppError 或 DNS，
 * 因此可以独立单测（含 IPv4-mapped IPv6 等绕过写法），也便于其他出站模块复用同一口径。
 */
import { isIP } from 'node:net';

/** 去掉 IPv6 方括号与末尾根点，并统一小写 */
export function normalizeHostname(hostname: string): string {
  const withoutBrackets = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
  return withoutBrackets.replace(/\.$/, '').toLowerCase();
}

function ipv4Parts(address: string): number[] | null {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return parts;
}

function isPublicIpv4(address: string): boolean {
  const parts = ipv4Parts(address);
  if (!parts) return false;
  const [a, b, c] = parts;

  // 非公网、链路本地、运营商 NAT、文档/基准测试及组播/保留地址。
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 192 && b === 88 && c === 99) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function ipv6Groups(address: string): number[] | null {
  let normalized = address.toLowerCase();
  const zoneIndex = normalized.indexOf('%');
  if (zoneIndex >= 0) normalized = normalized.slice(0, zoneIndex);

  // 将 IPv4 尾部转换为两个 16 位分组，例如 ::ffff:127.0.0.1。
  if (normalized.includes('.')) {
    const lastColon = normalized.lastIndexOf(':');
    const parts = ipv4Parts(normalized.slice(lastColon + 1));
    if (lastColon < 0 || !parts) return null;
    const high = ((parts[0] << 8) | parts[1]).toString(16);
    const low = ((parts[2] << 8) | parts[3]).toString(16);
    normalized = `${normalized.slice(0, lastColon + 1)}${high}:${low}`;
  }

  const halves = normalized.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;

  const rawGroups = halves.length === 2
    ? [...left, ...Array.from({ length: missing }, () => '0'), ...right]
    : left;
  if (rawGroups.length !== 8) return null;
  const groups = rawGroups.map((group) => (/^[0-9a-f]{1,4}$/.test(group) ? Number.parseInt(group, 16) : -1));
  return groups.some((group) => group < 0) ? null : groups;
}

function isPublicIpv6(address: string): boolean {
  const groups = ipv6Groups(address);
  if (!groups) return false;

  // 拒绝 IPv4 映射/兼容写法，防止用另一种文本表示绕过 IPv4 检查。
  if (groups.slice(0, 5).every((group) => group === 0) && (groups[5] === 0 || groups[5] === 0xffff)) {
    return false;
  }

  // 当前公网单播 IPv6 位于 2000::/3；再排除文档及隧道专用前缀。
  if ((groups[0] & 0xe000) !== 0x2000) return false;
  if (groups[0] === 0x2001 && (groups[1] === 0 || groups[1] === 0x0db8)) return false;
  if (groups[0] === 0x2002) return false;
  return true;
}

/** 是否是可安全访问的公网单播地址（内网 / 保留 / IPv4 映射写法一律为 false） */
export function isPublicIpAddress(address: string): boolean {
  const version = isIP(address);
  return version === 4 ? isPublicIpv4(address) : version === 6 ? isPublicIpv6(address) : false;
}
