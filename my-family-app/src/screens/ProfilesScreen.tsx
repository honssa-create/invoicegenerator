import { StyleSheet, Text, View } from 'react-native';

import { ScreenContainer } from '@/components/common/ScreenContainer';
import {
  FamilyPalette,
  FamilySpacing,
  FamilyTypography,
} from '@/constants/familyTheme';

export function ProfilesScreen() {
  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.label}>Profiles</Text>
        <Text style={styles.title}>Our Family</Text>
        <Text style={styles.subtitle}>
          Names, birthdays, and avatars — coming in the next step.
        </Text>
      </View>

      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>No profiles added yet</Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: FamilySpacing.xl,
    gap: FamilySpacing.sm,
  },
  label: {
    ...FamilyTypography.label,
  },
  title: {
    ...FamilyTypography.title,
  },
  subtitle: {
    ...FamilyTypography.body,
    marginTop: FamilySpacing.xs,
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: FamilySpacing.xxl,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: FamilyPalette.border,
    borderStyle: 'dashed',
    backgroundColor: FamilyPalette.softWhite,
  },
  placeholderText: {
    ...FamilyTypography.caption,
  },
});
