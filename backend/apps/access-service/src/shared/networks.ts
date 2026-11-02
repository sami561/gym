import { csvEnv, ipInCidrs } from '@app/common';

/** Private networks a relay door without an agent may be on when RELAY_ALLOWED_NETWORKS is unset. */
export const DEFAULT_RELAY_NETWORKS = ['10.0.0.0/8', '192.168.0.0/16'];

export interface NetworkList {
  name: string;
  networks: string[];
  /** First malformed entry; the callers then refuse what the list would allow (fail closed). */
  error: string | null;
}

/** IP / CIDR list from a comma-separated env var, checked once so a typo shows up at boot. */
export function readNetworkList(name: string, fallback: string[] = []): NetworkList {
  const configured = csvEnv(name);
  const networks = configured.length > 0 ? configured : fallback;
  try {
    ipInCidrs('0.0.0.0', networks); // throws on a malformed entry
    return { name, networks, error: null };
  } catch (err) {
    return { name, networks, error: (err as Error).message };
  }
}
