import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MEAL_CATEGORIES } from '@/constants/mealCategories';
import {
  FamilyPalette,
  FamilyRadius,
  FamilySpacing,
  FamilyTypography,
} from '@/constants/familyTheme';
import type { MealCategory } from '@/types';

interface CategoryFilterProps {
  selected: MealCategory;
  onSelect: (category: MealCategory) => void;
}

export function CategoryFilter({ selected, onSelect }: CategoryFilterProps) {
  return (
    <View style={styles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}>
        {MEAL_CATEGORIES.map((category) => {
          const isActive = selected === category.id;

          return (
            <Pressable
              key={category.id}
              onPress={() => onSelect(category.id)}
              style={({ pressed }) => [
                styles.chip,
                isActive && styles.chipActive,
                pressed && styles.chipPressed,
              ]}>
              <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                {category.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: FamilySpacing.xl,
  },
  scrollContent: {
    gap: FamilySpacing.sm,
    paddingRight: FamilySpacing.lg,
  },
  chip: {
    paddingHorizontal: FamilySpacing.md,
    paddingVertical: FamilySpacing.sm + 2,
    borderRadius: FamilyRadius.pill,
    backgroundColor: FamilyPalette.softWhite,
    borderWidth: 1,
    borderColor: FamilyPalette.border,
  },
  chipActive: {
    backgroundColor: FamilyPalette.champagneLight,
    borderColor: FamilyPalette.champagne,
  },
  chipPressed: {
    opacity: 0.85,
  },
  chipText: {
    ...FamilyTypography.caption,
    color: FamilyPalette.charcoalMuted,
  },
  chipTextActive: {
    color: FamilyPalette.charcoal,
    fontWeight: '500',
  },
});
