import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { FamilyPalette } from '@/constants/familyTheme';

export default function AppTabs() {
  return (
    <NativeTabs
      backgroundColor={FamilyPalette.softWhite}
      indicatorColor={FamilyPalette.champagneLight}
      labelStyle={{ selected: { color: FamilyPalette.charcoal } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Profiles</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf="person.2.fill"
          md="group"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="meal-planner">
        <NativeTabs.Trigger.Label>Meal Planner</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf="fork.knife"
          md="restaurant"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
