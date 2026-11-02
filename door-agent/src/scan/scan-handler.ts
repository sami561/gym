import type { Logger } from '../logger';
import type { AccessDecision } from '../types/contracts';

export type QrVerifier = (doorId: string, code: string) => Promise<AccessDecision>;

/**
 * Entry point for QR codes read locally (USB scanner on stdin, ESP32 / Wiegand reader over HTTP).
 * Resolves the door and swallows the double reads scanners often produce.
 */
export class ScanHandler {
  private readonly recent = new Map<string, { at: number; decision: Promise<AccessDecision> }>();

  constructor(
    private readonly verify: QrVerifier,
    private readonly resolveDoor: (requested: string | null) => string | null,
    private readonly logger: Logger,
    private readonly dedupeMs = 3000,
  ) {}

  handle(code: string, requestedDoorId: string | null = null): Promise<AccessDecision> {
    const trimmed = code.trim();
    const now = Date.now();
    for (const [key, value] of this.recent) if (now - value.at > this.dedupeMs) this.recent.delete(key);

    const doorId = this.resolveDoor(requestedDoorId);
    if (!doorId) {
      return Promise.resolve({
        granted: false,
        reason: 'Aucune porte configurée pour ce lecteur (DEFAULT_DOOR_ID).',
        at: new Date().toISOString(),
      });
    }
    const key = `${doorId}|${trimmed}`;
    const cached = this.recent.get(key);
    if (cached) return cached.decision;

    const decision = this.verify(doorId, trimmed).then((result) => {
      const fields = { doorId, member: result.member?.fullName, reason: result.reason };
      if (result.granted) this.logger.info('QR accepted', fields);
      else this.logger.warn('QR refused', fields);
      return result;
    });
    this.recent.set(key, { at: now, decision });
    return decision;
  }
}
