import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { assertOutboundAllowed, DoorDriver, OutboundPolicy, parseOutboundUrl } from '@app/common';
import { AgentRegistry } from '../agents/agent-registry.service';
import { Door } from '../doors/door.entity';
import { buildRelayRequest, RelayRequest } from '../doors/relay-config';
import { DEFAULT_RELAY_NETWORKS, readNetworkList } from '../shared/networks';
import { REASONS } from './access-decision';
import { agentFailure, RELAY_ERRORS } from './open-failures';

export interface OpenResult {
  ok: boolean;
  /** French message for the caller and the access log. */
  error?: string;
  /** Technical cause, for the service log only (may quote a controller or a relay). */
  detail?: string;
}

export const AGENT_ACK_TIMEOUT_MS = 8_000;
/** Upper bound of a relay call made by this service (the gateway gives up on the RPC after 10 s). */
export const HTTP_RELAY_TIMEOUT_MS = 5_000;

/**
 * Physically opens a door. Doors attached to an agent are driven by that agent
 * (ZKTeco terminals and relays on the gym LAN); without an agent the service can only
 * drive a simulator or an HTTP relay it can reach itself.
 */
@Injectable()
export class DoorOpener {
  private readonly logger = new Logger(DoorOpener.name);
  /** Relays called from the server: public addresses, or private ones in RELAY_ALLOWED_NETWORKS. */
  private readonly relayPolicy: OutboundPolicy;

  constructor(private readonly registry: AgentRegistry) {
    const networks = readNetworkList('RELAY_ALLOWED_NETWORKS', DEFAULT_RELAY_NETWORKS);
    if (networks.error) {
      this.logger.error(`RELAY_ALLOWED_NETWORKS: ${networks.error} Relay doors without an agent will not open.`);
    }
    this.relayPolicy = { allowPrivateCidrs: networks.networks };
  }

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
      return agentFailure(ack?.error);
    } catch {
      return { ok: false, error: REASONS.agentTimeout };
    }
  }

  /**
   * SSRF guard (security review, finding 7): the URL is checked right before each call (public
   * address, or a private one in RELAY_ALLOWED_NETWORKS; loopback, link-local and cloud metadata
   * never), redirects are not followed, and the response body is never read.
   */
  private async openHttpRelay(door: Door): Promise<OpenResult> {
    let request: RelayRequest;
    let url: URL;
    try {
      request = buildRelayRequest(door.config ?? {}, { seconds: door.unlockSeconds, doorId: door.id });
      url = parseOutboundUrl(request.url);
    } catch (err) {
      return { ok: false, error: RELAY_ERRORS.invalidConfig, detail: (err as Error).message };
    }
    try {
      await assertOutboundAllowed(url, this.relayPolicy);
    } catch (err) {
      return { ok: false, error: RELAY_ERRORS.forbidden, detail: (err as Error).message };
    }
    try {
      const response = await fetch(url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        redirect: 'manual',
        signal: AbortSignal.timeout(Math.min(request.timeoutMs, HTTP_RELAY_TIMEOUT_MS)),
      });
      // Only the status matters: release the connection without reading the body.
      await response.body?.cancel().catch(() => undefined);
      if (response.status >= 300 && response.status < 400) {
        return {
          ok: false,
          error: RELAY_ERRORS.status(response.status),
          detail: `Redirection refusée (HTTP ${response.status})`,
        };
      }
      return response.ok ? { ok: true } : { ok: false, error: RELAY_ERRORS.status(response.status) };
    } catch (err) {
      return { ok: false, error: RELAY_ERRORS.unreachable, detail: (err as Error).message };
    }
  }
}
