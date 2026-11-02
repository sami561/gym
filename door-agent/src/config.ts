import type { LogFormat, LogLevel } from './logger';

export interface AgentConfig {
  serverUrl: string;
  agentKey: string;
  /** Door used for QR codes read on stdin / POST /scan without a doorId. */
  defaultDoorId: string | null;
  localScan: { port: number | null; host: string; token: string | null };
  scanStdin: boolean;
  syncIntervalMs: number;
  heartbeatIntervalMs: number;
  dataDir: string;
  logLevel: LogLevel;
  logFormat: LogFormat;
  zk: { timeoutMs: number; inport: number; keepAliveMs: number };
  /** What to do on ZKTeco terminals with members whose access ended. */
  inactivePolicy: 'disable' | 'delete';
  eventBufferMax: number;
}

/**
 * Shortest ZKTeco timeout that works: zkteco-js resolves the user list 1 s after the terminal
 * starts answering, while its own no-reply timer equals the timeout.
 */
export const ZK_TIMEOUT_MIN_MS = 2000;

export class ConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid configuration:\n  - ${problems.join('\n  - ')}`);
    this.name = 'ConfigError';
  }
}

type Env = Record<string, string | undefined>;

/** Reads and validates the agent configuration from environment variables (see .env.example). */
export function parseConfig(env: Env, options: { isTTY?: boolean } = {}): AgentConfig {
  const problems: string[] = [];
  const get = (name: string) => {
    const value = env[name]?.trim();
    return value ? value : undefined;
  };

  const int = (name: string, fallback: number, min: number, max: number): number => {
    const raw = get(name);
    if (raw === undefined) return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < min || value > max) {
      problems.push(`${name} must be an integer between ${min} and ${max} (got "${raw}")`);
      return fallback;
    }
    return value;
  };

  const oneOf = <T extends string>(name: string, allowed: readonly T[], fallback: T): T => {
    const raw = get(name)?.toLowerCase();
    if (raw === undefined) return fallback;
    if (!(allowed as readonly string[]).includes(raw)) {
      problems.push(`${name} must be one of ${allowed.join(', ')} (got "${raw}")`);
      return fallback;
    }
    return raw as T;
  };

  const bool = (name: string, fallback: boolean): boolean => {
    const raw = get(name)?.toLowerCase();
    if (raw === undefined) return fallback;
    if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
    if (['0', 'false', 'no', 'off'].includes(raw)) return false;
    problems.push(`${name} must be true or false (got "${raw}")`);
    return fallback;
  };

  let serverUrl = get('SERVER_URL') ?? '';
  if (!serverUrl) {
    problems.push('SERVER_URL is required (e.g. https://api.meliora-gym.tn or http://192.168.1.10:4000)');
  } else {
    try {
      const url = new URL(serverUrl);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocol');
      serverUrl = serverUrl.replace(/\/+$/, '');
    } catch {
      problems.push(`SERVER_URL must be an http(s) URL (got "${serverUrl}")`);
    }
  }

  const agentKey = get('AGENT_KEY') ?? '';
  if (!agentKey) problems.push('AGENT_KEY is required (create the agent in the admin: Accès → Agents)');
  else if (agentKey.length < 16) problems.push('AGENT_KEY looks truncated (expected at least 16 characters)');

  const scanPort = int('LOCAL_SCAN_PORT', 0, 0, 65535);
  const logFormatRaw = oneOf('LOG_FORMAT', ['auto', 'json', 'pretty'] as const, 'auto');

  const config: AgentConfig = {
    serverUrl,
    agentKey,
    defaultDoorId: get('DEFAULT_DOOR_ID') ?? null,
    localScan: {
      port: scanPort === 0 ? null : scanPort,
      host: get('LOCAL_SCAN_HOST') ?? '0.0.0.0',
      token: get('LOCAL_SCAN_TOKEN') ?? null,
    },
    scanStdin: bool('SCAN_STDIN', true),
    syncIntervalMs: int('SYNC_INTERVAL_SECONDS', 300, 30, 86_400) * 1000,
    heartbeatIntervalMs: int('HEARTBEAT_SECONDS', 30, 5, 3600) * 1000,
    dataDir: get('DATA_DIR') ?? './data',
    logLevel: oneOf('LOG_LEVEL', ['debug', 'info', 'warn', 'error'] as const, 'info'),
    logFormat: logFormatRaw === 'auto' ? (options.isTTY ? 'pretty' : 'json') : logFormatRaw,
    zk: {
      timeoutMs: int('ZK_TIMEOUT_MS', 5000, ZK_TIMEOUT_MIN_MS, 60_000),
      inport: int('ZK_UDP_INPORT', 5200, 1, 65535),
      keepAliveMs: int('ZK_KEEPALIVE_SECONDS', 60, 10, 3600) * 1000,
    },
    inactivePolicy: oneOf('INACTIVE_POLICY', ['disable', 'delete'] as const, 'disable'),
    eventBufferMax: int('EVENT_BUFFER_MAX', 5000, 10, 1_000_000),
  };

  if (problems.length) throw new ConfigError(problems);
  return config;
}
