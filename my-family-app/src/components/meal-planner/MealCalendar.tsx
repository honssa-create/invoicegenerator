import { Calendar, type DateData } from 'react-native-calendars';

import { FamilyPalette } from '@/constants/familyTheme';

interface MealCalendarProps {
  selectedDate: string;
  markedDates: Record<string, object>;
  onDayPress: (day: DateData) => void;
}

export function MealCalendar({ selectedDate, markedDates, onDayPress }: MealCalendarProps) {
  return (
    <Calendar
      current={selectedDate}
      onDayPress={onDayPress}
      markedDates={markedDates}
      theme={{
        backgroundColor: FamilyPalette.softWhite,
        calendarBackground: FamilyPalette.softWhite,
        textSectionTitleColor: FamilyPalette.charcoalMuted,
        selectedDayBackgroundColor: FamilyPalette.champagne,
        selectedDayTextColor: FamilyPalette.white,
        todayTextColor: FamilyPalette.champagne,
        dayTextColor: FamilyPalette.charcoal,
        textDisabledColor: FamilyPalette.border,
        dotColor: FamilyPalette.champagne,
        selectedDotColor: FamilyPalette.white,
        arrowColor: FamilyPalette.champagne,
        monthTextColor: FamilyPalette.charcoal,
        textDayFontWeight: '300',
        textMonthFontWeight: '300',
        textDayHeaderFontWeight: '400',
        textDayFontSize: 15,
        textMonthFontSize: 17,
        textDayHeaderFontSize: 12,
      }}
    />
  );
}
