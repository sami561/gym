import { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '@/theme';
import { AppText } from './AppText';
import { Logo } from './Logo';

/** Facade photo hero + form, shared by sign-in and register. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <Image source={require('../../assets/images/facade.jpg')} style={styles.hero} contentFit="cover" contentPosition="top" />
      <LinearGradient
        colors={['rgba(11,11,12,0.25)', 'rgba(11,11,12,0.85)', colors.bg]}
        locations={[0, 0.45, 0.7]}
        style={StyleSheet.absoluteFill}
      />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xxl }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={FadeInDown.duration(500)} style={styles.brand}>
            <Logo size={88} />
            <AppText variant="overline" color={colors.steel} style={styles.brandName}>
              Meliora Gym · Sousse
            </AppText>
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(120).duration(500)} style={styles.titles}>
            <AppText variant="display">{title}</AppText>
            <AppText variant="label">{subtitle}</AppText>
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(220).duration(500)} style={styles.form}>
            {children}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  hero: { position: 'absolute', top: 0, left: 0, right: 0, height: '62%' },
  content: { flexGrow: 1, justifyContent: 'flex-end', paddingHorizontal: spacing.xl, gap: spacing.xl },
  brand: { alignItems: 'flex-start', gap: spacing.md },
  brandName: { marginTop: spacing.xs },
  titles: { gap: spacing.xs },
  form: { gap: spacing.lg },
});
