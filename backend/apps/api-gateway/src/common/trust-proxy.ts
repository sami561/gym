/** Docker networks and the nginx in front of the gateway use private addresses. */
export const DEFAULT_TRUST_PROXY = 'loopback, linklocal, uniquelocal';

/**
 * Express "trust proxy" setting from TRUST_PROXY, so req.ip (rate limits) is the client behind the
 * proxy rather than the proxy itself: "false" / "0" → trust no proxy, "true" → trust every hop (only
 * when clients cannot reach the gateway directly), an integer → that many hops, anything else → a
 * comma-separated list of addresses, subnets or presets (loopback, linklocal, uniquelocal).
 */
export function parseTrustProxy(raw: string | undefined): boolean | number | string[] {
  const value = raw?.trim() || DEFAULT_TRUST_PROXY;
  const lower = value.toLowerCase();
  if (lower === 'false' || lower === '0') return false;
  if (lower === 'true') return true;
  if (/^\d+$/.test(value)) return Number(value);
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}
