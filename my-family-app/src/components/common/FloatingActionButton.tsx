import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';

import {
  BottomTabInset,
  FamilyPalette,
  FamilyRadius,
  FamilySpacing,
} from '@/constants/familyTheme';

interface FloatingActionButtonProps {
  onPress: () => void;
  style?: ViewStyle;
}

export function FloatingActionButton({ onPress, style }: FloatingActionButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.fab,
        pressed && styles.pressed,
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel="Add">
      <Text style={styles.icon}>+</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: FamilySpacing.lg,
    bottom: BottomTabInset + FamilySpacing.md,
    width: 56,
    height: 56,
    borderRadius: FamilyRadius.pill,
    backgroundColor: FamilyPalette.champagne,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: FamilyPalette.charcoal,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  icon: {
    fontSize: 28,
    fontWeight: '300',
    color: FamilyPalette.white,
    lineHeight: 30,
    marginTop: -2,
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.96 }],
  },
});
