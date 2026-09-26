import { toLocalDate } from '@/lib/fits/localDate';

/**
 * Pure week math for the Planner. Every date in and out is a device-local
 * `YYYY-MM-DD` string (see `toLocalDate`), and arithmetic goes through
 * `Date`'s own calendar fields (`setDate`) rather than adding milliseconds,
 * so a 23- or 25-hour daylight-saving day still counts as one day.
 *
 * Labels are fixed English, not `Intl`, so they match the approved copy
 * ("Sep 22 – 28", "Thursday, Sep 25") exactly on every device.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Indexed Monday-first (see `mondayIndex`).
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export type WeekDay = {
  date: string;
  /** "Mon" -- the row caption, unless the day is today. */
  dow: string;
  dayOfMonth: number;
  /** "Thursday" -- for "Remove from Thursday". */
  weekday: string;
  /** "Thursday, Sep 25" -- the sheet title and row label. */
  long: string;
  isToday: boolean;
  isPast: boolean;
};

/** Local midnight -- `new Date('2026-09-25')` would parse as UTC midnight instead. */
function parseLocalDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** JS weeks start on Sunday (`getDay() === 0`); the Planner's start on Monday. */
function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export function addDays(date: string, days: number): string {
  const next = parseLocalDate(date);
  next.setDate(next.getDate() + days);
  return toLocalDate(next);
}

/** The Monday on or before `date`; a Sunday belongs to the week before it. */
export function weekStartOf(date: string): string {
  return addDays(date, -mondayIndex(parseLocalDate(date)));
}

export function shiftWeek(weekStart: string, weeks: number): string {
  return addDays(weekStart, weeks * 7);
}

/** Whole days from `from` to `to`, negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  // UTC midnights have no DST gaps, so the difference is always whole days.
  const utc = (date: string) => {
    const [year, month, day] = date.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

/** "Sep 22 – 28", or "Sep 29 – Oct 5" when the week crosses into the next month. */
export function weekRangeLabel(weekStart: string): string {
  const start = parseLocalDate(weekStart);
  const end = parseLocalDate(addDays(weekStart, 6));
  const startLabel = `${MONTHS[start.getMonth()]} ${start.getDate()}`;
  const endLabel = end.getMonth() === start.getMonth() ? `${end.getDate()}` : `${MONTHS[end.getMonth()]} ${end.getDate()}`;
  return `${startLabel} – ${endLabel}`;
}

export function weekDays(weekStart: string, today: string): WeekDay[] {
  return WEEKDAYS.map((weekday, index) => {
    const date = addDays(weekStart, index);
    const parsed = parseLocalDate(date);
    // `YYYY-MM-DD` strings compare correctly as plain strings.
    return {
      date,
      dow: weekday.slice(0, 3),
      dayOfMonth: parsed.getDate(),
      weekday,
      long: `${weekday}, ${MONTHS[parsed.getMonth()]} ${parsed.getDate()}`,
      isToday: date === today,
      isPast: date < today,
    };
  });
}
