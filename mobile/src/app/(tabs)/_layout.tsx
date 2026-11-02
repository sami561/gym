import { ComponentProps } from 'react';
import { ColorValue, Platform, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';
import { useAuth } from '@/auth/AuthProvider';
import { useNotificationNavigation, usePushRegistration } from '@/hooks/usePushRegistration';
import { useI18n } from '@/i18n';
import { colors, fontFor, fonts } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

function tabIcon(active: IconName, inactive: IconName) {
  function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Ionicons name={focused ? active : inactive} size={23} color={typeof color === 'number' ? undefined : (color ?? undefined)} />;
  }
  return TabIcon;
}

export default function TabsLayout() {
  const { t, lang } = useI18n();
  const { status } = useAuth();
  usePushRegistration(status === 'signedIn');
  useNotificationNavigation(status === 'signedIn');

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.white,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: styles.bar,
        tabBarLabelStyle: [styles.label, { fontFamily: fontFor(fonts.medium, lang) }],
        tabBarHideOnKeyboard: true,
        sceneStyle: { backgroundColor: colors.bg },
        animation: 'shift',
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.home'), tabBarIcon: tabIcon('home', 'home-outline') }} />
      <Tabs.Screen name="classes" options={{ title: t('tabs.classes'), tabBarIcon: tabIcon('calendar', 'calendar-outline') }} />
      <Tabs.Screen
        name="pass"
        options={{
          title: t('tabs.pass'),
          tabBarIcon: ({ focused }) => (
            <View style={[styles.passIcon, focused && styles.passIconFocused]}>
              <Ionicons name="qr-code" size={24} color={colors.white} />
            </View>
          ),
        }}
      />
      <Tabs.Screen name="training" options={{ title: t('tabs.training'), tabBarIcon: tabIcon('barbell', 'barbell-outline') }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile'), tabBarIcon: tabIcon('person', 'person-outline') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    height: Platform.select({ ios: 88, default: 68 }),
    paddingTop: 6,
  },
  label: { fontFamily: fonts.medium, fontSize: 11 },
  passIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginTop: -22,
    backgroundColor: colors.redDark,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.bg,
  },
  passIconFocused: { backgroundColor: colors.red },
});
