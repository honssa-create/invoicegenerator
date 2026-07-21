import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ScreenContainer } from '@/components/common/ScreenContainer';
import { FlatSwitcher } from '@/components/common/FlatSwitcher';
import { GoldButton } from '@/components/common/GoldButton';
import { BudgetPlannerModal } from '@/components/meal-planner/BudgetPlannerModal';
import { MealCalendar } from '@/components/meal-planner/MealCalendar';
import { RandomPickModal } from '@/components/meal-planner/RandomPickModal';
import { useAppContext } from '@/context/AppContext';
import {
  FamilyPalette,
  FamilyRadius,
  FamilySpacing,
  FamilyTypography,
} from '@/constants/familyTheme';
import { formatBudget } from '@/utils/budgetPlanner';
import { formatDisplayDate, toDateString } from '@/utils/date';
import type { FlatId } from '@/types';

export function MealPlannerScreen() {
  const router = useRouter();
  const {
    flats,
    activeFlat,
    setActiveFlat,
    getFlatName,
    getDishesForDate,
    getDatesWithMeals,
    getOtherFlats,
    getRandomDish,
  } = useAppContext();
  const [selectedDate, setSelectedDate] = useState(toDateString());
  const [viewingFlat, setViewingFlat] = useState<FlatId>(activeFlat);
  const [randomDish, setRandomDish] = useState<ReturnType<typeof getRandomDish>>(null);
  const [randomVisible, setRandomVisible] = useState(false);
  const [budgetVisible, setBudgetVisible] = useState(false);

  useEffect(() => {
    setViewingFlat(activeFlat);
  }, [activeFlat]);

  const isReadOnly = viewingFlat !== activeFlat;
  const otherFlats = getOtherFlats(viewingFlat);

  const markedDates = useMemo(() => {
    const marks: Record<string, object> = {};

    for (const date of getDatesWithMeals(viewingFlat)) {
      marks[date] = { marked: true, dotColor: FamilyPalette.champagne };
    }

    marks[selectedDate] = {
      ...(marks[selectedDate] ?? {}),
      selected: true,
      selectedColor: FamilyPalette.champagne,
      marked: true,
      dotColor: FamilyPalette.champagne,
    };

    return marks;
  }, [getDatesWithMeals, viewingFlat, selectedDate]);

  const mealsForDay = getDishesForDate(selectedDate, viewingFlat);

  const handleRandomPick = () => {
    setRandomDish(getRandomDish(activeFlat));
    setRandomVisible(true);
  };

  const openDishDetail = (dishId: string, flatId: FlatId) => {
    router.push(`/dish/${dishId}?date=${selectedDate}&flat=${flatId}`);
  };

  return (
    <View style={styles.root}>
      <ScreenContainer>
        <View style={styles.header}>
          <Text style={styles.label}>Meal Planner</Text>
          <Text style={styles.title}>What We Ate</Text>
          <Text style={styles.subtitle}>
            Shared recipes from all flats — schedule any dish to your flat&apos;s plan.
          </Text>
        </View>

        <FlatSwitcher
          flats={flats}
          activeFlat={activeFlat}
          onChange={setActiveFlat}
          label="Your Flat (manage)"
        />

        <FlatSwitcher
          flats={flats}
          activeFlat={viewingFlat}
          onChange={setViewingFlat}
          label="Viewing Plan"
        />

        {isReadOnly ? (
          <Text style={styles.readOnly}>
            Viewing {getFlatName(viewingFlat)} — read only. Your flat: {getFlatName(activeFlat)}.
          </Text>
        ) : null}

        <View style={styles.actions}>
          <GoldButton
            label="Random Pick"
            onPress={handleRandomPick}
            variant="outline"
          />
          {!isReadOnly ? (
            <GoldButton
              label="Budget Planner"
              onPress={() => setBudgetVisible(true)}
              variant="outline"
            />
          ) : null}
        </View>

        <View style={styles.calendarWrap}>
          <MealCalendar
            selectedDate={selectedDate}
            markedDates={markedDates}
            onDayPress={(day) => setSelectedDate(day.dateString)}
          />
        </View>

        <View style={styles.timeline}>
          <Text style={styles.dateHeading}>
            {getFlatName(viewingFlat)} · {formatDisplayDate(selectedDate)}
          </Text>

          {mealsForDay.length > 0 ? (
            mealsForDay.map((dish) => (
              <Pressable
                key={dish.id}
                onPress={() => openDishDetail(dish.id, viewingFlat)}
                style={styles.timelineItem}>
                <View style={styles.dot} />
                <View style={styles.timelineContent}>
                  <Text style={styles.dishName}>{dish.name}</Text>
                  <Text style={styles.dishMeta}>
                    {dish.category} · {formatBudget(dish.estimatedBudget)}
                  </Text>
                  <Text style={styles.viewDetail}>View recipe & comments →</Text>
                </View>
              </Pressable>
            ))
          ) : (
            <Text style={styles.empty}>
              No meals tracked for this day.
            </Text>
          )}
        </View>

        {otherFlats.map((flat) => {
          const meals = getDishesForDate(selectedDate, flat.id);
          return (
            <View key={flat.id} style={styles.otherSection}>
              <Text style={styles.otherHeading}>
                {flat.name} is eating · {formatDisplayDate(selectedDate)}
              </Text>
              {meals.length > 0 ? (
                meals.map((dish) => (
                  <Pressable
                    key={`${flat.id}-${dish.id}`}
                    onPress={() => openDishDetail(dish.id, flat.id)}
                    style={styles.otherItem}>
                    <Text style={styles.otherName}>{dish.name}</Text>
                    <Text style={styles.otherMeta}>{formatBudget(dish.estimatedBudget)}</Text>
                  </Pressable>
                ))
              ) : (
                <Text style={styles.empty}>No meals tracked in {flat.name}.</Text>
              )}
            </View>
          );
        })}
      </ScreenContainer>

      <RandomPickModal
        visible={randomVisible}
        dish={randomDish}
        onClose={() => setRandomVisible(false)}
        onPickAgain={() => setRandomDish(getRandomDish(activeFlat))}
      />

      <BudgetPlannerModal
        visible={budgetVisible}
        onClose={() => setBudgetVisible(false)}
        selectedDate={selectedDate}
        flatId={activeFlat}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    marginBottom: FamilySpacing.lg,
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
    marginBottom: FamilySpacing.md,
  },
  readOnly: {
    ...FamilyTypography.caption,
    fontStyle: 'italic',
    color: FamilyPalette.charcoalMuted,
    marginBottom: FamilySpacing.md,
    textAlign: 'center',
  },
  actions: {
    gap: FamilySpacing.sm,
    marginBottom: FamilySpacing.md,
  },
  calendarWrap: {
    marginTop: FamilySpacing.sm,
    marginBottom: FamilySpacing.xl,
    borderRadius: FamilyRadius.lg,
    borderWidth: 1,
    borderColor: FamilyPalette.border,
    overflow: 'hidden',
    backgroundColor: FamilyPalette.softWhite,
  },
  timeline: {
    gap: FamilySpacing.md,
    paddingBottom: FamilySpacing.lg,
  },
  dateHeading: {
    ...FamilyTypography.heading,
    fontSize: 17,
    marginBottom: FamilySpacing.sm,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: FamilySpacing.md,
    paddingLeft: FamilySpacing.xs,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: FamilyPalette.champagne,
    marginTop: 6,
  },
  timelineContent: {
    flex: 1,
    paddingBottom: FamilySpacing.md,
    borderBottomWidth: 1,
    borderBottomColor: FamilyPalette.border,
  },
  dishName: {
    ...FamilyTypography.body,
    color: FamilyPalette.charcoal,
    fontSize: 16,
  },
  dishMeta: {
    ...FamilyTypography.caption,
    textTransform: 'capitalize',
    marginTop: 2,
  },
  viewDetail: {
    ...FamilyTypography.caption,
    color: FamilyPalette.champagne,
    marginTop: FamilySpacing.xs,
    fontStyle: 'italic',
  },
  otherSection: {
    marginTop: FamilySpacing.lg,
    paddingTop: FamilySpacing.lg,
    borderTopWidth: 1,
    borderTopColor: FamilyPalette.border,
    gap: FamilySpacing.sm,
    paddingBottom: FamilySpacing.md,
  },
  otherHeading: {
    ...FamilyTypography.label,
    color: FamilyPalette.charcoalMuted,
    marginBottom: FamilySpacing.sm,
  },
  otherItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: FamilySpacing.sm,
    paddingHorizontal: FamilySpacing.md,
    backgroundColor: FamilyPalette.cream,
    borderRadius: FamilyRadius.md,
    borderWidth: 1,
    borderColor: FamilyPalette.border,
  },
  otherName: {
    ...FamilyTypography.body,
    fontSize: 15,
    color: FamilyPalette.charcoalSoft,
  },
  otherMeta: {
    ...FamilyTypography.caption,
  },
  empty: {
    ...FamilyTypography.caption,
    fontStyle: 'italic',
    color: FamilyPalette.charcoalMuted,
    paddingVertical: FamilySpacing.lg,
  },
});
