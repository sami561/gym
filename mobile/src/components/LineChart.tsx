import { useMemo, useState } from 'react';
import { GestureResponderEvent, LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { formatShortDate } from '@/lib/format';
import { colors, fonts, radius, spacing } from '@/theme';
import { AppText } from './AppText';

export interface ChartPoint {
  /** YYYY-MM-DD */
  date: string;
  value: number;
}

interface Props {
  points: ChartPoint[];
  locale: string;
  formatValue: (value: number) => string;
  height?: number;
  color?: string;
  accessibilityLabel?: string;
}

const PAD = { top: 18, right: 52, bottom: 26, left: 40 };

/** Clean tick values (1/2/2.5/5 × 10^n) spanning the data. */
function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const raw = (max - min) / (count - 1);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / magnitude;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * magnitude;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toFixed(6)));
  return ticks;
}

function dayValue(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

/**
 * Single-series line chart: 2px line, 8px markers with a surface ring, hairline grid,
 * only the latest value labelled; touch & drag scrubs a crosshair that snaps to the nearest measurement.
 * Time is proportional on X (measurements are irregular). Y does not start at zero, so no area fill.
 */
export function LineChart({ points, locale, formatValue, height = 210, color = colors.red, accessibilityLabel }: Props) {
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  const geometry = useMemo(() => {
    if (!width || points.length === 0) return null;
    const plotW = width - PAD.left - PAD.right;
    const plotH = height - PAD.top - PAD.bottom;
    const values = points.map((p) => p.value);
    const ticks = niceTicks(Math.min(...values), Math.max(...values));
    const yMin = ticks[0];
    const yMax = ticks[ticks.length - 1];
    const times = points.map((p) => dayValue(p.date));
    const t0 = times[0];
    const t1 = times[times.length - 1];
    const x = (i: number) => (t1 === t0 ? PAD.left + plotW / 2 : PAD.left + ((times[i] - t0) / (t1 - t0)) * plotW);
    const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin || 1)) * plotH;
    const coords = points.map((p, i) => ({ x: x(i), y: y(p.value) }));
    const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
    return { plotW, plotH, ticks, y, coords, path };
  }, [width, height, points]);

  const pick = (event: GestureResponderEvent) => {
    if (!geometry) return;
    const touchX = event.nativeEvent.locationX;
    let nearest = 0;
    geometry.coords.forEach((c, i) => {
      if (Math.abs(c.x - touchX) < Math.abs(geometry.coords[nearest].x - touchX)) nearest = i;
    });
    setActive(nearest);
  };

  const last = points.length - 1;
  const activePoint = active !== null ? points[active] : null;
  const activeCoord = active !== null && geometry ? geometry.coords[active] : null;
  const tooltipLeft = activeCoord ? Math.min(Math.max(activeCoord.x - 64, 0), Math.max(0, width - 128)) : 0;

  return (
    <View
      style={{ height }}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={pick}
      onResponderMove={pick}
      onResponderRelease={() => setActive(null)}
      onResponderTerminate={() => setActive(null)}
    >
      {geometry ? (
        <Svg width={width} height={height}>
          {geometry.ticks.map((tick) => {
            const ty = geometry.y(tick);
            return (
              <Line key={`g${tick}`} x1={PAD.left} x2={width - PAD.right} y1={ty} y2={ty} stroke={colors.surfaceHigh} strokeWidth={1} />
            );
          })}
          {geometry.ticks.map((tick) => (
            <SvgText
              key={`t${tick}`}
              x={PAD.left - 8}
              y={geometry.y(tick) + 4}
              fontSize={11}
              fontFamily={fonts.regular}
              fill={colors.textFaint}
              textAnchor="end"
            >
              {Number.isInteger(tick) ? tick : tick.toFixed(1)}
            </SvgText>
          ))}
          <SvgText x={geometry.coords[0].x} y={height - 6} fontSize={11} fontFamily={fonts.regular} fill={colors.textFaint} textAnchor="start">
            {formatShortDate(points[0].date, locale)}
          </SvgText>
          {last > 0 ? (
            <SvgText
              x={geometry.coords[last].x}
              y={height - 6}
              fontSize={11}
              fontFamily={fonts.regular}
              fill={colors.textFaint}
              textAnchor="end"
            >
              {formatShortDate(points[last].date, locale)}
            </SvgText>
          ) : null}

          {activeCoord ? (
            <Line x1={activeCoord.x} x2={activeCoord.x} y1={PAD.top - 6} y2={PAD.top + geometry.plotH} stroke={colors.steel} strokeWidth={1} />
          ) : null}

          {points.length > 1 ? (
            <Path d={geometry.path} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          ) : null}
          {geometry.coords.map((c, i) => (
            <Circle
              key={points[i].date + i}
              cx={c.x}
              cy={c.y}
              r={i === active ? 6 : 4}
              fill={color}
              stroke={colors.surface}
              strokeWidth={2}
            />
          ))}

          {active === null ? (
            <SvgText
              x={geometry.coords[last].x + 10}
              y={geometry.coords[last].y + 4}
              fontSize={12}
              fontFamily={fonts.semibold}
              fill={colors.text}
              textAnchor="start"
            >
              {formatValue(points[last].value)}
            </SvgText>
          ) : null}
        </Svg>
      ) : null}

      {activePoint && activeCoord ? (
        <Animated.View entering={FadeIn.duration(120)} pointerEvents="none" style={[styles.tooltip, { left: tooltipLeft }]}>
          <View style={styles.tooltipRow}>
            <View style={[styles.key, { backgroundColor: color }]} />
            <AppText variant="bodyStrong">{formatValue(activePoint.value)}</AppText>
          </View>
          <AppText variant="caption">{formatShortDate(activePoint.date, locale)}</AppText>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tooltip: {
    position: 'absolute',
    top: -6,
    width: 128,
    backgroundColor: colors.surfaceHigh,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm + 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  tooltipRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  key: { width: 12, height: 2, borderRadius: 1 },
});
