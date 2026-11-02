import { I18nManager, Platform } from 'react-native';
import { reloadAppAsync } from 'expo';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { storage } from './storage';

/**
 * Layout direction (LTR for fr/en, RTL for ar) is read by React Native at startup, so changing it
 * means flipping I18nManager and reloading the JS bundle (reloadAppAsync works in debug and release).
 * Expo Go resets RTL preferences when it opens a project: there, the text is translated but the
 * layout follows the device language — test RTL in a development build.
 */
export type DirectionResult = 'unchanged' | 'reloading' | 'restart-required' | 'expo-go';

export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/** Glyphs that point "forward" (chevrons, arrows) must be mirrored in RTL. */
export const mirrorInRTL = I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined;

/** Push transitions follow the reading direction. */
export const pushAnimation = I18nManager.isRTL ? 'slide_from_left' : 'slide_from_right';

const GUARD_KEY = 'meliora.directionReload';

export async function applyLayoutDirection(rtl: boolean): Promise<DirectionResult> {
  if (Platform.OS === 'web' || I18nManager.isRTL === rtl) return 'unchanged';
  // Expo Go would reset the preference on reload: translate only, layout follows the phone.
  if (isExpoGo) return 'expo-go';
  I18nManager.allowRTL(rtl);
  I18nManager.forceRTL(rtl);
  await storage.setJSON(GUARD_KEY, { rtl, at: Date.now() }).catch(() => undefined);
  try {
    await reloadAppAsync(rtl ? 'Switch to right-to-left layout' : 'Switch to left-to-right layout');
    return 'reloading';
  } catch {
    return 'restart-required';
  }
}

/**
 * At startup the saved language decides the direction. Reload once when the native layout does not
 * match; if the previous attempt did not stick (Expo Go), do not loop.
 */
export async function syncLayoutDirection(rtl: boolean): Promise<DirectionResult> {
  if (Platform.OS === 'web' || I18nManager.isRTL === rtl) return 'unchanged';
  if (isExpoGo) return 'expo-go';
  const last = await storage.getJSON<{ rtl: boolean; at: number }>(GUARD_KEY);
  if (last && last.rtl === rtl && Date.now() - last.at < 60_000) return 'restart-required';
  return applyLayoutDirection(rtl);
}
