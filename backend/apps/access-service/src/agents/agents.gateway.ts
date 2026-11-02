import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { AccessDecision, DeviceEventsPayload, DeviceUserSync } from '@app/common';
import { AccessService } from '../access/access.service';
import { DoorsService } from '../doors/doors.service';
import { AccessMembersService } from '../members/access-members.service';
import { AgentHeartbeat, AgentRegistry } from './agent-registry.service';
import { AgentsService } from './agents.service';

interface AgentSocketData {
  agentId?: string;
  agentName?: string;
}

/**
 * Socket.IO endpoint of the door agents (protocol in docs/API.md):
 *   io('<gateway>/agents', { path: '/agent-socket', auth: { key } })
 * The API gateway proxies /agent-socket to this server (ACCESS_WS_PORT).
 */
@WebSocketGateway({ namespace: '/agents', path: '/agent-socket', cors: { origin: '*' } })
export class AgentsGateway implements OnGatewayInit<Namespace>, OnGatewayConnection<Socket>, OnGatewayDisconnect<Socket> {
  private readonly logger = new Logger(AgentsGateway.name);

  constructor(
    private readonly agents: AgentsService,
    private readonly doors: DoorsService,
    private readonly members: AccessMembersService,
    private readonly access: AccessService,
    private readonly registry: AgentRegistry,
  ) {}

  afterInit(namespace: Namespace): void {
    // Reject unknown keys during the handshake: the agent receives a connect_error.
    namespace.use((socket, next) => {
      const key = typeof socket.handshake.auth?.key === 'string' ? socket.handshake.auth.key : '';
      if (!key) return next(new Error('Clé agent manquante.'));
      this.agents
        .findByKey(key)
        .then((agent) => {
          if (!agent) return next(new Error('Clé agent invalide.'));
          const data = socket.data as AgentSocketData;
          data.agentId = agent.id;
          data.agentName = agent.name;
          next();
        })
        .catch((err: Error) => {
          this.logger.error(`Agent authentication failed: ${err.message}`);
          next(new Error('Authentification agent impossible.'));
        });
    });
  }

  async handleConnection(socket: Socket): Promise<void> {
    const { agentId, agentName } = socket.data as AgentSocketData;
    if (!agentId) {
      socket.disconnect(true);
      return;
    }
    this.registry.attach(agentId, socket);
    this.logger.log(`Door agent "${agentName}" connected (${socket.handshake.address})`);
    try {
      await this.agents.touch(agentId);
      socket.emit('doors', await this.doors.configsForAgent(agentId));
    } catch (err) {
      this.logger.error(`Could not send doors to agent "${agentName}": ${(err as Error).message}`);
    }
  }

  async handleDisconnect(socket: Socket): Promise<void> {
    const { agentId, agentName } = socket.data as AgentSocketData;
    if (!agentId) return;
    this.registry.detach(agentId, socket);
    this.logger.log(`Door agent "${agentName}" disconnected`);
    await this.agents.touch(agentId).catch(() => undefined);
  }

  @SubscribeMessage('qr.scanned')
  async onQrScanned(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { doorId?: string; code?: string },
  ): Promise<AccessDecision> {
    const { agentId } = socket.data as AgentSocketData;
    try {
      return await this.access.scanFromAgent(agentId as string, body ?? {});
    } catch (err) {
      this.logger.error(`qr.scanned failed: ${(err as Error).message}`);
      return { granted: false, reason: 'Erreur du serveur, réessayez.', at: new Date().toISOString() };
    }
  }

  @SubscribeMessage('device.events')
  async onDeviceEvents(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: DeviceEventsPayload,
  ): Promise<{ accepted: number }> {
    const { agentId } = socket.data as AgentSocketData;
    try {
      return await this.access.recordDeviceEvents(agentId as string, body);
    } catch (err) {
      this.logger.error(`device.events failed: ${(err as Error).message}`);
      return { accepted: 0 };
    }
  }

  @SubscribeMessage('members.sync')
  async onMembersSync(): Promise<DeviceUserSync[]> {
    try {
      return await this.members.deviceUsers();
    } catch (err) {
      this.logger.error(`members.sync failed: ${(err as Error).message}`);
      return [];
    }
  }

  @SubscribeMessage('heartbeat')
  async onHeartbeat(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: Omit<AgentHeartbeat, 'receivedAt'>,
  ): Promise<void> {
    const { agentId, agentName } = socket.data as AgentSocketData;
    if (!agentId) return;
    this.registry.setHeartbeat(agentId, { version: body?.version, doors: body?.doors });
    for (const door of body?.doors ?? []) {
      if (door?.status === 'error') this.logger.warn(`Agent "${agentName}" reports door ${door.id}: ${door.error}`);
    }
    await this.agents.touch(agentId).catch(() => undefined);
  }
}
