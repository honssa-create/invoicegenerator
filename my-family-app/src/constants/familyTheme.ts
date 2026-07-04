import { Platform } from 'react-native';

/** Quiet Luxury palette — champagne gold, cream, soft white */
export const FamilyPalette = {
  champagne: '#C4A77D',
  champagneLight: '#E8DCC8',
  champagneMuted: '#D9CDB8',
  cream: '#FAF7F2',
  softWhite: '#FEFCF9',
  white: '#FFFFFF',
  charcoal: '#2C2A28',
  charcoalSoft: '#5C5854',
  charcoalMuted: '#8A8580',
  border: '#EDE8E0',
  shadow: 'rgba(44, 42, 40, 0.06)',
} as const;

export const FamilyTypography = {
  title: {
    fontSize: 28,
    fontWeight: '300' as const,
    letterSpacing: 0.5,
    color: FamilyPalette.charcoal,
  },
  heading: {
    fontSize: 20,
    fontWeight: '400' as const,
    letterSpacing: 0.3,
    color: FamilyPalette.charcoal,
  },
  body: {
    fontSize: 16,
    fontWeight: '400' as const,
    lineHeight: 24,
    color: FamilyPalette.charcoalSoft,
  },
  caption: {
    fontSize: 13,
    fontWeight: '400' as const,
    letterSpacing: 0.2,
    color: FamilyPalette.charcoalMuted,
  },
  label: {
    fontSize: 12,
    fontWeight: '500' as const,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
    color: FamilyPalette.champagne,
  },
};

export const FamilySpacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const FamilyRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const BottomTabInset = Platform.select({ ios: 88, android: 72, default: 64 }) ?? 64;
export const MaxContentWidth = 640;
