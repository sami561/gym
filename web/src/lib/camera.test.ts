// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CameraError, cameraProblem, listCameras, nextCamera, startCamera, stopStream } from './camera';

/** jsdom has no camera API: give the page one (or none). */
function setMediaDevices(value: Partial<MediaDevices> | undefined) {
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value });
}

afterEach(() => {
  delete (navigator as { mediaDevices?: unknown }).mediaDevices;
});

describe('cameraProblem', () => {
  it.each([
    ['NotAllowedError', 'denied'],
    ['PermissionDeniedError', 'denied'],
    ['SecurityError', 'denied'],
    ['NotFoundError', 'missing'],
    ['DevicesNotFoundError', 'missing'],
    ['OverconstrainedError', 'missing'],
    ['NotReadableError', 'busy'],
    ['TrackStartError', 'busy'],
    ['AbortError', 'busy'],
    ['UnknownError', 'failed'],
  ])('reads %s as %s', (name, problem) => {
    expect(cameraProblem(new DOMException('camera', name))).toBe(problem);
  });

  it('reads its own errors and anything else that was thrown', () => {
    expect(cameraProblem(new CameraError('insecure'))).toBe('insecure');
    expect(cameraProblem(new Error('boom'))).toBe('failed');
    expect(cameraProblem(null)).toBe('failed');
    expect(cameraProblem('boom')).toBe('failed');
  });
});

describe('startCamera', () => {
  it('asks for video only, from the camera facing the user, in HD', async () => {
    const stream = {} as MediaStream;
    const getUserMedia = vi.fn(async () => stream);
    setMediaDevices({ getUserMedia });

    await expect(startCamera()).resolves.toBe(stream);
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
    });
  });

  it('asks for exactly the camera picked with the switch button', async () => {
    const getUserMedia = vi.fn(async () => ({}) as MediaStream);
    setMediaDevices({ getUserMedia });
    await startCamera('back-camera');
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, deviceId: { exact: 'back-camera' } },
    });
  });

  it('explains that the camera needs https when the page is served over http', async () => {
    setMediaDevices(undefined);
    vi.stubGlobal('isSecureContext', false);
    const error = await startCamera().catch((reason: unknown) => reason);
    expect(cameraProblem(error)).toBe('insecure');
  });

  it('says the browser has no camera access when a secure page has no camera API', async () => {
    setMediaDevices(undefined);
    vi.stubGlobal('isSecureContext', true);
    expect(cameraProblem(await startCamera().catch((reason: unknown) => reason))).toBe('unsupported');
  });

  it('passes on what the browser refused (permission, no device)', async () => {
    setMediaDevices({ getUserMedia: vi.fn(async () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'))) });
    expect(cameraProblem(await startCamera().catch((reason: unknown) => reason))).toBe('denied');
  });
});

describe('stopStream', () => {
  it('stops every track, and accepts no stream', () => {
    const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
    stopStream({ getTracks: () => tracks } as unknown as MediaStream);
    expect(tracks.map((track) => track.stop.mock.calls.length)).toEqual([1, 1]);
    expect(() => stopStream(null)).not.toThrow();
  });
});

describe('listCameras / nextCamera', () => {
  it('lists the video inputs the browser names', async () => {
    setMediaDevices({
      enumerateDevices: vi.fn(async () =>
        [
          { kind: 'audioinput', deviceId: 'mic' },
          { kind: 'videoinput', deviceId: 'front' },
          { kind: 'videoinput', deviceId: '' }, // listed before the permission is granted
          { kind: 'videoinput', deviceId: 'back' },
        ] as MediaDeviceInfo[],
      ),
    });
    expect(await listCameras()).toEqual(['front', 'back']);
  });

  it('lists nothing when the browser cannot tell', async () => {
    setMediaDevices({ enumerateDevices: vi.fn(async () => Promise.reject(new Error('nope'))) });
    expect(await listCameras()).toEqual([]);
  });

  it('goes round the cameras, and offers no switch with a single one', () => {
    expect(nextCamera(['front', 'back'], 'front')).toBe('back');
    expect(nextCamera(['front', 'back'], 'back')).toBe('front');
    expect(nextCamera(['front', 'back'], undefined)).toBe('front');
    expect(nextCamera(['front'], 'front')).toBeUndefined();
    expect(nextCamera([], undefined)).toBeUndefined();
  });
});
