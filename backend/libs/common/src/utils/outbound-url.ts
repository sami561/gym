import { BadRequestException } from '@nestjs/common';
import * as dns from 'dns';
import { BlockList, isIP } from 'net';

/**
 * Guard for server-side HTTP calls to URLs that come from configuration: workflow
 * automations, door relays, webhooks (security review, finding 7: SSRF).
 *
 *   const url = parseOutboundUrl(automation.url);               // http(s), no credentials
 *   await assertOutboundAllowed(url, { allowHosts, allowPrivateCidrs });
 *   const res = await fetch(url, { redirect: 'manual', ... });  // a 3xx is a failure
 *
 * - Callers must fetch with `redirect: 'manual'` and treat any 3xx as a failure: a
 *   redirect leads to a destination this check never saw.
 * - DNS is resolved and checked at call time, so run the check right before each
 *   request, not only when the URL is saved. fetch resolves the name again, so a host
 *   that changes its answer in between (DNS rebinding) is not covered.
 */

export type AddressKind = 'public' | 'private' | 'loopback' | 'link-local' | 'unspecified' | 'multicast' | 'reserved';

export interface OutboundPolicy {
  /**
   * Trusted hosts that skip every other check, compared case-insensitively:
   * "n8n:5678" matches that host on that port, "n8n" that host on any port.
   * Build it from env URLs: hostsFromUrls(process.env.N8N_WEBHOOK_URL).
   */
  allowHosts?: string[];
  /**
   * IPs or CIDRs of private networks (10/8, 172.16/12, 192.168/16, 100.64/10, fc00::/7)
   * the caller may reach, e.g. the gym LAN "192.168.1.0/24". Write IPv4 ranges in IPv4
   * notation. Loopback, link-local, unspecified, multicast and reserved addresses stay
   * refused whatever this list says.
   */
  allowPrivateCidrs?: string[];
}

export const MAX_OUTBOUND_URL_LENGTH = 2048;

type Family = 'ipv4' | 'ipv6';
type SpecialKind = Exclude<AddressKind, 'public'>;

/** IANA special-purpose ranges, checked in this order. */
const SPECIAL_RANGES: Record<Family, [SpecialKind, string[]][]> = {
  ipv4: [
    ['unspecified', ['0.0.0.0/8']],
    ['loopback', ['127.0.0.0/8']],
    ['private', ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '100.64.0.0/10']],
    // 169.254.169.254 is the cloud metadata endpoint.
    ['link-local', ['169.254.0.0/16']],
    ['multicast', ['224.0.0.0/4']],
    [
      'reserved',
      [
        '192.0.0.0/24', // IETF protocol assignments
        '192.0.2.0/24', // documentation (TEST-NET-1/2/3)
        '198.51.100.0/24',
        '203.0.113.0/24',
        '192.88.99.0/24', // former 6to4 relay anycast
        '198.18.0.0/15', // benchmarking
        '240.0.0.0/4', // class E, including 255.255.255.255
      ],
    ],
  ],
  ipv6: [
    ['unspecified', ['::/128']],
    ['loopback', ['::1/128']],
    // Unique local addresses, plus the deprecated site-local range.
    ['private', ['fc00::/7', 'fec0::/10']],
    ['link-local', ['fe80::/10']],
    ['multicast', ['ff00::/8']],
    [
      'reserved',
      [
        '::/96', // IPv4-compatible (deprecated)
        '::ffff:0:0:0/96', // IPv4-translated
        '64:ff9b:1::/48', // local-use NAT64
        '100::/64', // discard
        '2001::/23', // IETF protocol assignments (Teredo, benchmarking...)
        '2001:db8::/32', // documentation
        '3fff::/20', // documentation
        '2002::/16', // 6to4: tunnels to the IPv4 it embeds
      ],
    ],
  ],
};

function blockList(family: Family, cidrs: string[]): BlockList {
  const list = new BlockList();
  for (const cidr of cidrs) {
    const [network, prefix] = cidr.split('/');
    list.addSubnet(network, Number(prefix), family);
  }
  return list;
}

