import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DeliveryStatus, WebhookDelivery } from './webhook-delivery.entity';
import { MAX_ATTEMPTS, WEBHOOK_TIMEOUT_MS, backoffMs, buildWebhookRequest, describeError } from './webhook-request';

/** A claimed row is not picked up by another worker for this long. */
const LEASE_SECONDS = 120;
const RETRY_BATCH = 50;
const NO_URL = 'N8N_WEBHOOK_URL non configurée';

/**
 * Forwards customer-facing events to n8n through an outbox table: the event is stored first,
 * sent right away, and retried every minute with exponential backoff until MAX_ATTEMPTS.
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private warnedNoSecret = false;

  constructor(@InjectRepository(WebhookDelivery) private readonly deliveries: Repository<WebhookDelivery>) {}

  async enqueue(event: string, data: object): Promise<WebhookDelivery> {
    const url = webhookUrl();
    const delivery = await this.deliveries.save(
      this.deliveries.create({
        event,
        payload: data as Record<string, unknown>,
        status: url ? DeliveryStatus.PENDING : DeliveryStatus.SKIPPED,
        attempts: 0,
        // Claimed by this process for the immediate attempt below.
        nextAttemptAt: url ? new Date(Date.now() + LEASE_SECONDS * 1000) : null,
        lastError: url ? null : NO_URL,
      }),
    );
    if (url) await this.attempt(delivery, url);
    return delivery;
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async retryDue(): Promise<void> {
    const ids = await this.claimDue();
    if (!ids.length) return;
    const url = webhookUrl();
    const rows = await this.deliveries.findBy({ id: In(ids) });
    for (const row of rows) {
      if (url) {
        await this.attempt(row, url);
      } else {
        row.status = DeliveryStatus.SKIPPED;
        row.nextAttemptAt = null;
        row.lastError = NO_URL;
        await this.deliveries.save(row);
      }
    }
  }

  /** Atomically leases due rows (SKIP LOCKED lets several replicas share the work). */
  private async claimDue(): Promise<string[]> {
    const result: unknown = await this.deliveries.query(
      `UPDATE "webhook_deliveries"
          SET "nextAttemptAt" = now() + make_interval(secs => $1::double precision)
        WHERE "id" IN (
          SELECT "id" FROM "webhook_deliveries"
           WHERE "status" = 'PENDING' AND "nextAttemptAt" <= now()
           ORDER BY "nextAttemptAt"
           LIMIT $2
           FOR UPDATE SKIP LOCKED)
      RETURNING "id"`,
      [LEASE_SECONDS, RETRY_BATCH],
    );
    // TypeORM returns [rows, affectedCount] for UPDATE ... RETURNING on Postgres.
    const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
    return Array.isArray(rows) ? (rows as { id: string }[]).map((row) => row.id) : [];
  }

  private async attempt(delivery: WebhookDelivery, url: string): Promise<void> {
    const secret = process.env.WEBHOOK_SECRET ?? '';
    if (!secret && !this.warnedNoSecret) {
      this.warnedNoSecret = true;
      this.logger.warn('WEBHOOK_SECRET is empty: webhooks are sent unsigned');
    }
    const { body, headers } = buildWebhookRequest(
      {
        id: delivery.id,
        event: delivery.event,
        occurredAt: (delivery.createdAt ?? new Date()).toISOString(),
        data: delivery.payload,
      },
      secret,
    );
    delivery.attempts += 1;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      });
      await response.text().catch(() => '');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      delivery.status = DeliveryStatus.DELIVERED;
      delivery.deliveredAt = new Date();
      delivery.nextAttemptAt = null;
      delivery.lastError = null;
    } catch (err) {
      delivery.lastError = describeError(err).slice(0, 1000);
      if (delivery.attempts >= MAX_ATTEMPTS) {
        delivery.status = DeliveryStatus.FAILED;
        delivery.nextAttemptAt = null;
        this.logger.error(`${delivery.event} ${delivery.id} failed for good: ${delivery.lastError}`);
      } else {
        delivery.status = DeliveryStatus.PENDING;
        delivery.nextAttemptAt = new Date(Date.now() + backoffMs(delivery.attempts));
        this.logger.warn(
          `${delivery.event} ${delivery.id} attempt ${delivery.attempts}/${MAX_ATTEMPTS} failed: ${delivery.lastError}`,
        );
      }
    }
    await this.deliveries.save(delivery);
  }
}

function webhookUrl(): string {
  return (process.env.N8N_WEBHOOK_URL ?? '').trim();
}
