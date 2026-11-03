import * as fs from 'fs';
import * as path from 'path';
import { errorMessage } from '../logger';

/** Version of the file below. Later versions must keep reading this one. */
export const MANAGED_USERS_VERSION = 1;

/** DATA_DIR/zkteco-users-<doorId>.json, e.g. {"version":1,"doorId":"8c1d…","pins":["7","12"]} */
interface ManagedUsersFile {
  version: number;
  doorId: string;
  /** PINs of the terminal users the agent created or recognised as members, sorted. */
  pins: string[];
}

/**
 * Users the agent manages on one ZKTeco terminal. The member sync only changes these: users made
 * by hand on the terminal (staff, installer, administrators) are never modified. Kept in DATA_DIR
 * so a restart does not forget them.
 */
export class ManagedUsers {
  private readonly pins = new Set<string>();
  /** Read from or written to disk: false until the first member sync of the terminal. */
  persisted = false;
  /** Changed since it was read or written. */
  changed = false;

  constructor(
    readonly file: string,
    private readonly doorId: string,
  ) {}

  static fileFor(dataDir: string, doorId: string): string {
    return path.join(dataDir, `zkteco-users-${doorId.replace(/[^A-Za-z0-9_-]/g, '_')}.json`);
  }

  /** Reads the saved list. Returns why it could not be used (the list then starts empty), else null. */
  load(): string | null {
    let text: string;
    try {
      text = fs.readFileSync(this.file, 'utf8');
    } catch (err) {
      return (err as NodeJS.ErrnoException).code === 'ENOENT' ? null : errorMessage(err);
    }
    try {
      const saved = JSON.parse(text) as Partial<ManagedUsersFile> | null;
      if (saved?.version !== MANAGED_USERS_VERSION || !Array.isArray(saved.pins)) {
        return `unsupported format (version ${String(saved?.version)})`;
      }
      for (const pin of saved.pins) if (typeof pin === 'string' && pin) this.pins.add(pin);
      this.persisted = true;
      return null;
    } catch (err) {
      return errorMessage(err);
    }
  }

  has(pin: string): boolean {
    return this.pins.has(pin);
  }

  add(pin: string): void {
    if (this.pins.has(pin)) return;
    this.pins.add(pin);
    this.changed = true;
  }

  delete(pin: string): void {
    if (this.pins.delete(pin)) this.changed = true;
  }

  /** Forgets the PINs no longer on the terminal (users deleted there). */
  retain(onTerminal: { has(pin: string): boolean }): void {
    for (const pin of this.pins) if (!onTerminal.has(pin)) this.delete(pin);
  }

  list(): string[] {
    return [...this.pins].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
  }

  /** Writes the list atomically. Throws when the disk refuses it. */
  save(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const content: ManagedUsersFile = { version: MANAGED_USERS_VERSION, doorId: this.doorId, pins: this.list() };
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(content));
    fs.renameSync(tmp, this.file);
    this.persisted = true;
    this.changed = false;
  }
}
