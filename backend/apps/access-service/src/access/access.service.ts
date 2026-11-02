import { Injectable, Logger } from '@nestjs/common';
import {
  AccessDecision,
  AccessMethod,
  AccessResult,
  Actor,
  DeviceEventsPayload,
  fullName,
  gymInfo,
  lastCoveredDay,
  ManualOpenRequest,
  OpenByAppRequest,
  parseAccessCode,
  ScanRequest,
  toDateOnly,
} from '@app/common';
import { AccessLogsService } from '../logs/access-logs.service';
import { AccessMember } from '../members/access-member.entity';
import { AccessMembersService } from '../members/access-members.service';
import { Door } from '../doors/door.entity';
import { DoorsService } from '../doors/doors.service';
import { Check, checkDoor, checkGeofence, checkMember, checkQr, REASONS } from './access-decision';
import { DoorOpener } from './door-opener.service';

const MAX_DEVICE_EVENTS_PER_BATCH = 500;

interface Attempt {
  member: AccessMember | null;
  door: Door;
  method: AccessMethod;
  actor?: Actor | null;
}

/** Every way into the gym: app button (geofenced), QR code, staff manual opening, terminal punches. */
@Injectable()
export class AccessService {
  private readonly logger = new Logger(AccessService.name);

  constructor(
    private readonly members: AccessMembersService,
    private readonly doors: DoorsService,
    private readonly logs: AccessLogsService,
    private readonly opener: DoorOpener,
  ) {}

  /** "Open the door" button of the mobile app. */
  async openByApp(request: OpenByAppRequest): Promise<AccessDecision> {
    const door = await this.doors.mustFind(request?.doorId);
    const member = await this.members.findById(request.memberId);
    const attempt: Attempt = { member, door, method: AccessMethod.APP };

    const memberCheck = checkMember(member);
    if (!memberCheck.ok) return this.deny(attempt, memberCheck.reason);
    const doorCheck = checkDoor(door);
    if (!doorCheck.ok) return this.deny(attempt, doorCheck.reason);
    const gym = gymInfo();
    const geo = checkGeofence(request, gym.location, gym.geofenceMeters);
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
   * is kept in the reason so staff can spot it.
   */
  async recordDeviceEvents(agentId: string, payload: DeviceEventsPayload): Promise<{ accepted: number }> {
    const door = await this.doors.findById(payload?.doorId);
    if (!door || door.agentId !== agentId || !Array.isArray(payload.events)) return { accepted: 0 };

    let accepted = 0;
    for (const event of payload.events.slice(0, MAX_DEVICE_EVENTS_PER_BATCH)) {
      const deviceUid = Number(event?.deviceUserId);
      const at = new Date(event?.at);
      if (!Number.isInteger(deviceUid) || deviceUid <= 0 || Number.isNaN(at.getTime())) continue;

      const member = await this.members.findByDeviceUid(deviceUid);
      const check: Check = member
        ? checkMember(member, toDateOnly(at))
        : { ok: false, reason: `Utilisateur ${deviceUid} inconnu du système.` };
      const logged = await this.logs.record({
        member,
        door,
        method: event.method === 'FINGERPRINT' ? AccessMethod.FINGERPRINT : AccessMethod.CARD,
        result: AccessResult.GRANTED,
        reason: check.ok ? null : `Ouvert par le terminal : ${check.reason}`,
        createdAt: at,
        deviceEventKey: `${door.id}:${deviceUid}:${at.toISOString()}`,
      });
      if (logged) accepted += 1;
    }
    return { accepted };
  }

  private async evaluateQr(code: unknown, door: Door, actor: Actor | null): Promise<AccessDecision> {
    const parsed = typeof code === 'string' ? parseAccessCode(code) : null;
    const member = parsed ? await this.members.findByCode(parsed.memberCode) : null;
    const attempt: Attempt = { member, door, method: AccessMethod.QR, actor };

    const qr = checkQr(parsed, member);
    if (!qr.ok) return this.deny(attempt, qr.reason);
    // Atomic: two scans of the same code at the same time cannot both pass.
    if (!(await this.members.consumeQrStep(member!.memberId, parsed!.step))) {
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
      this.logger.warn(`Door "${attempt.door.name}" did not open: ${result.error}`);
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

