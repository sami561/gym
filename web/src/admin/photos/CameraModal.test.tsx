// @vitest-environment jsdom
import { useState } from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ApiError } from '../../api/client';
import { captureFrame } from '../../lib/photo';
import { renderInLang } from '../../test/render';
import { CameraModal } from './CameraModal';

// jsdom cannot draw a video frame: the capture itself is tested in lib/photo.test.ts.
vi.mock('../../lib/photo', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../lib/photo')>()), captureFrame: vi.fn() }));

/** A camera stream whose single track records stop(). */
function fakeStream(deviceId = 'front') {
  const track = { stop: vi.fn(), getSettings: () => ({ deviceId }) };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
  return { stream, track };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

let getUserMedia: Mock<(constraints: MediaStreamConstraints) => Promise<MediaStream>>;
let cameras: string[];
const photo = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' });

function setMediaDevices(value: Partial<MediaDevices> | undefined) {
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value });
}

beforeEach(() => {
  cameras = ['front'];
  getUserMedia = vi.fn(async () => fakeStream().stream);
  setMediaDevices({
    getUserMedia,
    enumerateDevices: async () => cameras.map((deviceId) => ({ kind: 'videoinput', deviceId }) as MediaDeviceInfo),
  });
  class TestURL extends URL {
    static createObjectURL = () => 'blob:shot';
    static revokeObjectURL = () => undefined;
  }
  vi.stubGlobal('URL', TestURL);
  vi.mocked(captureFrame).mockResolvedValue(photo);
});

afterEach(() => {
  delete (navigator as { mediaDevices?: unknown }).mediaDevices;
});

/** The member file around the dialog: it opens with the camera, and closes like the page does. */
function Harness({ onUse = async () => undefined, onImport }: { onUse?: (photo: Blob) => Promise<unknown>; onImport?: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <output aria-label="dialog">{open ? 'open' : 'closed'}</output>
      <CameraModal
        open={open}
        onClose={() => setOpen(false)}
        onUse={async (shot) => {
          await onUse(shot);
          setOpen(false);
        }}
        onImport={onImport}
      />
    </>
  );
}

const video = () => screen.getByLabelText('Aperçu de la caméra') as HTMLVideoElement;
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;
/** The camera answered and shows its first frame. */
async function cameraShows(stream?: MediaStream) {
  await waitFor(() => (stream ? expect(video().srcObject).toBe(stream) : expect(video().srcObject).toBeTruthy()));
  fireEvent.loadedData(video());
}

