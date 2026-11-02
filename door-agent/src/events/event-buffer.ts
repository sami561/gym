import * as fs from 'fs';
import * as path from 'path';
import type { DeviceEvent } from '../types/contracts';

export interface BufferedEvent extends DeviceEvent {
  doorId: string;
}

export interface EventBatch {
  doorId: string;
  events: DeviceEvent[];
  keys: string[];
}

export interface EventBufferOptions {
  /** Oldest events are dropped beyond this size. */
  max: number;
  /** JSON file used to keep punches across restarts (null = memory only). */
  file?: string | null;
  persistDelayMs?: number;
}

/**
 * Terminal punches waiting to be acknowledged by the server. Survives disconnections and
 * restarts (persisted to disk), ignores duplicates, and hands out per-door batches.
 */
export class EventBuffer {
  private events: BufferedEvent[] = [];
  private readonly keys = new Set<string>();
  /** Recently acknowledged keys, so a punch replayed by the terminal is not sent twice. */
  private readonly acked: string[] = [];
  private persistTimer: NodeJS.Timeout | null = null;
  dropped = 0;

  constructor(private readonly options: EventBufferOptions) {}

  static key(event: BufferedEvent): string {
    return `${event.doorId}|${event.deviceUserId}|${event.at}`;
  }

  get size(): number {
    return this.events.length;
  }

  /** Loads events persisted by a previous run. Corrupt files are ignored. */
  load(): number {
    const file = this.options.file;
    if (!file || !fs.existsSync(file)) return 0;
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8')) as BufferedEvent[];
      let count = 0;
      for (const event of Array.isArray(saved) ? saved : []) {
        if (event && typeof event.doorId === 'string' && typeof event.deviceUserId === 'string') {
          if (this.insert(event)) count++;
        }
      }
      return count;
    } catch {
      return 0;
    }
  }

  /** Returns false when the event is a duplicate. */
  push(doorId: string, event: DeviceEvent): boolean {
    const added = this.insert({ doorId, deviceUserId: event.deviceUserId, method: event.method, at: event.at });
    if (added) this.schedulePersist();
    return added;
  }

  /** Oldest events of the door that has the oldest pending event. */
  nextBatch(maxSize = 100): EventBatch | null {
    const first = this.events[0];
    if (!first) return null;
    const batch = this.events.filter((event) => event.doorId === first.doorId).slice(0, maxSize);
    return {
      doorId: first.doorId,
      events: batch.map(({ deviceUserId, method, at }) => ({ deviceUserId, method, at })),
      keys: batch.map(EventBuffer.key),
    };
  }

  /** Removes events the server acknowledged. */
  ack(keys: string[]): void {
    const done = new Set(keys);
    this.events = this.events.filter((event) => !done.has(EventBuffer.key(event)));
    for (const key of keys) {
      this.keys.delete(key);
      this.acked.push(key);
    }
    while (this.acked.length > 1000) this.acked.shift();
    this.schedulePersist();
  }

  /** Writes the pending events now (call on shutdown). */
  flushToDisk(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = null;
    const file = this.options.file;
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.events));
    fs.renameSync(tmp, file);
  }

  private insert(event: BufferedEvent): boolean {
    const key = EventBuffer.key(event);
    if (this.keys.has(key) || this.acked.includes(key)) return false;
    this.events.push(event);
    this.keys.add(key);
    while (this.events.length > this.options.max) {
      const removed = this.events.shift()!;
      this.keys.delete(EventBuffer.key(removed));
      this.dropped++;
    }
    return true;
  }

  private schedulePersist(): void {
    if (!this.options.file || this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      try {
        this.flushToDisk();
      } catch {
        /* disk full / read-only: events stay in memory */
      }
    }, this.options.persistDelayMs ?? 500);
    this.persistTimer.unref?.();
  }
}
