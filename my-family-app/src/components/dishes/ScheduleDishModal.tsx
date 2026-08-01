import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { AppModal } from '@/components/common/AppModal';
import { GoldButton } from '@/components/common/GoldButton';
import { MealCalendar } from '@/components/meal-planner/MealCalendar';
import {
  FamilyPalette,
  FamilyRadius,
  FamilySpacing,
  FamilyTypography,
} from '@/constants/familyTheme';
import {
  formatDisplayDate,
  isWithinScheduleWindow,
  maxScheduleDate,
  SCHEDULE_MAX_DAYS,
  shiftDate,
  toDateString,
} from '@/utils/date';

interface ScheduleDishModalProps {
  visible: boolean;
  dishName: string;
  onClose: () => void;
  onSchedule: (date: string) => void;
}

export function ScheduleDishModal({
  visible,
  dishName,
  onClose,
  onSchedule,
}: ScheduleDishModalProps) {
  const today = toDateString();
  const tomorrow = shiftDate(today, 1);
  const maxDate = maxScheduleDate();
  const [selectedDate, setSelectedDate] = useState(today);

  const handleDayPress = (day: { dateString: string }) => {
    if (isWithinScheduleWindow(day.dateString)) {
      setSelectedDate(day.dateString);
    }
  };

  const handleConfirm = () => {
    if (!isWithinScheduleWindow(selectedDate)) {
      Alert.alert(
        'Date out of range',
        `You can only schedule up to ${SCHEDULE_MAX_DAYS} days ahead.`,
      );
      return;
    }
    onSchedule(selectedDate);
    onClose();
  };

  return (
    <AppModal visible={visible} title="Schedule Dish" onClose={onClose}>
      <Text style={styles.dishName}>{dishName}</Text>
      <Text style={styles.hint}>
        Pick today, tomorrow, or any date within the next {SCHEDULE_MAX_DAYS} days.
      </Text>

      <View style={styles.quickRow}>
        <GoldButton
          label="Today"
          onPress={() => setSelectedDate(today)}
          variant={selectedDate === today ? 'filled' : 'outline'}
        />
        <GoldButton
          label="Tomorrow"
          onPress={() => setSelectedDate(tomorrow)}
          variant={selectedDate === tomorrow ? 'filled' : 'outline'}
        />
      </View>

      <View style={styles.calendarWrap}>
        <MealCalendar
          selectedDate={selectedDate}
          minDate={today}
          maxDate={maxDate}
          markedDates={{
            [selectedDate]: {
              selected: true,
              selectedColor: FamilyPalette.champagne,
            },
          }}
          onDayPress={handleDayPress}
        />
      </View>

      <Text style={styles.selectedLabel}>
        Selected: {formatDisplayDate(selectedDate)}
      </Text>

      <GoldButton label="Add to Plan" onPress={handleConfirm} />
    </AppModal>
  );
}

const styles = StyleSheet.create({
  dishName: {
    ...FamilyTypography.heading,
    fontSize: 18,
    textAlign: 'center',
  },
  hint: {
    ...FamilyTypography.caption,
    textAlign: 'center',
    marginBottom: FamilySpacing.sm,
  },
  quickRow: {
    flexDirection: 'row',
    gap: FamilySpacing.sm,
  },
  calendarWrap: {
    borderRadius: FamilyRadius.lg,
    borderWidth: 1,
    borderColor: FamilyPalette.border,
    overflow: 'hidden',
    backgroundColor: FamilyPalette.softWhite,
  },
  selectedLabel: {
    ...FamilyTypography.caption,
    textAlign: 'center',
    color: FamilyPalette.champagne,
    fontStyle: 'italic',
  },
});
