import { Platform } from 'react-native';

/** Meliora brand: black shield, steel facade, logo red. */
export const colors = {
  bg: '#0B0B0C',
  surface: '#141416',
  surfaceAlt: '#1C1D20',
  surfaceHigh: '#26272B',
  border: '#2C2D32',
  steel: '#8C929C',
  text: '#FFFFFF',
  textMuted: '#A3A3AD',
  textFaint: '#6B6B75',
  red: '#D7141A',
  redDark: '#8F0C10',
  redSoft: 'rgba(215, 20, 26, 0.14)',
  green: '#22C55E',
  greenSoft: 'rgba(34, 197, 94, 0.14)',
  amber: '#F59E0B',
  amberSoft: 'rgba(245, 158, 11, 0.14)',
  blue: '#60A5FA',
  blueSoft: 'rgba(96, 165, 250, 0.14)',
  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(11, 11, 12, 0.72)',
} as const;

export const fonts = {
  display: 'BebasNeue_400Regular',
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

/** Cairo replaces Bebas Neue / Inter when the app is in Arabic (Bebas has no Arabic glyphs). */
const ARABIC_FONTS: Record<string, string> = {
  [fonts.display]: 'Cairo_700Bold',
  [fonts.regular]: 'Cairo_400Regular',
  [fonts.medium]: 'Cairo_500Medium',
  [fonts.semibold]: 'Cairo_600SemiBold',
  [fonts.bold]: 'Cairo_700Bold',
};

export function fontFor(family: string | undefined, lang: string): string | undefined {
  if (lang !== 'ar') return family;
  return (family && ARABIC_FONTS[family]) || ARABIC_FONTS[fonts.regular];
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export const shadow = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  default: { elevation: 6 },
});
