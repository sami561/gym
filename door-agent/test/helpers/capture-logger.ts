import { createLogger, type Logger, type LogLevel } from '../../src/logger';

export interface LogEntry {
  level: LogLevel;
  msg: string;
  [field: string]: unknown;
}

/** Real JSON logger whose lines are kept in memory, so tests can assert on what was logged. */
export function captureLogger(): { logger: Logger; entries: LogEntry[] } {
  const entries: LogEntry[] = [];
  const logger = createLogger({ level: 'debug', format: 'json' }, {}, (line) => entries.push(JSON.parse(line)));
  return { logger, entries };
}
