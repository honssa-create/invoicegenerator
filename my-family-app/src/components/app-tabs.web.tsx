import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import { Pressable, View, StyleSheet } from 'react-native';

import { ThemedText } from './themed-text';

import {
  BottomTabInset,
  FamilyPalette,
  FamilyRadius,
  FamilySpacing,
  MaxContentWidth,
} from '@/constants/familyTheme';

export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="members" href="/" asChild>
            <TabButton>Members</TabButton>
          </TabTrigger>
          <TabTrigger name="dishes" href="/dishes" asChild>
            <TabButton>Dishes</TabButton>
          </TabTrigger>
          <TabTrigger name="planner" href="/meal-planner" asChild>
            <TabButton>Planner</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

export function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  return (
    <Pressable {...props} style={({ pressed }) => pressed && styles.pressed}>
      <View style={[styles.tabButtonView, isFocused && styles.tabButtonFocused]}>
        <ThemedText
          type="small"
          style={[styles.tabLabel, isFocused && styles.tabLabelFocused]}>
          {children}
        </ThemedText>
      </View>
    </Pressable>
  );
}

export function CustomTabList(props: TabListProps) {
  return (
    <View {...props} style={styles.tabListContainer}>
      <View style={styles.innerContainer}>{props.children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabListContainer: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    paddingHorizontal: FamilySpacing.lg,
    paddingBottom: FamilySpacing.md,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  innerContainer: {
    paddingVertical: FamilySpacing.sm,
    paddingHorizontal: FamilySpacing.sm,
    borderRadius: FamilyRadius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: FamilySpacing.xs,
    width: '100%',
    maxWidth: MaxContentWidth,
    backgroundColor: FamilyPalette.softWhite,
    borderWidth: 1,
    borderColor: FamilyPalette.border,
    shadowColor: FamilyPalette.charcoal,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    marginBottom: BottomTabInset - FamilySpacing.xl,
  },
  pressed: {
    opacity: 0.7,
  },
  tabButtonView: {
    flex: 1,
    paddingVertical: FamilySpacing.sm + 2,
    paddingHorizontal: FamilySpacing.sm,
    borderRadius: FamilyRadius.md,
    alignItems: 'center',
  },
  tabButtonFocused: {
    backgroundColor: FamilyPalette.champagneLight,
  },
  tabLabel: {
    color: FamilyPalette.charcoalMuted,
    fontSize: 13,
  },
  tabLabelFocused: {
    color: FamilyPalette.charcoal,
    fontWeight: '500',
  },
});
