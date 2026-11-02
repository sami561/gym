import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { OkResult, RegisterPushRequest } from '@app/common';
import { PushToken } from './push-token.entity';
import { ExpoTicket, PushMessage, chunk, unregisteredTokens } from './push-messages';

const DEFAULT_EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_BATCH_SIZE = 100;
const EXPO_TOKEN_RE = /^Expo(nent)?PushToken\[[^\]]+\]$/;

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(@InjectRepository(PushToken) private readonly tokens: Repository<PushToken>) {}

  /** A device token belongs to the last account that signed in on it. */
  async register({ userId, token }: RegisterPushRequest): Promise<OkResult> {
    const value = token?.trim();
    if (!userId) throw new BadRequestException('Utilisateur manquant.');
    if (!value || !EXPO_TOKEN_RE.test(value)) throw new BadRequestException('Jeton de notification invalide.');
    await this.tokens.delete({ token: value, userId: Not(userId) });
    const existing = await this.tokens.findOne({ where: { userId, token: value } });
    if (existing) {
      await this.tokens.update({ id: existing.id }, { updatedAt: new Date() });
    } else {
      await this.tokens.save(this.tokens.create({ userId, token: value }));
    }
    return { ok: true };
  }

  async removeUser(userId: string): Promise<void> {
    await this.tokens.delete({ userId });
  }

  async sendToUser(userId: string, message: PushMessage): Promise<number> {
    const tokens = await this.tokens.find({ where: { userId } });
    if (!tokens.length) return 0;
    const url = process.env.EXPO_PUSH_URL || DEFAULT_EXPO_PUSH_URL;
    const messages = tokens.map((t) => ({
      to: t.token,
      sound: 'default',
      title: message.title,
      body: message.body,
      data: message.data,
    }));
    let sent = 0;
    for (const batch of chunk(messages, EXPO_BATCH_SIZE)) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
          },
          body: JSON.stringify(batch),
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) {
          this.logger.warn(`Expo push refused (HTTP ${response.status})`);
          continue;
        }
        const json = (await response.json()) as { data?: ExpoTicket[] };
        const tickets = Array.isArray(json.data) ? json.data : [];
        sent += tickets.filter((t) => t.status === 'ok').length;
        const stale = unregisteredTokens(batch, tickets);
        if (stale.length) {
          await this.tokens.delete({ token: In(stale) });
          this.logger.log(`Removed ${stale.length} unregistered device token(s)`);
        }
      } catch (err) {
        this.logger.warn(`Expo push failed: ${(err as Error).message}`);
      }
    }
    return sent;
  }
}
