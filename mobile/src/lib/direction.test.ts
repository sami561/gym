import { describe, expect, it, jest } from '@jest/globals';
import { ExecutionEnvironment } from 'expo-constants';

type Direction = typeof import('./direction');

interface Device {
  os?: 'ios' | 'android' | 'web';
  /** Layout direction React Native started with. */
  rtl?: boolean;
  expoGo?: boolean;
}

/** Secure store stand-in that survives app restarts within a test. */
function fakeStorage() {
  const values = new Map<string, unknown>();
  return {
    getJSON: jest.fn(async (key: string) => values.get(key) ?? null),
    setJSON: jest.fn(async (key: string, value: unknown) => {
      values.set(key, value);
    }),
  };
}

/** Starts the app: a fresh copy of direction.ts, whose constants are read once at startup like on a device. */
function startApp({ os = 'ios', rtl = false, expoGo = false }: Device = {}, storage = fakeStorage()) {
  const I18nManager = { isRTL: rtl, allowRTL: jest.fn(), forceRTL: jest.fn() };
  const reloadAppAsync = jest.fn<(reason?: string) => Promise<void>>(async () => undefined);
  let direction!: Direction;
  jest.isolateModules(() => {
    jest.doMock('react-native', () => ({ I18nManager, Platform: { OS: os } }));
    jest.doMock('expo', () => ({ reloadAppAsync }));
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      ExecutionEnvironment,
      default: { executionEnvironment: expoGo ? ExecutionEnvironment.StoreClient : ExecutionEnvironment.Bare },
    }));
    jest.doMock('./storage', () => ({ storage }));
    direction = jest.requireActual<Direction>('./direction');
  });
  return { ...direction, I18nManager, reloadAppAsync, storage };
}

const T0 = Date.UTC(2026, 10, 2, 9, 0, 0);

describe('startup constants', () => {
  it('keeps glyphs and push transitions as they are left-to-right', () => {
    const app = startApp({ rtl: false });
    expect(app.mirrorInRTL).toBeUndefined();
    expect(app.pushAnimation).toBe('slide_from_right');
  });

  it('mirrors forward glyphs and pushes from the left right-to-left', () => {
    const app = startApp({ rtl: true });
    expect(app.mirrorInRTL).toEqual({ transform: [{ scaleX: -1 }] });
    expect(app.pushAnimation).toBe('slide_from_left');
  });

  it('detects Expo Go', () => {
    expect(startApp({ expoGo: true }).isExpoGo).toBe(true);
    expect(startApp({ expoGo: false }).isExpoGo).toBe(false);
  });
});

