import { Injectable, Logger } from '@nestjs/common';
import {
  AccessDecision,
  AccessMethod,
  AccessResult,
  Actor,
  AppOpenContext,
  DeviceEventsPayload,
  DeviceEventsResult,
  fullName,
  gymInfo,
  lastCoveredDay,
  ManualOpenRequest,
  OpenByAppRequest,
  parseAccessCode,
  ScanRequest,
  toDateOnly,
} from '@app/common';
import {
  describeRejections,
  DeviceEventRejection,
  deviceEventKey,
  MAX_DEVICE_EVENTS_PER_BATCH,
  parseDeviceEvent,
} from '../agents/device-sync';
import { AccessLogsService } from '../logs/access-logs.service';
import { AccessMember } from '../members/access-member.entity';
import { AccessMembersService } from '../members/access-members.service';
import { Door } from '../doors/door.entity';
import { DoorsService } from '../doors/doors.service';
import { readNetworkList } from '../shared/networks';
import {
  appOpenContext,
  Check,
  checkAppOpen,
  checkDoor,
  checkGeofence,
  checkMember,
  checkNetwork,
  checkQr,
  REASONS,
} from './access-decision';
import { DoorOpener } from './door-opener.service';

interface Attempt {
  member: AccessMember | null;
  door: Door;
  method: AccessMethod;
  actor?: Actor | null;
  /** App openings: position and address, logged whatever the decision. */
  context?: AppOpenContext;
}

/** Every way into the gym: app button (Wi-Fi + geofence), QR code, staff manual opening, terminal punches. */
@Injectable()
export class AccessService {
  private readonly logger = new Logger(AccessService.name);
  /** APP_OPEN_ALLOWED_NETWORKS: networks (gym Wi-Fi) app openings must come from; [] = no check. */
  private readonly appNetworks: string[];

  constructor(
    private readonly members: AccessMembersService,
    private readonly doors: DoorsService,
    private readonly logs: AccessLogsService,
    private readonly opener: DoorOpener,
  ) {
    const networks = readNetworkList('APP_OPEN_ALLOWED_NETWORKS');
    if (networks.error) {
      this.logger.error(`APP_OPEN_ALLOWED_NETWORKS: ${networks.error} Every opening from the app is refused.`);
    }
    this.appNetworks = networks.networks;
  }

  /**
   * "Open the door" button of the mobile app. The phone's position and address are only claims
   * (security review, finding 5): the door must accept app openings, the request must come from
   * the gym network when APP_OPEN_ALLOWED_NETWORKS is set, and every attempt is logged with both.
   */
  async openByApp(request: OpenByAppRequest): Promise<AccessDecision> {
    const door = await this.doors.mustFind(request?.doorId);
    const member = await this.members.findById(request.memberId);
    const gym = gymInfo();
    const geo = checkGeofence(request, gym.location, gym.geofenceMeters);
    const attempt: Attempt = {
      member,
      door,
      method: AccessMethod.APP,
      context: appOpenContext(request, geo.distance),
    };

    const memberCheck = checkMember(member);
    if (!memberCheck.ok) return this.deny(attempt, memberCheck.reason);
    const doorCheck = checkDoor(door);
    if (!doorCheck.ok) return this.deny(attempt, doorCheck.reason);
    const appCheck = checkAppOpen(door);
    if (!appCheck.ok) return this.deny(attempt, appCheck.reason);
    const networkCheck = checkNetwork(request.clientIp, this.appNetworks);
    if (!networkCheck.ok) return this.deny(attempt, networkCheck.reason);
    if (!geo.ok) return this.deny(attempt, geo.reason);
    return this.openAndLog(attempt);
  }

  /** QR code scanned at reception / on a kiosk (staff session). */
  async scan(request: ScanRequest): Promise<AccessDecision> {
    const door = await this.doors.mustFind(request?.doorId);
    return this.evaluateQr(request.code, door, request.actor ?? null);
  }

  /** QR code read by a scanner wired to a door agent; the door must belong to that agent. */
  async scanFromAgent(agentId: string, body: { doorId?: string; code?: string }): Promise<AccessDecision> {
    const door = await this.doors.findById(body?.doorId);
    if (!door || door.agentId !== agentId) {
      return { granted: false, reason: REASONS.foreignDoor, at: new Date().toISOString() };
    }
    return this.evaluateQr(body.code, door, null);
  }

  /** Staff opens the door from the dashboard (delivery, guest, member without phone...). */
  async manualOpen(request: ManualOpenRequest): Promise<AccessDecision> {
    const door = await this.doors.mustFind(request?.doorId);
    const attempt: Attempt = { member: null, door, method: AccessMethod.MANUAL, actor: request.actor };
    const doorCheck = checkDoor(door);
    if (!doorCheck.ok) return this.deny(attempt, doorCheck.reason);
    const note = typeof request.reason === 'string' ? request.reason.trim() || null : null;
    return this.openAndLog(attempt, note);
  }

