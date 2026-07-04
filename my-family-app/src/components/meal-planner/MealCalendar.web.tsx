import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  FamilyPalette,
  FamilyRadius,
  FamilySpacing,
  FamilyTypography,
} from '@/constants/familyTheme';
import { formatDisplayDate } from '@/utils/date';

interface MealCalendarProps {
  selectedDate: string;
  markedDates: Record<string, object>;
  onDayPress: (day: { dateString: string }) => void;
}

function shiftDate(dateString: string, days: number) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function MealCalendar({ selectedDate, markedDates, onDayPress }: MealCalendarProps) {
  const hasMeals = Boolean(markedDates[selectedDate]);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable onPress={() => onDayPress({ dateString: shiftDate(selectedDate, -1) })}>
          <Text style={styles.arrow}>‹</Text>
        </Pressable>
        <Text style={styles.month}>{formatDisplayDate(selectedDate)}</Text>
        <Pressable onPress={() => onDayPress({ dateString: shiftDate(selectedDate, 1) })}>
          <Text style={styles.arrow}>›</Text>
        </Pressable>
      </View>
      {hasMeals ? <View style={styles.dot} /> : null}
      <Text style={styles.hint}>Use arrows to browse days with meal history.</Text>
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