describe('applyLayoutDirection (language picked in the app)', () => {
  it.each(['ios', 'android'] as const)('forces right-to-left then reloads on %s', async (os) => {
    const app = startApp({ os, rtl: false });
    await expect(app.applyLayoutDirection(true)).resolves.toBe('reloading');
    expect(app.I18nManager.allowRTL).toHaveBeenCalledWith(true);
    expect(app.I18nManager.forceRTL).toHaveBeenCalledWith(true);
    expect(app.reloadAppAsync).toHaveBeenCalledTimes(1);
    // The flag must be set before the bundle reloads, or the new layout would not apply.
    expect(app.I18nManager.forceRTL.mock.invocationCallOrder[0]).toBeLessThan(
      app.reloadAppAsync.mock.invocationCallOrder[0],
    );
  });

  it('switches back to left-to-right', async () => {
    const app = startApp({ rtl: true });
    await expect(app.applyLayoutDirection(false)).resolves.toBe('reloading');
    expect(app.I18nManager.allowRTL).toHaveBeenCalledWith(false);
    expect(app.I18nManager.forceRTL).toHaveBeenCalledWith(false);
  });

  it('does nothing when the layout already matches', async () => {
    const app = startApp({ rtl: true });
    await expect(app.applyLayoutDirection(true)).resolves.toBe('unchanged');
    expect(app.I18nManager.forceRTL).not.toHaveBeenCalled();
    expect(app.reloadAppAsync).not.toHaveBeenCalled();
  });

  it('does nothing on web', async () => {
    const app = startApp({ os: 'web', rtl: false });
    await expect(app.applyLayoutDirection(true)).resolves.toBe('unchanged');
    expect(app.I18nManager.forceRTL).not.toHaveBeenCalled();
    expect(app.reloadAppAsync).not.toHaveBeenCalled();
  });

  it('only translates in Expo Go, which would reset the layout on reload', async () => {
    const app = startApp({ expoGo: true, rtl: false });
    await expect(app.applyLayoutDirection(true)).resolves.toBe('expo-go');
    expect(app.I18nManager.forceRTL).not.toHaveBeenCalled();
    expect(app.reloadAppAsync).not.toHaveBeenCalled();
  });

  it('asks for a manual restart when the reload fails, keeping the new direction for next start', async () => {
    const app = startApp({ rtl: false });
    app.reloadAppAsync.mockRejectedValueOnce(new Error('reload unavailable'));
    await expect(app.applyLayoutDirection(true)).resolves.toBe('restart-required');
    expect(app.I18nManager.forceRTL).toHaveBeenCalledWith(true);
  });

  it('still reloads when the secure store cannot be written', async () => {
    const app = startApp({ rtl: false });
    app.storage.setJSON.mockRejectedValueOnce(new Error('keychain locked'));
    await expect(app.applyLayoutDirection(true)).resolves.toBe('reloading');
  });
});

describe('syncLayoutDirection (saved language at startup)', () => {
  it('reloads once when the saved language needs the other direction', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(T0);
    const app = startApp({ rtl: false });
    await expect(app.syncLayoutDirection(true)).resolves.toBe('reloading');
    expect(app.I18nManager.forceRTL).toHaveBeenCalledWith(true);
  });

  it('does not reload in a loop when the switch did not stick', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(T0);
    const storage = fakeStorage();
    await expect(startApp({ rtl: false }, storage).syncLayoutDirection(true)).resolves.toBe('reloading');

    // Restarted, but React Native is still left-to-right.
    now.mockReturnValue(T0 + 59_999);
    const restarted = startApp({ rtl: false }, storage);
    await expect(restarted.syncLayoutDirection(true)).resolves.toBe('restart-required');
    expect(restarted.reloadAppAsync).not.toHaveBeenCalled();
    expect(restarted.I18nManager.forceRTL).not.toHaveBeenCalled();
  });

  it('tries again once the last attempt is a minute old', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(T0);
    const storage = fakeStorage();
    await startApp({ rtl: false }, storage).syncLayoutDirection(true);

    now.mockReturnValue(T0 + 60_000);
    const later = startApp({ rtl: false }, storage);
    await expect(later.syncLayoutDirection(true)).resolves.toBe('reloading');
    expect(later.reloadAppAsync).toHaveBeenCalledTimes(1);
  });

  it('is not held back by a recent switch the other way', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(T0);
    const storage = fakeStorage();
    await startApp({ rtl: true }, storage).syncLayoutDirection(false);

    now.mockReturnValue(T0 + 1_000);
    await expect(startApp({ rtl: false }, storage).syncLayoutDirection(true)).resolves.toBe('reloading');
  });

  it('leaves a matching layout, the web and Expo Go alone', async () => {
    const matching = startApp({ rtl: true });
    await expect(matching.syncLayoutDirection(true)).resolves.toBe('unchanged');
    await expect(startApp({ os: 'web' }).syncLayoutDirection(true)).resolves.toBe('unchanged');
    const expoGo = startApp({ expoGo: true });
    await expect(expoGo.syncLayoutDirection(true)).resolves.toBe('expo-go');
    for (const app of [matching, expoGo]) {
      expect(app.I18nManager.forceRTL).not.toHaveBeenCalled();
      expect(app.reloadAppAsync).not.toHaveBeenCalled();
    }
  });
});
