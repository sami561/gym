import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { TestContext } from 'node:test';
import { parseConfig, type AgentConfig } from '../../src/config';
import type { DriverContext, DriverHooks } from '../../src/doors/driver';
import type { Logger } from '../../src/logger';
import type { AgentDoorConfig, DeviceEvent } from '../../src/types/contracts';

export const AGENT_KEY = 'test-agent-key-0123456789abcdef';

let processDataDir: string | null = null;

/** DATA_DIR of the tests that do not choose one: a temporary folder (never ./data), removed at exit. */
function defaultDataDir(): string {
  if (!processDataDir) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'door-agent-test-'));
    process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));
    processDataDir = dir;
  }
  return processDataDir;
}

/** A DATA_DIR of its own for one test, removed when the test ends. */
export function tempDataDir(t: TestContext): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'door-agent-data-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Valid agent configuration (stdin scanner off, keep-alive out of the way) with optional overrides. */
export function agentConfig(env: Record<string, string> = {}, overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    ...parseConfig({
      SERVER_URL: 'http://127.0.0.1:9',
      AGENT_KEY,
      SCAN_STDIN: 'false',
      ZK_KEEPALIVE_SECONDS: '3600',
      DATA_DIR: env.DATA_DIR ?? defaultDataDir(),
      ...env,
    }),
    ...overrides,
  };
}

export function door(fields: Partial<AgentDoorConfig> & { id: string }): AgentDoorConfig {
  return { name: fields.id, driver: 'SIMULATOR', config: {}, unlockSeconds: 5, isActive: true, ...fields };
}

export interface RecordedHooks extends DriverHooks {
  punches: { doorId: string; event: DeviceEvent }[];
  connected: string[];
}

export function recordingHooks(): RecordedHooks {
  const punches: RecordedHooks['punches'] = [];
  const connected: string[] = [];
  return {
    punches,
    connected,
    onPunch: (doorId, event) => punches.push({ doorId, event }),
    onConnected: (doorId) => connected.push(doorId),
  };
}

export function driverContext(logger: Logger, config: AgentConfig = agentConfig(), hooks = recordingHooks()): DriverContext & { hooks: RecordedHooks } {
  return { config, logger, hooks };
}