const SPECIAL_LISTS: Record<Family, [SpecialKind, BlockList][]> = {
  ipv4: SPECIAL_RANGES.ipv4.map(([kind, cidrs]) => [kind, blockList('ipv4', cidrs)]),
  ipv6: SPECIAL_RANGES.ipv6.map(([kind, cidrs]) => [kind, blockList('ipv6', cidrs)]),
};

/** Only global unicast IPv6 (2000::/3) can be public; the rest is unassigned. */
const GLOBAL_UNICAST_V6 = blockList('ipv6', ['2000::/3']);

const DEFAULT_PORTS: Record<string, string> = { 'http:': '80', 'https:': '443' };

interface IpAddress {
  family: Family;
  address: string;
}

/** The eight 16-bit groups of a valid IPv6 address (a dotted IPv4 tail is allowed). */
function ipv6Groups(address: string): number[] {
  let text = address;
  const dotted = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (dotted) {
    const [a, b, c, d] = dotted.slice(1).map(Number);
    text = `${text.slice(0, dotted.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = text.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const missing = tail === undefined ? 0 : 8 - left.length - right.length;
  return [...left, ...Array<string>(missing).fill('0'), ...right].map((group) => parseInt(group, 16));
}

/** IPv4 carried by an IPv4-mapped (::ffff:0:0/96) or NAT64 (64:ff9b::/96) address. */
function embeddedIPv4(groups: number[]): string | null {
  const mapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  const nat64 = groups[0] === 0x64 && groups[1] === 0xff9b && groups.slice(2, 6).every((group) => group === 0);
  if (!mapped && !nat64) return null;
  return [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff].join('.');
}

/**
 * Validates an IP literal ([brackets] and an IPv6 zone id are dropped) and returns the
 * address to compare: IPv4-mapped and NAT64 addresses become the IPv4 they carry.
 */
function parseIp(raw: string): IpAddress | null {
  if (typeof raw !== 'string') return null;
  let text = raw.trim();
  if (text.startsWith('[') && text.endsWith(']')) text = text.slice(1, -1);
  if (text.includes(':')) text = text.replace(/%.*$/, '');
  const version = isIP(text);
  if (version === 4) return { family: 'ipv4', address: text };
  if (version !== 6) return null;
  const ipv4 = embeddedIPv4(ipv6Groups(text.toLowerCase()));
  return ipv4 ? { family: 'ipv4', address: ipv4 } : { family: 'ipv6', address: text };
}

/** One BlockList per family. Blank entries are skipped; malformed ones throw (config mistake). */
function compileCidrs(cidrs: readonly string[]): Record<Family, BlockList> {
  const lists: Record<Family, BlockList> = { ipv4: new BlockList(), ipv6: new BlockList() };
  for (const raw of cidrs) {
    const entry = String(raw ?? '').trim();
    if (!entry) continue;
    const [network, prefixText, ...rest] = entry.split('/');
    const version = network.includes('%') ? 0 : isIP(network);
    const max = version === 4 ? 32 : 128;
    const prefix = prefixText === undefined ? max : /^\d{1,3}$/.test(prefixText) ? Number(prefixText) : NaN;
    if (!version || rest.length > 0 || !(prefix >= 0 && prefix <= max)) {
      throw new Error(`Plage IP invalide dans la configuration : « ${entry} »`);
    }
    const family: Family = version === 4 ? 'ipv4' : 'ipv6';
    lists[family].addSubnet(network, prefix, family);
  }
  return lists;
}

function inRanges(lists: Record<Family, BlockList>, ip: string): boolean {
  const parsed = parseIp(ip);
  return parsed !== null && lists[parsed.family].check(parsed.address, parsed.family);
}

function checkOutboundUrl(url: URL): void {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BadRequestException('URL invalide : seuls les protocoles http et https sont acceptés.');
  }
  if (url.username || url.password) {
    throw new BadRequestException("URL invalide : retirez l'identifiant et le mot de passe de l'URL.");
  }
}

function isAllowedHost(url: URL, allowHosts: readonly string[]): boolean {
  const hostname = url.hostname.toLowerCase();
  // url.port is empty for the scheme's default port: "n8n:80" still matches http://n8n/.
  const hostAndPort = `${hostname}:${url.port || DEFAULT_PORTS[url.protocol]}`;
  return allowHosts.some((raw) => {
    const entry = String(raw ?? '')
      .trim()
      .toLowerCase();
    return entry !== '' && (entry === hostname || entry === hostAndPort);
  });
}

async function resolveHost(hostname: string): Promise<string[]> {
  try {
    const records = await dns.promises.lookup(hostname, { all: true, verbatim: true });
    return records.map((record) => record.address);
  } catch {
    return [];
  }
}

/** Parses a URL typed by an admin: http(s) only, no user:password, at most 2048 characters. */
export function parseOutboundUrl(raw: unknown): URL {
  if (typeof raw !== 'string' || !raw.trim()) throw new BadRequestException('URL invalide.');
  if (raw.length > MAX_OUTBOUND_URL_LENGTH) {
    throw new BadRequestException(`URL trop longue (${MAX_OUTBOUND_URL_LENGTH} caractères maximum).`);
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new BadRequestException('URL invalide.');
  }
  checkOutboundUrl(url);
  return url;
}

/**
 * Kind of an IP literal (v4 or v6). IPv4-mapped (::ffff:10.0.0.1, ::ffff:a00:1) and NAT64
 * (64:ff9b::/96) addresses are classified by the IPv4 they carry. Anything that is not
 * a valid IP literal (a host name, "127.1") is 'reserved', so it is never public.
 */
export function classifyAddress(ip: string): AddressKind {
  const parsed = parseIp(ip);
  if (!parsed) return 'reserved';
  for (const [kind, list] of SPECIAL_LISTS[parsed.family]) {
    if (list.check(parsed.address, parsed.family)) return kind;
  }
  if (parsed.family === 'ipv6' && !GLOBAL_UNICAST_V6.check(parsed.address, 'ipv6')) return 'reserved';
  return 'public';
}

/**
 * True when `ip` is one of `cidrs` (plain IPs or CIDRs, IPv4 or IPv6). IPv4-mapped IPv6
 * addresses match IPv4 entries. Blank entries are ignored; a malformed entry throws, so
 * a config mistake shows up instead of silently matching nothing.
 */
export function ipInCidrs(ip: string, cidrs: string[]): boolean {
  return inRanges(compileCidrs(cidrs), ip);
}

/**
 * Throws BadRequestException("Destination interdite : <host>") unless every address the
 * host resolves to is public, or private and inside `policy.allowPrivateCidrs`. A host in
 * `policy.allowHosts` skips the check. An unresolvable host is refused too, and a
 * malformed `allowPrivateCidrs` entry throws a plain Error (config mistake).
 */
export async function assertOutboundAllowed(url: URL, policy: OutboundPolicy = {}): Promise<void> {
  checkOutboundUrl(url);
  const privateRanges = compileCidrs(policy.allowPrivateCidrs ?? []);
  if (isAllowedHost(url, policy.allowHosts ?? [])) return;

  // The WHATWG parser already normalised the host: http://2130706433/ and http://0x7f.1/
  // both read 127.0.0.1. IPv6 literals keep their [brackets] in url.hostname.
  const host = url.hostname.startsWith('[') ? url.hostname.slice(1, -1) : url.hostname;
  const addresses = isIP(host) ? [host] : await resolveHost(url.hostname);
  if (addresses.length === 0) throw new BadRequestException(`Destination introuvable : ${url.hostname}`);
  for (const address of addresses) {
    const kind = classifyAddress(address);
    const allowed = kind === 'public' || (kind === 'private' && inRanges(privateRanges, address));
    if (!allowed) throw new BadRequestException(`Destination interdite : ${url.hostname}`);
  }
}

/**
 * "host:port" ("n8n:5678") of each valid URL, to build `allowHosts` from env URLs. The port is always
 * written (443 for https://n8n.example.com/...), so only that port of the host is trusted; a URL of
 * another scheme without a port is skipped.
 */
export function hostsFromUrls(...urls: (string | undefined)[]): string[] {
  const hosts = new Set<string>();
  for (const raw of urls) {
    if (!raw?.trim()) continue;
    try {
      const { hostname, port, protocol } = new URL(raw.trim());
      const effectivePort = port || DEFAULT_PORTS[protocol];
      if (hostname && effectivePort) hosts.add(`${hostname}:${effectivePort}`.toLowerCase());
    } catch {
      // Not a URL: nothing to trust.
    }
  }
  return [...hosts];
}
