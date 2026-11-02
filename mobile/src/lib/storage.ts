import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/** Small key/value store: Keychain/Keystore on device, localStorage on web (dev only). */
export const storage = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      try {
        return globalThis.localStorage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    }
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },

  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        globalThis.localStorage?.setItem(key, value);
      } catch {
        // storage unavailable (private mode): keep the value in memory only
      }
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },

  async remove(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        globalThis.localStorage?.removeItem(key);
      } catch {
        // ignore
      }
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },

  async getJSON<T>(key: string): Promise<T | null> {
    const raw = await storage.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },

  setJSON(key: string, value: unknown): Promise<void> {
    return storage.set(key, JSON.stringify(value));
  },
};

export const STORAGE_KEYS = {
  tokens: 'meliora.tokens',
  user: 'meliora.user',
  accessKey: 'meliora.accessKey',
  lang: 'meliora.lang',
  pushToken: 'meliora.pushToken',
} as const;
