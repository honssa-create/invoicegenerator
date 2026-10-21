export function toDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDisplayDate(dateString: string): string {
  const date = new Date(`${dateString}T12:00:00`);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function shiftDate(dateString: string, days: number): string {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + days);
  return toDateString(date);
}

export function isToday(dateString: string): boolean {
  return dateString === toDateString();
}

export function isTomorrow(dateString: string): boolean {
  return dateString === shiftDate(toDateString(), 1);
}

export const SCHEDULE_MAX_DAYS = 14;

export function maxScheduleDate(from: Date = new Date()): string {
  return shiftDate(toDateString(from), SCHEDULE_MAX_DAYS);
}

export function isWithinScheduleWindow(dateString: string, from: Date = new Date()): boolean {
  const today = toDateString(from);
  const max = maxScheduleDate(from);
  return dateString >= today && dateString <= max;
}
