import {
  AppOpenContext,
  DateWindow,
  distanceMeters,
  ipInCidrs,
  isWithinWindows,
  LatLng,
  MemberStatus,
  ParsedAccessCode,
  toDateOnly,
  verifyAccessCode,
} from '@app/common';

/** Denial messages shown to members (app), staff (dashboard) and logged. */
export const REASONS = {
  unknownMember: 'Membre inconnu.',
  suspended: 'Compte suspendu. Merci de passer à l’accueil.',
  noSubscription: 'Aucun abonnement actif. Merci de passer à l’accueil.',
  notStarted: (from: string) => `Abonnement valable à partir du ${formatDay(from)}.`,
  expired: (until: string) => `Abonnement expiré le ${formatDay(until)}. Merci de le renouveler.`,
  doorInactive: 'Porte désactivée.',
  appOpenDisabled: 'Cette porte ne peut pas être ouverte depuis l’application.',
  network: 'Connectez-vous au Wi-Fi de la salle pour ouvrir la porte.',
  invalidQr: 'QR code invalide.',
  expiredQr: 'QR code expiré. Actualisez le code dans l’application.',
  replayedQr: 'QR code déjà utilisé. Attendez le prochain code.',
  invalidPosition: 'Position GPS invalide. Activez la localisation.',
  tooFar: (meters: number) => `Vous êtes trop loin de la salle (${meters} m). Approchez-vous de l’entrée.`,
  agentOffline: 'Contrôleur de porte hors ligne.',
  agentTimeout: 'Le contrôleur de porte ne répond pas.',
  agentFailed: 'Le contrôleur n’a pas pu ouvrir la porte.',
  foreignDoor: 'Porte non gérée par cet agent.',
} as const;

export type Check = { ok: true } | { ok: false; reason: string };

const OK: Check = { ok: true };

/** Max GPS inaccuracy (meters) we give the member the benefit of. */
export const MAX_ACCURACY_ALLOWANCE = 50;

export function formatDay(day: string): string {
  const [y, m, d] = day.split('-');
  return `${d}/${m}/${y}`;
}

/** Member may enter on `day`: account active and a paid window covers the day. */
export function checkMember(
  member: { status: MemberStatus; windows: DateWindow[] } | null,
  day: string = toDateOnly(),
): Check {
  if (!member) return { ok: false, reason: REASONS.unknownMember };
  if (member.status !== MemberStatus.ACTIVE) return { ok: false, reason: REASONS.suspended };
  const windows = Array.isArray(member.windows) ? member.windows : [];
  if (isWithinWindows(windows, day)) return OK;
  const future = windows.filter((w) => w.from > day).sort((a, b) => a.from.localeCompare(b.from))[0];
  if (future) return { ok: false, reason: REASONS.notStarted(future.from) };
  const past = windows.filter((w) => w.until < day).sort((a, b) => b.until.localeCompare(a.until))[0];
  if (past) return { ok: false, reason: REASONS.expired(past.until) };
  return { ok: false, reason: REASONS.noSubscription };
}

export function checkDoor(door: { isActive: boolean }): Check {
  return door.isActive ? OK : { ok: false, reason: REASONS.doorInactive };
}

/** The door must be open to the app (Door.allowAppOpen); GET /me/doors lists only those. */
export function checkAppOpen(door: { allowAppOpen: boolean }): Check {
  return door.allowAppOpen ? OK : { ok: false, reason: REASONS.appOpenDisabled };
}

/**
 * With APP_OPEN_ALLOWED_NETWORKS set, the phone must reach the gateway from one of those networks
 * (the gym Wi-Fi). An empty list turns the check off; a malformed one refuses everyone (logged at boot).
 */
export function checkNetwork(clientIp: string | null | undefined, networks: string[]): Check {
  if (networks.length === 0) return OK;
  const ip = typeof clientIp === 'string' ? clientIp.trim() : '';
  if (!ip) return { ok: false, reason: REASONS.network };
  try {
    return ipInCidrs(ip, networks) ? OK : { ok: false, reason: REASONS.network };
  } catch {
    return { ok: false, reason: REASONS.network };
  }
}

export interface Position {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

/** The phone must be within `radiusMeters` of the gym, allowing up to 50 m of GPS inaccuracy. */
export function checkGeofence(position: Position, gym: LatLng, radiusMeters: number): Check & { distance?: number } {
  const { latitude, longitude } = position ?? ({} as Position);
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return { ok: false, reason: REASONS.invalidPosition };
  }
  const distance = distanceMeters({ lat: latitude, lng: longitude }, gym);
  const accuracy = Number.isFinite(position.accuracy) ? Math.max(0, Number(position.accuracy)) : 0;
  const allowance = Math.min(accuracy, MAX_ACCURACY_ALLOWANCE);
  if (distance - allowance <= radiusMeters) return { ok: true, distance };
  return { ok: false, reason: REASONS.tooFar(Math.round(distance)), distance };
}

const finiteOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/** What an app opening is logged with, whatever the decision, so abuse can be investigated. */
export function appOpenContext(
  request: Partial<Position> & { clientIp?: unknown },
  distance: number | undefined,
): AppOpenContext {
  const accuracy = finiteOrNull(request.accuracy);
  return {
    latitude: finiteOrNull(request.latitude),
    longitude: finiteOrNull(request.longitude),
    accuracy: accuracy === null ? null : Math.max(0, accuracy),
    distanceMeters: distance === undefined || !Number.isFinite(distance) ? null : Math.round(distance),
    clientIp: typeof request.clientIp === 'string' && request.clientIp.trim() ? request.clientIp.trim().slice(0, 64) : null,
  };
}

/**
 * Signature + freshness (±1 period) + anti-replay: the step must be newer than the last
 * accepted one. The caller then stores the step atomically (AccessMembersService.consumeQrStep).
 */
export function checkQr(
  parsed: ParsedAccessCode | null,
  member: { accessSecret: string; lastQrStep: number | null } | null,
  nowMs: number = Date.now(),
): Check {
  if (!parsed) return { ok: false, reason: REASONS.invalidQr };
  if (!member) return { ok: false, reason: REASONS.unknownMember };
  if (!verifyAccessCode(parsed, member.accessSecret, nowMs)) return { ok: false, reason: REASONS.expiredQr };
  if (member.lastQrStep !== null && parsed.step <= member.lastQrStep) {
    return { ok: false, reason: REASONS.replayedQr };
  }
  return OK;
}
