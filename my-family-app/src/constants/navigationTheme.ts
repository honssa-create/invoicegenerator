import { FamilyPalette } from './familyTheme';

/** Navigation theme aligned with Quiet Luxury palette */
export const FamilyNavigationTheme = {
  dark: false,
  colors: {
    primary: FamilyPalette.champagne,
    background: FamilyPalette.cream,
    card: FamilyPalette.softWhite,
    text: FamilyPalette.charcoal,
    border: FamilyPalette.border,
    notification: FamilyPalette.champagne,
  },
  fonts: {
    regular: { fontFamily: 'System', fontWeight: '400' as const },
    medium: { fontFamily: 'System', fontWeight: '500' as const },
    bold: { fontFamily: 'System', fontWeight: '600' as const },
    heavy: { fontFamily: 'System', fontWeight: '700' as const },
  },
};
