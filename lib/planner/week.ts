import { toLocalDate } from '@/lib/fits/localDate';

/**
 * Pure week and month math for the Planner. Every date in and out is a device-local
 * `YYYY-MM-DD` string (see `toLocalDate`), and arithmetic goes through
 * `Date`'s own calendar fields (`setDate`) rather than adding milliseconds,
 * so a 23- or 25-hour daylight-saving day still counts as one day.
 *
 * Labels are fixed English, not `Intl`, so they match the approved copy
 * ("Sep 22 – 28", "Thursday, Sep 25") exactly on every device.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
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

/** Any date as a `WeekDay` -- the month grid and its day sheet use it for dates outside a week list. */
export function dayOf(date: string, today: string): WeekDay {
  const parsed = parseLocalDate(date);
  const weekday = WEEKDAYS[mondayIndex(parsed)];
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
}

export function weekDays(weekStart: string, today: string): WeekDay[] {
  return WEEKDAYS.map((_, index) => dayOf(addDays(weekStart, index), today));
}

/** The first of the month `date` falls in. */
export function monthStartOf(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** The last day of the month starting at `monthStart`. */
export function monthEndOf(monthStart: string): string {
  return addDays(shiftMonth(monthStart, 1), -1);
}

export function shiftMonth(monthStart: string, months: number): string {
  const [year, month] = monthStart.split('-').map(Number);
  // Day 1 always exists, so `setMonth`-style overflow can't skip a month.
  return toLocalDate(new Date(year, month - 1 + months, 1));
}

/** "September 2026". */
export function monthLabel(monthStart: string): string {
  const parsed = parseLocalDate(monthStart);
  return `${MONTH_NAMES[parsed.getMonth()]} ${parsed.getFullYear()}`;
}

/**
 * The month as Monday-first weeks of seven, `null` for the days before the
 * 1st and after the last -- 4 to 6 weeks depending on where the month falls.
 */
export function monthGrid(monthStart: string, today: string): (WeekDay | null)[][] {
  const end = monthEndOf(monthStart);
  const weeks: (WeekDay | null)[][] = [];
  for (let weekStart = weekStartOf(monthStart); weekStart <= end; weekStart = shiftWeek(weekStart, 1)) {
    weeks.push(
      WEEKDAYS.map((_, index) => {
        const date = addDays(weekStart, index);
        return date < monthStart || date > end ? null : dayOf(date, today);
      }),
    );
  }
  return weeks;
}

/**
 * The week to show when leaving the month view: today's, if the month holds
 * today, otherwise the week containing the month's first day.
 */
export function weekStartForMonth(monthStart: string, today: string): string {
  return monthStartOf(today) === monthStart ? weekStartOf(today) : weekStartOf(monthStart);
}

/** Whether `value` is a real `YYYY-MM-DD` calendar date (so "2025-02-30" is not). */
export function isLocalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  return toLocalDate(parseLocalDate(value)) === value;
}

/** ", 2025" when `date` falls in a different year than `today`, else nothing. */
function yearSuffix(date: string, today: string): string {
  return date.slice(0, 4) === today.slice(0, 4) ? '' : `, ${date.slice(0, 4)}`;
}

/** "Sep 19", or "Aug 16, 2025" outside today's year -- Fit detail's wear-photo captions. */
export function shortDateLabel(date: string, today: string): string {
  const parsed = parseLocalDate(date);
  return `${MONTHS[parsed.getMonth()]} ${parsed.getDate()}${yearSuffix(date, today)}`;
}

/** "Saturday, Sep 19", or "Saturday, Aug 16, 2025" outside today's year. */
export function longDateLabel(date: string, today: string): string {
  return `${dayOf(date, today).long}${yearSuffix(date, today)}`;
}
