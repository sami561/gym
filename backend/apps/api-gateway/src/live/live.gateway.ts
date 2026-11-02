import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import { AccessLogDto, JwtPayload, env } from '@app/common';
import { corsOrigins } from '../common/cors';
import { liveSessionTtl } from './live-session';

/**
 * Back-office live feed: io('<gateway>/live', { auth: { token } }) — ADMIN / STAFF access tokens only.
 * The server disconnects the socket when the token expires ('io server disconnect'): refresh, reconnect.
 */
@WebSocketGateway({ namespace: '/live', cors: { origin: corsOrigins(), credentials: true } })
export class LiveGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(LiveGateway.name);
  /** Socket id → timer that closes the socket when its token expires. */
  private readonly expiryTimers = new Map<string, NodeJS.Timeout>();

  @WebSocketServer()
  private readonly server: Namespace;

  constructor(private readonly jwt: JwtService) {}

  handleConnection(client: Socket): void {
    let payload: JwtPayload & { exp?: number };
    try {
      const token = String(client.handshake.auth?.token ?? '');
      payload = this.jwt.verify<JwtPayload & { exp?: number }>(token, { secret: env('JWT_ACCESS_SECRET') });
    } catch {
      return this.reject(client);
    }
    const ttl = liveSessionTtl(payload, Date.now());
    if (ttl === null) return this.reject(client);
    client.data.userId = payload.sub;
    // Stateless token: the socket must not outlive it (expired session, deactivated account).
    this.expiryTimers.set(client.id, setTimeout(() => client.disconnect(true), ttl));
  }

  handleDisconnect(client: Socket): void {
    clearTimeout(this.expiryTimers.get(client.id));
    this.expiryTimers.delete(client.id);
  }

  broadcastAccess(log: AccessLogDto): void {
    this.server?.emit('access', log);
  }

  private reject(client: Socket): void {
    client.emit('error', { message: 'Authentification requise.' });
    client.disconnect(true);
  }
}
