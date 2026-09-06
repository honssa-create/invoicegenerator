import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  FamilyPalette,
  FamilyRadius,
  FamilySpacing,
  FamilyTypography,
} from '@/constants/familyTheme';
import { formatDisplayDate, shiftDate } from '@/utils/date';

interface MealCalendarProps {
  selectedDate: string;
  markedDates: Record<string, object>;
  onDayPress: (day: { dateString: string }) => void;
  minDate?: string;
  maxDate?: string;
}

export function MealCalendar({
  selectedDate,
  markedDates,
  onDayPress,
  minDate,
  maxDate,
}: MealCalendarProps) {
  const hasMeals = Boolean(markedDates[selectedDate]);

  const canGoBack = !minDate || selectedDate > minDate;
  const canGoForward = !maxDate || selectedDate < maxDate;

  const step = (days: number) => {
    const next = shiftDate(selectedDate, days);
    if (minDate && next < minDate) return;
    if (maxDate && next > maxDate) return;
    onDayPress({ dateString: next });
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable onPress={() => canGoBack && step(-1)} disabled={!canGoBack}>
          <Text style={[styles.arrow, !canGoBack && styles.arrowDisabled]}>‹</Text>
        </Pressable>
        <Text style={styles.month}>{formatDisplayDate(selectedDate)}</Text>
        <Pressable onPress={() => canGoForward && step(1)} disabled={!canGoForward}>
          <Text style={[styles.arrow, !canGoForward && styles.arrowDisabled]}>›</Text>
        </Pressable>
      </View>
      {hasMeals ? <View style={styles.dot} /> : null}
      {maxDate ? (
        <Text style={styles.hint}>Schedule up to {formatDisplayDate(maxDate)}</Text>
      ) : (
        <Text style={styles.hint}>Use arrows to pick a date.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    padding: FamilySpacing.lg,
    alignItems: 'center',
    gap: FamilySpacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  arrow: {
    fontSize: 28,
    color: FamilyPalette.champagne,
    paddingHorizontal: FamilySpacing.md,
    fontWeight: '300',
  },
  arrowDisabled: {
    color: FamilyPalette.border,
  },
  month: {
    ...FamilyTypography.heading,
    fontSize: 17,
    flex: 1,
    textAlign: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: FamilyPalette.champagne,
  },
  hint: {
    ...FamilyTypography.caption,
    fontStyle: 'italic',
    textAlign: 'center',
  },
});
