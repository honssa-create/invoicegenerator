import { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BottomTabInset,
  FamilyPalette,
  FamilySpacing,
  MaxContentWidth,
} from '@/constants/familyTheme';

interface ScreenContainerProps {
  children: ReactNode;
  scrollable?: boolean;
  contentStyle?: ViewStyle;
}

export function ScreenContainer({
  children,
  scrollable = true,
  contentStyle,
}: ScreenContainerProps) {
  const content = (
    <View style={[styles.content, contentStyle]}>
      {children}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {scrollable ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: FamilyPalette.cream,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: BottomTabInset + FamilySpacing.lg,
  },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: FamilySpacing.lg,
    paddingTop: FamilySpacing.xl,
  },
});
