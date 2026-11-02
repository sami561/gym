import { useEffect, useState } from 'react';

export interface ChartColors {
  surface: string;
  series1: string;
  series2: string;
  series3: string;
  /** Employee positions, fixed order MANAGER, RECEPTION, COACH, CLEANING, MAINTENANCE, OTHER. */
  positions: string[];
  /** Ordinal ramp (light → dark) for ordered categories. */
  ordinal: string[];
  other: string;
  grid: string;
  axis: string;
  muted: string;
  fg: string;
  fg2: string;
}

function read(): ChartColors {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    surface: v('--chart-surface'),
    series1: v('--series-1'),
    series2: v('--series-2'),
    series3: v('--series-3'),
    positions: [1, 2, 3, 4, 5, 6].map((i) => v(`--pos-${i}`)),
    ordinal: [1, 2, 3, 4, 5].map((i) => v(`--ord-${i}`)),
    other: v('--other'),
    grid: v('--grid'),
    axis: v('--axis'),
    muted: v('--muted'),
    fg: v('--fg'),
    fg2: v('--fg-2'),
  };
}

/**
 * SVG attributes cannot resolve CSS variables reliably, so charts read the
 * resolved theme tokens and re-read them when the theme switches.
 */
export function useChartColors(): ChartColors {
  const [colors, setColors] = useState<ChartColors>(read);
  useEffect(() => {
    const observer = new MutationObserver(() => setColors(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  return colors;
}
