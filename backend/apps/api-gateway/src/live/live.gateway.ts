import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import { AccessLogDto, JwtPayload, STAFF_ROLES, env } from '@app/common';
import { corsOrigins } from '../common/cors';

/** Back-office live feed: io('<gateway>/live', { auth: { token } }) — ADMIN / STAFF only. */
@WebSocketGateway({ namespace: '/live', cors: { origin: corsOrigins(), credentials: true } })
export class LiveGateway implements OnGatewayConnection {
  private readonly logger = new Logger(LiveGateway.name);

  @WebSocketServer()
  private readonly server: Namespace;

  constructor(private readonly jwt: JwtService) {}

  handleConnection(client: Socket): void {
    try {
      const token = String(client.handshake.auth?.token ?? '');
      const payload = this.jwt.verify<JwtPayload>(token, { secret: env('JWT_ACCESS_SECRET') });
      if (payload.type !== 'access' || !STAFF_ROLES.includes(payload.role)) throw new Error('forbidden');
      client.data.userId = payload.sub;
    } catch {
      client.emit('error', { message: 'Authentification requise.' });
      client.disconnect(true);
    }
  }

  broadcastAccess(log: AccessLogDto): void {
    this.server?.emit('access', log);
  }
}
