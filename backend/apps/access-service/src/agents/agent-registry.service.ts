import { Injectable } from '@nestjs/common';
import type { Socket } from 'socket.io';

export interface AgentHeartbeat {
  version?: string;
  doors?: { id: string; status: 'ok' | 'error'; error?: string }[];
  receivedAt: string;
}

/** In-memory map of connected door agents (one socket per agent, newest wins). */
@Injectable()
export class AgentRegistry {
  private readonly sockets = new Map<string, Socket>();
  private readonly heartbeats = new Map<string, AgentHeartbeat>();

  attach(agentId: string, socket: Socket): void {
    const previous = this.sockets.get(agentId);
    this.sockets.set(agentId, socket);
    if (previous && previous.id !== socket.id) previous.disconnect(true);
  }

  /** Removes the socket only if it is still the current one for this agent. */
  detach(agentId: string, socket: Socket): void {
    if (this.sockets.get(agentId)?.id === socket.id) {
      this.sockets.delete(agentId);
      this.heartbeats.delete(agentId);
    }
  }

  get(agentId: string): Socket | undefined {
    const socket = this.sockets.get(agentId);
    return socket?.connected ? socket : undefined;
  }

  isOnline(agentId: string): boolean {
    return this.get(agentId) !== undefined;
  }

  emit(agentId: string, event: string, payload: unknown): void {
    this.get(agentId)?.emit(event, payload);
  }

  disconnect(agentId: string): void {
    this.sockets.get(agentId)?.disconnect(true);
    this.sockets.delete(agentId);
    this.heartbeats.delete(agentId);
  }

  setHeartbeat(agentId: string, heartbeat: Omit<AgentHeartbeat, 'receivedAt'>): void {
    this.heartbeats.set(agentId, { ...heartbeat, receivedAt: new Date().toISOString() });
  }

  heartbeat(agentId: string): AgentHeartbeat | undefined {
    return this.heartbeats.get(agentId);
  }
}