  /**
   * Punches recorded by a ZKTeco terminal (badge / fingerprint). The terminal already opened
   * the door, so they are logged as GRANTED; an entitlement problem (terminal not yet synced)
   * is kept in the reason so staff can spot it, like a terminal user unknown here. Only punches of
   * the last 7 days are logged, never in the future (security review, finding 11); the others are
   * counted and reported, never failing the batch.
   */
  async recordDeviceEvents(agentId: string, payload: DeviceEventsPayload): Promise<DeviceEventsResult> {
    const events: unknown[] = Array.isArray(payload?.events) ? payload.events : [];
    const result: DeviceEventsResult = { accepted: 0, duplicates: 0, rejected: 0 };
    let clockAhead = 0;
    const rejections: Partial<Record<DeviceEventRejection, number>> = {};
    const reject = (rejection: DeviceEventRejection, count = 1) => {
      result.rejected += count;
      rejections[rejection] = (rejections[rejection] ?? 0) + count;
    };

    const door = await this.doors.findById(payload?.doorId);
    if (!door || door.agentId !== agentId) {
      reject('foreign-door', events.length);
    } else {
      const nowMs = Date.now();
      if (events.length > MAX_DEVICE_EVENTS_PER_BATCH) reject('over-limit', events.length - MAX_DEVICE_EVENTS_PER_BATCH);
      for (const event of events.slice(0, MAX_DEVICE_EVENTS_PER_BATCH)) {
        const parsed = parseDeviceEvent(event, nowMs);
        if (!parsed.ok) {
          reject(parsed.rejection);
          continue;
        }
        if (parsed.loggedAt !== parsed.at) clockAhead += 1;
        // A user unknown here (enrolled on the terminal by hand, deleted member not yet disabled
        // there) did open the door: the punch stays in the log, without a member.
        const member = await this.members.findByDeviceUid(parsed.deviceUid);
        const check: Check = member
          ? checkMember(member, toDateOnly(parsed.loggedAt))
          : { ok: false, reason: `Utilisateur ${parsed.deviceUid} inconnu du système.` };
        const logged = await this.logs.record({
          member,
          door,
          method: parsed.method,
          result: AccessResult.GRANTED,
          reason: check.ok ? null : `Ouvert par le terminal : ${check.reason}`,
          createdAt: parsed.loggedAt,
          deviceEventKey: deviceEventKey(door.id, parsed.deviceUid, parsed.at),
        });
        if (logged) result.accepted += 1;
        else result.duplicates += 1;
      }
    }

    if (clockAhead > 0) {
      this.logger.warn(
        `Door agent ${agentId}: ${clockAhead} punch(es) on door "${door?.name}" dated more than 5 min ahead of the server, logged at reception: check the terminal clock`,
      );
    }
    if (result.rejected > 0) {
      const target = door ? `door "${door.name}"` : `door ${JSON.stringify(String(payload?.doorId ?? '').slice(0, 64))}`;
      this.logger.warn(
        `Door agent ${agentId}: ${result.rejected} punch(es) rejected on ${target} (${describeRejections(rejections)})`,
      );
    }
    return result;
  }

  private async evaluateQr(code: unknown, door: Door, actor: Actor | null): Promise<AccessDecision> {
    const parsed = typeof code === 'string' ? parseAccessCode(code) : null;
    const member = parsed ? await this.members.findByCode(parsed.memberCode) : null;
    const attempt: Attempt = { member, door, method: AccessMethod.QR, actor };

    const qr = checkQr(parsed, member);
    if (!qr.ok) return this.deny(attempt, qr.reason);
    // Atomic: two scans of the same code at the same time cannot both pass, nor a code whose
    // secret was rotated while it was being checked.
    if (!(await this.members.consumeQrStep(member!.memberId, parsed!.step, member!.accessSecret))) {
      return this.deny(attempt, REASONS.replayedQr);
    }
    const memberCheck = checkMember(member);
    if (!memberCheck.ok) return this.deny(attempt, memberCheck.reason);
    const doorCheck = checkDoor(door);
    if (!doorCheck.ok) return this.deny(attempt, doorCheck.reason);
    return this.openAndLog(attempt);
  }

  private async openAndLog(attempt: Attempt, note: string | null = null): Promise<AccessDecision> {
    const result = await this.opener.open(attempt.door);
    if (!result.ok) {
      this.logger.warn(`Door "${attempt.door.name}" did not open: ${result.detail ?? result.error}`);
      return this.deny(attempt, result.error ?? REASONS.agentOffline);
    }
    return this.decide(attempt, AccessResult.GRANTED, note);
  }

  private deny(attempt: Attempt, reason: string): Promise<AccessDecision> {
    return this.decide(attempt, AccessResult.DENIED, reason);
  }

  private async decide(attempt: Attempt, result: AccessResult, reason: string | null): Promise<AccessDecision> {
    const log = await this.logs.record({
      member: attempt.member,
      door: attempt.door,
      method: attempt.method,
      result,
      reason,
      actor: attempt.actor ?? null,
      context: attempt.context ?? null,
    });
    const { member, door } = attempt;
    return {
      granted: result === AccessResult.GRANTED,
      ...(result === AccessResult.DENIED && reason ? { reason } : {}),
      door: { id: door.id, name: door.name },
      ...(member
        ? {
            member: {
              id: member.memberId,
              fullName: fullName(member),
              memberCode: member.memberCode,
              validUntil: lastCoveredDay(member.windows ?? []),
            },
          }
        : {}),
      at: log?.createdAt ?? new Date().toISOString(),
      ...(log ? { logId: log.id } : {}),
    };
  }
}

