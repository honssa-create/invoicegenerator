import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ScreenContainer } from '@/components/common/ScreenContainer';
import { FormField, FormInput } from '@/components/common/FormField';
import { GoldButton } from '@/components/common/GoldButton';
import { DishCommentSection } from '@/components/dishes/DishCommentSection';
import { useAppContext } from '@/context/AppContext';
import {
  FamilyPalette,
  FamilyRadius,
  FamilySpacing,
  FamilyTypography,
} from '@/constants/familyTheme';
import { formatBudget, formatCookingTime } from '@/utils/budgetPlanner';
import { formatDisplayDate, toDateString } from '@/utils/date';
import type { FlatId } from '@/types';

export function DishDetailScreen() {
  const router = useRouter();
  const { id, date, flat } = useLocalSearchParams<{
    id: string;
    date?: string;
    flat?: string;
  }>();
  const {
    getDishById,
    updateDishBudget,
    getDishActivities,
    flatMealPlans,
  } = useAppContext();

  const dish = id ? getDishById(id) : undefined;
  const activityDate = date ?? toDateString();
  const flatId = (flat as FlatId) ?? dish?.flatId ?? '10J';
  const [budgetInput, setBudgetInput] = useState(
    dish ? String(dish.estimatedBudget) : '0',
  );

  if (!dish) {
    return (
      <ScreenContainer>
        <Text style={styles.empty}>Dish not found.</Text>
        <GoldButton label="Go Back" onPress={() => router.back()} />
      </ScreenContainer>
    );
  }

  const activities = getDishActivities(dish.id);
  const isPlannedForDate = (flatMealPlans[flatId]?.[activityDate] ?? []).includes(dish.id);

  const handleSaveBudget = () => {
    const value = Number(budgetInput);
    if (!Number.isNaN(value) && value > 0) {
      updateDishBudget(dish.id, value);
    }
  };

  return (
    <ScreenContainer>
      <Pressable onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>

      <Image source={{ uri: dish.imageUri }} style={styles.hero} contentFit="cover" />

      <View style={styles.header}>
        <Text style={styles.label}>{dish.category} · {flatId}</Text>
        <Text style={styles.title}>{dish.name}</Text>
      </View>

      <View style={styles.metaRow}>
        <View style={styles.metaCard}>
          <Text style={styles.metaLabel}>Cooking Time</Text>
          <Text style={styles.metaValue}>{formatCookingTime(dish.cookingTimeMinutes)}</Text>
        </View>
        <View style={styles.metaCard}>
          <Text style={styles.metaLabel}>Est. Budget</Text>
          <Text style={styles.metaValue}>{formatBudget(dish.estimatedBudget)}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Set Budget</Text>
        <FormField label="Estimated Budget ($)">
          <FormInput
            value={budgetInput}
            onChangeText={setBudgetInput}
            keyboardType="numeric"
          />
        </FormField>
        <GoldButton label="Update Budget" onPress={handleSaveBudget} variant="outline" />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Ingredients</Text>
        {dish.ingredients.map((item) => (
          <Text key={item} style={styles.bullet}>
            · {item}
          </Text>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recipe</Text>
        <Text style={styles.recipe}>{dish.recipe}</Text>
      </View>

      {dish.youtubeUrl ? (
        <Pressable
          onPress={() => Linking.openURL(dish.youtubeUrl!)}
          style={styles.youtube}>
          <Text style={styles.youtubeText}>Watch on YouTube</Text>
        </Pressable>
      ) : null}

      {isPlannedForDate ? (
        <DishCommentSection dishId={dish.id} date={activityDate} flatId={flatId} />
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Activity Log</Text>
        <Text style={styles.logHint}>For helpers — dates and notes per dish.</Text>
        {activities.length > 0 ? (
          activities.map((item) => (
            <View key={item.id} style={styles.logItem}>
              <Text style={styles.logDate}>{formatDisplayDate(item.date)}</Text>
              <Text style={styles.logMessage}>{item.message}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.empty}>No activity recorded yet.</Text>
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  back: {
    marginBottom: FamilySpacing.md,
  },
  backText: {
    ...FamilyTypography.caption,
    color: FamilyPalette.champagne,
  },
  hero: {
    width: '100%',
    height: 220,
    borderRadius: FamilyRadius.lg,
    marginBottom: FamilySpacing.lg,
    backgroundColor: FamilyPalette.champagneLight,
  },
  header: {
    gap: FamilySpacing.xs,
    marginBottom: FamilySpacing.lg,
  },
  label: {
    ...FamilyTypography.label,
    textTransform: 'capitalize',
  },
  title: {
    ...FamilyTypography.title,
    fontSize: 26,
  },
  metaRow: {
    flexDirection: 'row',
    gap: FamilySpacing.md,
    marginBottom: FamilySpacing.xl,
  },
  metaCard: {
    flex: 1,
    padding: FamilySpacing.md,
    borderRadius: FamilyRadius.md,
    backgroundColor: FamilyPalette.softWhite,
    borderWidth: 1,
    borderColor: FamilyPalette.border,
    gap: FamilySpacing.xs,
  },
  metaLabel: {
    ...FamilyTypography.caption,
  },
  metaValue: {
    ...FamilyTypography.heading,
    fontSize: 18,
  },
  section: {
    marginBottom: FamilySpacing.xl,
    gap: FamilySpacing.sm,
  },
  sectionTitle: {
    ...FamilyTypography.heading,
    fontSize: 17,
  },
  bullet: {
    ...FamilyTypography.body,
    fontSize: 15,
    textTransform: 'capitalize',
  },
  recipe: {
    ...FamilyTypography.body,
    lineHeight: 24,
  },
  youtube: {
    alignSelf: 'flex-start',
    marginBottom: FamilySpacing.lg,
    paddingVertical: FamilySpacing.sm,
    paddingHorizontal: FamilySpacing.md,
    borderRadius: FamilyRadius.sm,
    borderWidth: 1,
    borderColor: FamilyPalette.champagne,
  },
  youtubeText: {
    color: FamilyPalette.champagne,
    letterSpacing: 0.3,
  },
  logHint: {
    ...FamilyTypography.caption,
    fontStyle: 'italic',
    marginBottom: FamilySpacing.sm,
  },
  logItem: {
    paddingVertical: FamilySpacing.md,
    borderBottomWidth: 1,
    borderBottomColor: FamilyPalette.border,
    gap: FamilySpacing.xs,
  },
  logDate: {
    ...FamilyTypography.label,
    color: FamilyPalette.charcoalMuted,
  },
  logMessage: {
    ...FamilyTypography.body,
    fontSize: 15,
  },
  empty: {
    ...FamilyTypography.caption,
    fontStyle: 'italic',
    color: FamilyPalette.charcoalMuted,
  },
});
