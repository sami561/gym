/**
 * Runs async tasks one at a time. ZKTeco terminals speak a request/reply protocol on a
 * single socket, so commands (unlock, user writes, keep-alive) must never interleave.
 */
export class CommandQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private pending = 0;

  get size(): number {
    return this.pending;
  }

  run<T>(task: () => Promise<T>, timeoutMs?: number, label = 'command'): Promise<T> {
    this.pending++;
    const result = this.tail.then(() => withTimeout(task(), timeoutMs, label));
    const settle = () => {
      this.pending--;
    };
    this.tail = result.then(settle, settle);
    return result;
  }
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs?: number, label = 'operation'): Promise<T> {
  if (!timeoutMs) return promise;
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs} ms`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
