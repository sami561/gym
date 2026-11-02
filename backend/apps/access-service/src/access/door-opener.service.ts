import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DoorDriver } from '@app/common';
import { AgentRegistry } from '../agents/agent-registry.service';
import { Door } from '../doors/door.entity';
import { REASONS } from './access-decision';

export interface OpenResult {
  ok: boolean;
  error?: string;
}

export const AGENT_ACK_TIMEOUT_MS = 8_000;
export const HTTP_RELAY_TIMEOUT_MS = 5_000;

/**
 * Physically opens a door. Doors attached to an agent are driven by that agent
 * (ZKTeco terminals and relays on the gym LAN); without an agent the service can only
 * drive a simulator or an HTTP relay it can reach itself.
 */
@Injectable()
export class DoorOpener {
  private readonly logger = new Logger(DoorOpener.name);

  constructor(private readonly registry: AgentRegistry) {}

  async open(door: Door): Promise<OpenResult> {
    if (door.agentId) return this.openThroughAgent(door);
    switch (door.driver) {
      case DoorDriver.SIMULATOR:
        this.logger.log(`[simulator] door "${door.name}" opened for ${door.unlockSeconds}s`);
        return { ok: true };
      case DoorDriver.HTTP_RELAY:
        return this.openHttpRelay(door);
      default:
        return { ok: false, error: 'Porte ZKTeco : un agent de porte sur le réseau de la salle est requis.' };
    }
  }

  private async openThroughAgent(door: Door): Promise<OpenResult> {
    const socket = this.registry.get(door.agentId as string);
    if (!socket) return { ok: false, error: REASONS.agentOffline };
    try {
      const ack = (await socket
        .timeout(AGENT_ACK_TIMEOUT_MS)
        .emitWithAck('door.open', { requestId: randomUUID(), doorId: door.id, seconds: door.unlockSeconds })) as
        | OpenResult
        | undefined;
      if (ack?.ok) return { ok: true };
      return { ok: false, error: ack?.error || "Le contrôleur n'a pas pu ouvrir la porte." };
    } catch {
      return { ok: false, error: REASONS.agentTimeout };
    }
  }

  private async openHttpRelay(door: Door): Promise<OpenResult> {
    const config = door.config as { url?: unknown; method?: unknown; headers?: unknown; body?: unknown };
    if (typeof config.url !== 'string' || !config.url) return { ok: false, error: 'URL du relais non configurée.' };
    const body =
      config.body === undefined || config.body === null
        ? undefined
        : typeof config.body === 'string'
          ? config.body
          : JSON.stringify(config.body);
    try {
      const response = await fetch(config.url, {
        method: typeof config.method === 'string' ? config.method : 'GET',
        headers: (config.headers as Record<string, string>) ?? undefined,
        body,
        signal: AbortSignal.timeout(HTTP_RELAY_TIMEOUT_MS),
      });
      return response.ok ? { ok: true } : { ok: false, error: `Le relais a répondu ${response.status}.` };
    } catch (err) {
      this.logger.warn(`HTTP relay of door "${door.name}" failed: ${(err as Error).message}`);
      return { ok: false, error: 'Relais de porte injoignable.' };
    }
  }
}
