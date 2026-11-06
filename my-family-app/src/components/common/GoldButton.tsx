import { Pressable, StyleSheet, Text } from 'react-native';

import {
  FamilyPalette,
  FamilyRadius,
  FamilySpacing,
} from '@/constants/familyTheme';

interface GoldButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'filled' | 'outline';
}

export function GoldButton({ label, onPress, variant = 'filled' }: GoldButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'outline' && styles.outline,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.text, variant === 'outline' && styles.outlineText]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: FamilyPalette.champagne,
    borderRadius: FamilyRadius.md,
    paddingVertical: FamilySpacing.md,
    alignItems: 'center',
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: FamilyPalette.champagne,
  },
  text: {
    color: FamilyPalette.white,
    fontSize: 15,
    fontWeight: '400',
    letterSpacing: 0.8,
  },
  outlineText: {
    color: FamilyPalette.champagne,
  },
  pressed: {
    opacity: 0.85,
  },
});
