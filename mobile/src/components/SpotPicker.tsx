import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useI18n } from '@/i18n';
import { colors, fonts, radius, spacing } from '@/theme';
import { AppText } from './AppText';

interface Props {
  capacity: number;
  taken: number[];
  /** The member's own spot (already booked). */
  mine?: number | null;
  selected: number | null;
  onSelect?: (spot: number) => void;
  disabled?: boolean;
}

function Spot({
  n,
  state,
  selected,
  onPress,
}: {
  n: number;
  state: 'free' | 'taken' | 'mine';
  selected: boolean;
  onPress?: () => void;
}) {
  const style = useAnimatedStyle(() => ({ transform: [{ scale: withSpring(selected ? 1.08 : 1, { damping: 14 }) }] }));
  const { t } = useI18n();
  const label =
    state === 'taken' ? t('classes.taken') : state === 'mine' ? t('classes.yours') : t('classes.free');

  return (
    <Animated.View style={style}>
      <Pressable
        onPress={onPress}
        disabled={!onPress || state !== 'free'}
        accessibilityRole="radio"
        accessibilityState={{ checked: selected, disabled: state !== 'free' }}
        accessibilityLabel={`${t('classes.spotN', { n })}, ${label}`}
        style={[
          styles.spot,
          state === 'taken' && styles.spotTaken,
          state === 'mine' && styles.spotMine,
          selected && styles.spotSelected,
        ]}
      >
        {state === 'taken' ? (
          <Ionicons name="person" size={16} color={colors.textFaint} />
        ) : (
          <AppText style={[styles.spotLabel, (selected || state === 'mine') && styles.spotLabelActive]}>{n}</AppText>
        )}
      </Pressable>
    </Animated.View>
  );
}

/** Numbered places (bikes, mats…). Taken places carry an icon, not only a color. */
export function SpotPicker({ capacity, taken, mine, selected, onSelect, disabled }: Props) {
  const { t } = useI18n();
  const takenSet = new Set(taken);
  const spots = Array.from({ length: capacity }, (_, i) => i + 1);

  return (
    <View style={styles.wrapper}>
      <View style={styles.grid} accessibilityRole="radiogroup">
        {spots.map((n) => {
          const state = n === mine ? 'mine' : takenSet.has(n) ? 'taken' : 'free';
          return (
            <Spot
              key={n}
              n={n}
              state={state}
              selected={selected === n}
              onPress={
                disabled || !onSelect
                  ? undefined
                  : () => {
                      Haptics.selectionAsync().catch(() => undefined);
                      onSelect(n);
                    }
              }
            />
          );
        })}
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, styles.spot]} />
          <AppText variant="caption">{t('classes.free')}</AppText>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, styles.spot, styles.spotTaken]}>
            <Ionicons name="person" size={9} color={colors.textFaint} />
          </View>
          <AppText variant="caption">{t('classes.taken')}</AppText>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, styles.spot, styles.spotSelected]} />
          <AppText variant="caption">{mine ? t('classes.yours') : t('classes.pickSpot')}</AppText>
        </View>
      </View>
    </View>
  );
}

const SIZE = 48;

const styles = StyleSheet.create({
  wrapper: { gap: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'flex-start' },
  spot: {
    width: SIZE,
    height: SIZE,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spotTaken: { backgroundColor: colors.bg, borderColor: colors.surfaceHigh, borderStyle: 'dashed' },
  spotMine: { borderColor: colors.red, borderWidth: 2, backgroundColor: colors.redSoft },
  spotSelected: { backgroundColor: colors.red, borderColor: colors.red },
  spotLabel: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  spotLabelActive: { color: colors.white },
  legend: { flexDirection: 'row', gap: spacing.lg, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 18, height: 18, borderRadius: 4 },
});
