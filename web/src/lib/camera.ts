import type { MessageKey } from '../i18n/messages';

/** Why the camera could not start: each case has its own advice for the front desk. */
export type CameraProblem = 'insecure' | 'unsupported' | 'denied' | 'missing' | 'busy' | 'failed';

export const CAMERA_PROBLEM_MESSAGES: Record<CameraProblem, MessageKey> = {
  insecure: 'La caméra ne fonctionne que sur une adresse sécurisée (https://). Importez une photo à la place.',
  unsupported: 'Ce navigateur ne donne pas accès à la caméra. Importez une photo à la place.',
  denied: 'L’accès à la caméra est refusé. Autorisez la caméra pour ce site dans les réglages du navigateur, puis réessayez.',
  missing: 'Aucune caméra détectée. Branchez une webcam ou importez une photo.',
  busy: 'La caméra est déjà utilisée (scanner QR, autre onglet ou application). Fermez-la, puis réessayez.',
  failed: 'Impossible de démarrer la caméra. Réessayez ou importez une photo.',
};

/** Retrying cannot help these: the page or the browser itself has no camera access. */
export const CAMERA_FINAL_PROBLEMS: readonly CameraProblem[] = ['insecure', 'unsupported'];

export class CameraError extends Error {
  readonly problem: CameraProblem;

  constructor(problem: CameraProblem) {
    super(CAMERA_PROBLEM_MESSAGES[problem]);
    this.name = 'CameraError';
    this.problem = problem;
  }
}

/** Reads what startCamera() or getUserMedia() threw. */
export function cameraProblem(error: unknown): CameraProblem {
  if (error instanceof CameraError) return error.problem;
  switch ((error as { name?: unknown } | null)?.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'denied';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'missing';
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'busy';
    default:
      return 'failed';
  }
}

/** Opens the camera `deviceId`, else the one facing the user (the front-desk webcam). Video only. */
export async function startCamera(deviceId?: string): Promise<MediaStream> {
  // Browsers only expose the camera on https:// pages (and localhost).
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraError(globalThis.isSecureContext === false ? 'insecure' : 'unsupported');
  }
  const size = { width: { ideal: 1280 }, height: { ideal: 720 } };
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: deviceId ? { ...size, deviceId: { exact: deviceId } } : { ...size, facingMode: 'user' },
  });
}

/** Turns the camera off: stops every track, and the camera light goes out. */
export function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((track) => track.stop());
}

/** Ids of the cameras of this device; the browser lists them once the permission is granted. */
export async function listCameras(): Promise<string[]> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === 'videoinput' && device.deviceId).map((device) => device.deviceId);
  } catch {
    return [];
  }
}

/** The camera after `current`, for the switch button (front / back of a tablet, second webcam). */
export function nextCamera(cameras: string[], current: string | undefined): string | undefined {
  if (cameras.length < 2) return undefined;
  const index = current ? cameras.indexOf(current) : -1;
  return cameras[(index + 1) % cameras.length];
}
