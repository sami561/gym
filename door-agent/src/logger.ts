export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFormat = 'json' | 'pretty';
export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  child(bindings: LogFields): Logger;
}

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Structured logger: one JSON object per line (journald / pm2 / Docker friendly) or a readable line on a TTY. */
export function createLogger(
  options: { level: LogLevel; format: LogFormat },
  bindings: LogFields = {},
  write: (line: string) => void = (line) => process.stdout.write(line + '\n'),
): Logger {
  const emit = (level: LogLevel, msg: string, fields?: LogFields) => {
    if (ORDER[level] < ORDER[options.level]) return;
    const data = serialize({ ...bindings, ...fields });
    if (options.format === 'json') {
      write(JSON.stringify({ time: new Date().toISOString(), level, msg, ...data }));
      return;
    }
    const time = new Date().toTimeString().slice(0, 8);
    const component = data.component ? `[${String(data.component)}] ` : '';
    delete data.component;
    const extra = Object.entries(data)
      .map(([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`)
      .join(' ');
    write(`${time} ${level.toUpperCase().padEnd(5)} ${component}${msg}${extra ? ' ' + extra : ''}`);
  };

  return {
    debug: (msg, fields) => emit('debug', msg, fields),
    info: (msg, fields) => emit('info', msg, fields),
    warn: (msg, fields) => emit('warn', msg, fields),
    error: (msg, fields) => emit('error', msg, fields),
    child: (extra) => createLogger(options, { ...bindings, ...extra }, write),
  };
}

function serialize(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    out[key] = value instanceof Error ? { message: value.message, stack: value.stack } : value;
  }
  return out;
}

/** Message of anything thrown (zkteco-js throws nested plain objects shaped { err, command }). */
export function errorMessage(err: unknown, depth = 0): string {
  if (err instanceof Error) return err.message || err.name;
  if (err && typeof err === 'object' && depth < 5) {
    const e = err as { message?: unknown; err?: unknown; command?: unknown; code?: unknown };
    if (e.err !== undefined && e.err !== err) {
      const inner = errorMessage(e.err, depth + 1);
      const command = typeof e.command === 'string' ? e.command : '';
      return command && !inner.startsWith(`${command}: `) ? `${command}: ${inner}` : inner;
    }
    if (typeof e.message === 'string' && e.message) return e.message;
    if (typeof e.code === 'string') return e.code;
  }
  return typeof err === 'string' ? err : JSON.stringify(err) ?? String(err);
}
