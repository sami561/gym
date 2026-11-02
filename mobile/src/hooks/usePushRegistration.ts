import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import { Href, router } from 'expo-router';
import { meApi } from '@/api/endpoints';
import { queryClient } from '@/lib/queryClient';
import { queryKeys } from './queries';
import { storage, STORAGE_KEYS } from '@/lib/storage';

type NotificationsModule = typeof import('expo-notifications');

export type PushStatus = 'granted' | 'denied' | 'unavailable';

/**
 * Remote push needs a physical device, an EAS projectId and (on Android) a development build:
 * Expo Go on Android no longer supports remote notifications. In every other case we skip silently.
 */
function loadNotifications(): NotificationsModule | null {
  if (Platform.OS === 'web' || !Device.isDevice) return null;
  if (Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return null;
  // Loaded lazily so Expo Go never evaluates the push module where it is unsupported.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-notifications') as NotificationsModule;
}

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;
}

let handlerInstalled = false;

async function registerForPush(): Promise<PushStatus> {
  const Notifications = loadNotifications();
  const id = projectId();
  if (!Notifications || !id) return 'unavailable';

  if (!handlerInstalled) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    handlerInstalled = true;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Meliora Gym',
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: '#D7141A',
      vibrationPattern: [0, 200, 120, 200],
    });
  }

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return 'denied';

  const token = (await Notifications.getExpoPushTokenAsync({ projectId: id })).data;
  const lastSent = await storage.get(STORAGE_KEYS.pushToken);
  if (lastSent !== token) {
    await meApi.registerPushToken(token);
    await storage.set(STORAGE_KEYS.pushToken, token);
  }
  return 'granted';
}

/** Registers the Expo push token with the backend once the member is signed in. */
export function usePushRegistration(enabled: boolean): PushStatus | null {
  const [status, setStatus] = useState<PushStatus | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    registerForPush()
      .then((result) => !cancelled && setStatus(result))
      .catch(() => !cancelled && setStatus('unavailable'));
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return status;
}

/** Current permission state, for the profile screen. */
export async function getPushStatus(): Promise<PushStatus> {
  const Notifications = loadNotifications();
  if (!Notifications || !projectId()) return 'unavailable';
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'unavailable';
  }
}

/**
 * In-app path: a single leading slash. '//host/path' is protocol-relative (expo-router opens it in the browser)
 * and URL parsers read '/\host/path' the same way.
 */
const IN_APP_PATH = /^\/(?![/\\])/;

/** Where a tapped notification leads. Booking pushes carry { type, sessionId }. */
export function notificationRoute(data: Record<string, unknown> | undefined): Href | null {
  if (!data) return null;
  const sessionId = typeof data.sessionId === 'string' ? data.sessionId : null;
  if (sessionId && (data.type === 'booking.promoted' || data.type === 'booking.reminder' || data.screen === 'class')) {
    return { pathname: '/class/[id]', params: { id: sessionId } };
  }
  if (typeof data.url === 'string' && IN_APP_PATH.test(data.url)) return data.url as Href;
  if (data.screen === 'payments') return '/history';
  if (data.screen === 'membership') return '/';
  return null;
}

const REFRESH_ON_PUSH: Record<string, readonly (readonly string[])[]> = {
  'booking.promoted': [queryKeys.bookings, ['classes'], queryKeys.standing],
  'booking.reminder': [queryKeys.bookings],
  'subscription.expiring': [queryKeys.me],
  'subscription.expired': [queryKeys.me],
  'payment.received': [queryKeys.me],
};

/** Opens the right screen when a notification is tapped (also on cold start) and refreshes data on arrival. */
export function useNotificationNavigation(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const Notifications = loadNotifications();
    if (!Notifications) return;

    const open = (notification: import('expo-notifications').Notification) => {
      const route = notificationRoute(notification.request.content.data as Record<string, unknown> | undefined);
      if (route) router.push(route);
    };

    const last = Notifications.getLastNotificationResponse();
    if (last?.notification) {
      open(last.notification);
      Notifications.clearLastNotificationResponse();
    }

    const responses = Notifications.addNotificationResponseReceivedListener((response) => {
      open(response.notification);
      Notifications.clearLastNotificationResponse();
    });
    const received = Notifications.addNotificationReceivedListener((notification) => {
      const type = (notification.request.content.data as Record<string, unknown> | undefined)?.type;
      for (const key of REFRESH_ON_PUSH[String(type)] ?? []) queryClient.invalidateQueries({ queryKey: key });
    });
    return () => {
      responses.remove();
      received.remove();
    };
  }, [enabled]);
}
