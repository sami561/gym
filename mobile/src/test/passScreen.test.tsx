import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, type ReactElement } from 'react';
import { createRoot, type Root, type TestInstance } from 'test-renderer';
import type { AccessKey } from '@/api/types';
import PassScreen from '@/app/(tabs)/pass';
import { memberProfile } from './fixtures';

/*
 * The pass screen (src/app/(tabs)/pass.tsx), rendered with jest-expo's test renderer. This test cannot sit next to the
 * screen: every file under src/app is a route. The data hooks are spies; Screen and its pull-to-refresh are the real ones.
 */

// jest.mock factories may only use variables whose name starts with `mock` (they read them at render time).
const mockRefreshKey = jest.fn(() => Promise.resolve());
const mockRefetchMe = jest.fn(() => Promise.resolve());
const mockKey: AccessKey = { memberCode: 'MEL-00042', secret: 'secret', period: 30, format: 'MLR1' };
const mockProfile = memberProfile();

jest.mock('@/hooks/useAccessKey', () => ({
  useAccessKey: () => ({ key: mockKey, loading: false, offline: false, error: null, refresh: mockRefreshKey }),
}));
jest.mock('@/hooks/queries', () => ({
  useMe: () => ({ data: { profile: mockProfile }, refetch: mockRefetchMe, isRefetching: false }),
}));
jest.mock('@/hooks/useNow', () => ({ useNow: () => Date.UTC(2026, 10, 3, 9) }));
jest.mock('@/i18n', () => ({ useI18n: () => ({ t: (path: string) => path, lang: 'fr' }) }));
jest.mock('@/components/MemberAvatar', () => ({ MemberAvatar: () => null }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: jest.fn() }));
// Native pieces Jest cannot load (worklets, SVG, icon font); what the pass draws is not under test here.
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const entering = { duration: () => entering };
  return { __esModule: true, default: { View }, FadeIn: entering, ZoomIn: entering };
});
jest.mock('@/components/CountdownRing', () => ({ CountdownRing: () => null }));
jest.mock('@/components/Button', () => ({ Button: () => null }));
jest.mock('react-native-qrcode-svg', () => ({ __esModule: true, default: () => null }));
jest.mock('@expo/vector-icons/Ionicons', () => ({ __esModule: true, default: () => null }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function render(): Promise<Root> {
  const root = createRoot();
  await act(async () => root.render(<PassScreen />));
  return root;
}

/** Calls what the member's pull-down gesture calls: the RefreshControl that Screen gives its ScrollView. */
async function pullToRefresh(root: Root) {
  const [scroll] = root.container.queryAll((node: TestInstance) => node.props.refreshControl !== undefined);
  const control = scroll?.props.refreshControl as ReactElement<{ onRefresh: () => void }> | undefined;
  expect(control?.props.onRefresh).toEqual(expect.any(Function));
  await act(async () => control?.props.onRefresh());
}

describe('pass screen', () => {
  beforeEach(() => {
    mockRefreshKey.mockClear();
    mockRefetchMe.mockClear();
  });

  // Staff can add or replace the photo (or change the name, the membership) at the desk while the pass is open: the
  // pull-to-refresh must bring the new photoUpdatedAt, not only a new QR key.
  it('refreshes the access key and the member on pull-to-refresh', async () => {
    const root = await render();
    try {
      await pullToRefresh(root);
      expect(mockRefreshKey).toHaveBeenCalledTimes(1);
      expect(mockRefetchMe).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => root.unmount());
    }
  });
});
