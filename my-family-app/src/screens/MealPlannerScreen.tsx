import { StyleSheet, Text, View } from 'react-native';

import { ScreenContainer } from '@/components/common/ScreenContainer';
import { CategoryFilter } from '@/components/meal-planner/CategoryFilter';
import { MealCard } from '@/components/meal-planner/MealCard';
import {
  FamilyPalette,
  FamilySpacing,
  FamilyTypography,
} from '@/constants/familyTheme';
import { useMealFilter } from '@/hooks/useMealFilter';

export function MealPlannerScreen() {
  const { selectedCategory, setSelectedCategory, filteredMeals, isHotpotView } =
    useMealFilter();

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.label}>Meal Planner</Text>
        <Text style={styles.title}>Tonight&apos;s Table</Text>
        <Text style={styles.subtitle}>
          Curate dishes for the family — calm, considered, delicious.
        </Text>
      </View>

      <CategoryFilter selected={selectedCategory} onSelect={setSelectedCategory} />

      {isHotpotView ? (
        <View style={styles.hotpotBanner}>
          <Text style={styles.hotpotBannerText}>
            Hotpot sets & builder coming next — browse existing dishes below.
          </Text>
        </View>
      ) : null}

      <View style={styles.list}>
        {filteredMeals.length > 0 ? (
          filteredMeals.map((meal) => <MealCard key={meal.id} meal={meal} />)
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No dishes yet</Text>
            <Text style={styles.emptyText}>
              Add a dish to start building your family menu.
            </Text>
          </View>
        )}
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
  hotpotBanner: {
    marginBottom: FamilySpacing.lg,
    padding: FamilySpacing.md,
    borderRadius: 12,
    backgroundColor: FamilyPalette.champagneLight,
    borderWidth: 1,
    borderColor: FamilyPalette.champagneMuted,
  },
  hotpotBannerText: {
    ...FamilyTypography.caption,
    color: FamilyPalette.charcoalSoft,
    textAlign: 'center',
  },
  list: {
    gap: FamilySpacing.md,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: FamilySpacing.xxl,
    gap: FamilySpacing.sm,
  },
  emptyTitle: {
    ...FamilyTypography.heading,
    fontSize: 18,
  },
  emptyText: {
    ...FamilyTypography.caption,
    textAlign: 'center',
  },
});
