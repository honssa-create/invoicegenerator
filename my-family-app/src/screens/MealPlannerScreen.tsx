import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ScreenContainer } from '@/components/common/ScreenContainer';
import { GoldButton } from '@/components/common/GoldButton';
import { MealCalendar } from '@/components/meal-planner/MealCalendar';
import { RandomPickModal } from '@/components/meal-planner/RandomPickModal';
import { useAppContext } from '@/context/AppContext';
import {
  FamilyPalette,
  FamilyRadius,
  FamilySpacing,
  FamilyTypography,
} from '@/constants/familyTheme';
import { formatDisplayDate, toDateString } from '@/utils/date';

export function MealPlannerScreen() {
  const { getDishesForDate, getDatesWithMeals, getRandomDish } = useAppContext();
  const [selectedDate, setSelectedDate] = useState(toDateString());
  const [randomDish, setRandomDish] = useState<ReturnType<typeof getRandomDish>>(null);
  const [randomVisible, setRandomVisible] = useState(false);

  const markedDates = useMemo(() => {
    const marks: Record<string, object> = {};

    for (const date of getDatesWithMeals()) {
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
  }, [getDatesWithMeals, selectedDate]);

  const mealsForDay = getDishesForDate(selectedDate);

  const handleDayPress = (day: { dateString: string }) => {
    setSelectedDate(day.dateString);
  };

  const handleRandomPick = () => {
    setRandomDish(getRandomDish());
    setRandomVisible(true);
  };

  return (
    <View style={styles.root}>
      <ScreenContainer>
        <View style={styles.header}>
          <Text style={styles.label}>Meal Planner</Text>
          <Text style={styles.title}>What We Ate</Text>
          <Text style={styles.subtitle}>
            A quiet record of meals shared together.
          </Text>
        </View>

        <GoldButton
          label="Random Pick"
          onPress={handleRandomPick}
          variant="outline"
        />

        <View style={styles.calendarWrap}>
          <MealCalendar
            selectedDate={selectedDate}
            markedDates={markedDates}
            onDayPress={handleDayPress}
          />
        </View>

        <View style={styles.timeline}>
          <Text style={styles.dateHeading}>{formatDisplayDate(selectedDate)}</Text>

          {mealsForDay.length > 0 ? (
            mealsForDay.map((dish) => (
              <View key={dish.id} style={styles.timelineItem}>
                <View style={styles.dot} />
                <View style={styles.timelineContent}>
                  <Text style={styles.dishName}>{dish.name}</Text>
                  <Text style={styles.dishMeta}>{dish.category}</Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.empty}>
              No meals tracked for this day.
            </Text>
          )}
        </View>
      </ScreenContainer>

      <RandomPickModal
        visible={randomVisible}
        dish={randomDish}
        onClose={() => setRandomVisible(false)}
        onPickAgain={() => setRandomDish(getRandomDish())}
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
  calendarWrap: {
    marginTop: FamilySpacing.lg,
    marginBottom: FamilySpacing.xl,
    borderRadius: FamilyRadius.lg,
    borderWidth: 1,
    borderColor: FamilyPalette.border,
    overflow: 'hidden',
    backgroundColor: FamilyPalette.softWhite,
  },
  timeline: {
    gap: FamilySpacing.md,
    paddingBottom: FamilySpacing.xl,
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
  empty: {
    ...FamilyTypography.caption,
    fontStyle: 'italic',
    color: FamilyPalette.charcoalMuted,
    paddingVertical: FamilySpacing.lg,
  },
});
