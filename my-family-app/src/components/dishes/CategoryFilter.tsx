import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DISH_CATEGORIES } from '@/constants/mockData';
import {
  FamilyPalette,
  FamilyRadius,
  FamilySpacing,
  FamilyTypography,
} from '@/constants/familyTheme';
import type { DishCategoryFilter } from '@/types';

interface CategoryFilterProps {
  selected: DishCategoryFilter;
  onSelect: (category: DishCategoryFilter) => void;
}

export function CategoryFilter({ selected, onSelect }: CategoryFilterProps) {
  return (
    <View style={styles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}>
        {DISH_CATEGORIES.map((category) => {
          const isActive = selected === category.id;
          return (
            <Pressable
              key={category.id}
              onPress={() => onSelect(category.id)}
              style={[styles.chip, isActive && styles.chipActive]}>
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
    marginBottom: FamilySpacing.lg,
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
  chipText: {
    ...FamilyTypography.caption,
    color: FamilyPalette.charcoalMuted,
  },
  chipTextActive: {
    color: FamilyPalette.charcoal,
    fontWeight: '500',
  },
});

export function useDishFilter<T extends { category: string }>(items: T[]) {
  const [selectedCategory, setSelectedCategory] = useState<DishCategoryFilter>('all');

  const filteredItems = useMemo(() => {
    if (selectedCategory === 'all') return items;
    return items.filter((item) => item.category === selectedCategory);
  }, [items, selectedCategory]);

  return { selectedCategory, setSelectedCategory, filteredItems };
}
