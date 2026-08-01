import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import {
  FamilyPalette,
  FamilyRadius,
  FamilySpacing,
  FamilyTypography,
} from '@/constants/familyTheme';

interface ToastProps {
  message: string;
  visible: boolean;
  onHide: () => void;
  duration?: number;
}

export function Toast({ message, visible, onHide, duration = 2800 }: ToastProps) {
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(onHide, duration);
    return () => clearTimeout(timer);
  }, [visible, onHide, duration]);

  if (!visible) return null;

  return (
    <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(180)} style={styles.wrap}>
      <View style={styles.toast}>
        <Text style={styles.text}>{message}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: 48,
    left: FamilySpacing.lg,
    right: FamilySpacing.lg,
    alignItems: 'center',
    zIndex: 100,
    pointerEvents: 'none',
  },
  toast: {
    paddingVertical: FamilySpacing.md,
    paddingHorizontal: FamilySpacing.xl,
    borderRadius: FamilyRadius.pill,
    backgroundColor: FamilyPalette.charcoal,
    borderWidth: 1,
    borderColor: FamilyPalette.champagne,
    maxWidth: 360,
  },
  text: {
    ...FamilyTypography.body,
    fontSize: 14,
    color: FamilyPalette.softWhite,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
});