describe('CameraModal', () => {
  it('opens the camera facing the user, video only, and shows its preview', async () => {
    const { stream } = fakeStream();
    getUserMedia.mockResolvedValueOnce(stream);
    renderInLang(<Harness />);

    expect(screen.getByText('Démarrage de la caméra…')).toBeTruthy();
    expect(button('Prendre la photo').disabled).toBe(true);
    await cameraShows(stream);

    expect(getUserMedia).toHaveBeenCalledWith({ audio: false, video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } });
    expect(button('Prendre la photo').disabled).toBe(false);
    expect(screen.queryByText('Démarrage de la caméra…')).toBeNull();
  });

  it('turns the camera off when the dialog closes', async () => {
    const { stream, track } = fakeStream();
    getUserMedia.mockResolvedValueOnce(stream);
    renderInLang(<Harness />);
    await cameraShows(stream);

    fireEvent.click(button('Annuler'));

    expect(screen.getByLabelText('dialog').textContent).toBe('closed');
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it('turns off a camera that only starts after the dialog was closed', async () => {
    const pending = deferred<MediaStream>();
    getUserMedia.mockReturnValueOnce(pending.promise);
    renderInLang(<Harness />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Fermer' })[0]);
    const { stream, track } = fakeStream();
    await act(async () => pending.resolve(stream));

    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it('takes a photo, retakes it, then uses the second one', async () => {
    const onUse = vi.fn(async () => undefined);
    const { stream, track } = fakeStream();
    getUserMedia.mockResolvedValueOnce(stream);
    renderInLang(<Harness onUse={onUse} />);
    await cameraShows(stream);

    fireEvent.click(button('Prendre la photo'));
    expect((await screen.findByRole('img', { name: 'Photo prise' })).getAttribute('src')).toBe('blob:shot');
    expect(vi.mocked(captureFrame)).toHaveBeenCalledWith(video());

    fireEvent.click(await screen.findByRole('button', { name: 'Reprendre la photo' }));
    await waitFor(() => expect(screen.queryByRole('img', { name: 'Photo prise' })).toBeNull());
    expect(getUserMedia).toHaveBeenCalledTimes(1); // the camera kept running

    const shutter = await screen.findByRole('button', { name: 'Prendre la photo' });
    await waitFor(() => expect((shutter as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(shutter);
    fireEvent.click(await screen.findByRole('button', { name: 'Utiliser cette photo' }));

    await waitFor(() => expect(screen.getByLabelText('dialog').textContent).toBe('closed'));
    expect(onUse).toHaveBeenCalledWith(photo);
    expect(track.stop).toHaveBeenCalled();
  });

  it('keeps the photo and shows the refusal of the API when saving fails', async () => {
    const onUse = vi.fn(async () => Promise.reject(new ApiError(413, ['La photo dépasse 512 Ko.'])));
    renderInLang(<Harness onUse={onUse} />);
    await cameraShows();
    fireEvent.click(button('Prendre la photo'));
    fireEvent.click(await screen.findByRole('button', { name: 'Utiliser cette photo' }));

    expect((await screen.findByRole('alert')).textContent).toContain('La photo dépasse 512 Ko.');
    expect(screen.getByRole('img', { name: 'Photo prise' })).toBeTruthy();
    expect(screen.getByLabelText('dialog').textContent).toBe('open');
  });

  it('stays open while the photo is being saved, so a late refusal is shown instead of lost', async () => {
    let fail!: (reason: unknown) => void;
    const onUse = vi.fn(
      () =>
        new Promise<void>((_, reject) => {
          fail = reject;
        }),
    );
    renderInLang(<Harness onUse={onUse} />);
    await cameraShows();
    fireEvent.click(button('Prendre la photo'));
    fireEvent.click(await screen.findByRole('button', { name: 'Utiliser cette photo' }));
    await waitFor(() => expect(onUse).toHaveBeenCalled());

    // Escape, the × button: ignored while the upload runs.
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Fermer' })[0]);
    expect(screen.getByLabelText('dialog').textContent).toBe('open');

    await act(async () => fail(new ApiError(0, ['Impossible de joindre le serveur. Vérifiez votre connexion.'])));

    expect((await screen.findByRole('alert')).textContent).toContain('Impossible de joindre le serveur.');
    expect(screen.getByRole('img', { name: 'Photo prise' })).toBeTruthy();
    // Once the refusal shows, the dialog closes again.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByLabelText('dialog').textContent).toBe('closed');
  });

  it('gives the keyboard focus to the shutter once the camera shows', async () => {
    renderInLang(<Harness />);
    await cameraShows();

    await waitFor(() => expect(document.activeElement).toBe(button('Prendre la photo')));
    // Still there after the dialog's own first focus (next frame).
    await act(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))));
    expect(document.activeElement).toBe(button('Prendre la photo'));
  });

  it('keeps the focus in the dialog when the camera fails, then on the shutter after "Réessayer"', async () => {
    getUserMedia.mockRejectedValueOnce(new DOMException('Permission denied', 'NotAllowedError'));
    renderInLang(<Harness />);

    await waitFor(() => expect(document.activeElement).toBe(button('Réessayer')));
    fireEvent.click(button('Réessayer'));
    await cameraShows();

    await waitFor(() => expect(document.activeElement).toBe(button('Prendre la photo')));
  });

  it('explains a refused permission, then tries again on request', async () => {
    getUserMedia.mockRejectedValueOnce(new DOMException('Permission denied', 'NotAllowedError'));
    renderInLang(<Harness onImport={() => undefined} />);

    expect(
      await screen.findByText('L’accès à la caméra est refusé. Autorisez la caméra pour ce site dans les réglages du navigateur, puis réessayez.'),
    ).toBeTruthy();
    expect(button('Importer une photo')).toBeTruthy();

    fireEvent.click(button('Réessayer'));
    await cameraShows();
    expect(getUserMedia).toHaveBeenCalledTimes(2);
  });

  it('says when the device has no camera, and offers to upload a file instead', async () => {
    const onImport = vi.fn();
    getUserMedia.mockRejectedValueOnce(new DOMException('Requested device not found', 'NotFoundError'));
    renderInLang(<Harness onImport={onImport} />);

    expect(await screen.findByText('Aucune caméra détectée. Branchez une webcam ou importez une photo.')).toBeTruthy();
    fireEvent.click(button('Importer une photo'));
    expect(onImport).toHaveBeenCalled();
  });

  it('says the camera needs https on a page served over http, with nothing to retry', async () => {
    setMediaDevices(undefined);
    vi.stubGlobal('isSecureContext', false);
    renderInLang(<Harness />);

    expect(await screen.findByText('La caméra ne fonctionne que sur une adresse sécurisée (https://). Importez une photo à la place.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull();
  });

  it('switches between the cameras of a tablet, stopping the one it leaves', async () => {
    cameras = ['front', 'back'];
    const front = fakeStream('front');
    const back = fakeStream('back');
    getUserMedia.mockResolvedValueOnce(front.stream).mockResolvedValueOnce(back.stream);
    renderInLang(<Harness />);
    await cameraShows(front.stream);

    fireEvent.click(await screen.findByRole('button', { name: 'Changer de caméra' }));
    await cameraShows(back.stream);

    expect(front.track.stop).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenLastCalledWith({ audio: false, video: { width: { ideal: 1280 }, height: { ideal: 720 }, deviceId: { exact: 'back' } } });
  });

  it('goes back to the default camera when the one picked is gone (unplugged webcam)', async () => {
    cameras = ['front', 'usb'];
    const front = fakeStream('front');
    getUserMedia
      .mockResolvedValueOnce(front.stream)
      .mockRejectedValueOnce(new DOMException('Constraints could not be satisfied', 'OverconstrainedError'))
      .mockResolvedValueOnce(fakeStream('front').stream);
    renderInLang(<Harness />);
    await cameraShows(front.stream);

    fireEvent.click(await screen.findByRole('button', { name: 'Changer de caméra' }));
    expect(await screen.findByText('Aucune caméra détectée. Branchez une webcam ou importez une photo.')).toBeTruthy();
    fireEvent.click(button('Réessayer'));
    await cameraShows();

    expect(getUserMedia.mock.calls.map(([constraints]) => (constraints.video as MediaTrackConstraints).deviceId ?? 'default')).toEqual([
      'default',
      { exact: 'usb' },
      'default',
    ]);
  });

  it('speaks Arabic', async () => {
    getUserMedia.mockRejectedValueOnce(new DOMException('Permission denied', 'NotAllowedError'));
    renderInLang(<Harness />, 'ar');
    expect(await screen.findByText('تم رفض الوصول إلى الكاميرا. اسمح باستخدام الكاميرا لهذا الموقع من إعدادات المتصفح، ثم أعد المحاولة.')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'التقاط صورة' })).toBeTruthy();
  });
});
