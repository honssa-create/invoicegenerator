import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppModal } from '@/components/common/AppModal';
import { GoldButton } from '@/components/common/GoldButton';
import { MealCalendar } from '@/components/meal-planner/MealCalendar';
import {
  FamilyPalette,
  FamilyRadius,
  FamilySpacing,
  FamilyTypography,
} from '@/constants/familyTheme';
import { formatDisplayDate, shiftDate, toDateString } from '@/utils/date';

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
  const [selectedDate, setSelectedDate] = useState(today);

  const handleConfirm = () => {
    onSchedule(selectedDate);
    onClose();
  };

  const quickPick = (date: string) => {
    setSelectedDate(date);
  };

  return (
    <AppModal visible={visible} title="Schedule Dish" onClose={onClose}>
      <Text style={styles.dishName}>{dishName}</Text>
      <Text style={styles.hint}>Choose when this dish will be served.</Text>

      <View style={styles.quickRow}>
        <GoldButton
          label="Today"
          onPress={() => quickPick(today)}
          variant={selectedDate === today ? 'filled' : 'outline'}
        />
        <GoldButton
          label="Tomorrow"
          onPress={() => quickPick(tomorrow)}
          variant={selectedDate === tomorrow ? 'filled' : 'outline'}
        />
      </View>

      <View style={styles.calendarWrap}>
        <MealCalendar
          selectedDate={selectedDate}
          markedDates={{
            [selectedDate]: {
              selected: true,
              selectedColor: FamilyPalette.champagne,
            },
          }}
          onDayPress={(day) => setSelectedDate(day.dateString)}
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
