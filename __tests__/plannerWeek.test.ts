import { toLocalDate } from '@/lib/fits/localDate';
import {
  addDays,
  dayOf,
  daysBetween,
  monthEndOf,
  monthGrid,
  monthLabel,
  monthStartOf,
  shiftMonth,
  shiftWeek,
  weekDays,
  weekRangeLabel,
  weekStartForMonth,
  weekStartOf,
} from '@/lib/planner/week';

describe('toLocalDate', () => {
  it('formats the device-local calendar date, zero-padded', () => {
    expect(toLocalDate(new Date(2025, 0, 5, 23, 30))).toBe('2025-01-05');
  });
});

describe('weekStartOf', () => {
  it('returns the Monday on or before the date', () => {
    expect(weekStartOf('2025-09-24')).toBe('2025-09-22'); // Wednesday
    expect(weekStartOf('2025-09-22')).toBe('2025-09-22'); // Monday itself
  });

  it('treats Sunday as the last day of the week, not the first', () => {
    expect(weekStartOf('2025-09-28')).toBe('2025-09-22');
  });

  it('crosses month and year boundaries', () => {
    expect(weekStartOf('2025-10-02')).toBe('2025-09-29');
    expect(weekStartOf('2026-01-01')).toBe('2025-12-29');
  });
});

describe('addDays / shiftWeek / daysBetween', () => {
  it('adds calendar days across month ends', () => {
    expect(addDays('2025-09-28', 6)).toBe('2025-10-04');
    expect(addDays('2025-03-01', -1)).toBe('2025-02-28');
  });

  it('moves a week start forward and back by whole weeks', () => {
    expect(shiftWeek('2025-09-22', 1)).toBe('2025-09-29');
    expect(shiftWeek('2025-09-22', -1)).toBe('2025-09-15');
  });

  it('counts whole days from one date to another, negative for the past', () => {
    expect(daysBetween('2025-09-24', '2025-09-25')).toBe(1);
    expect(daysBetween('2025-09-24', '2025-09-22')).toBe(-2);
    expect(daysBetween('2025-09-24', '2025-09-24')).toBe(0);
  });

  it('is not thrown off by a daylight-saving change inside the span', () => {
    // US DST ends Nov 2 2025 -- a 25-hour day must still count as one. The
    // first line proves the run really is in a DST zone (`jest.config.js`
    // pins it), so this can't pass vacuously under UTC.
    expect(new Date(2025, 10, 3).getTime() - new Date(2025, 10, 1).getTime()).toBe(49 * 3600 * 1000);
    expect(daysBetween('2025-11-01', '2025-11-03')).toBe(2);
    expect(addDays('2025-11-01', 2)).toBe('2025-11-03');
  });
});

describe('weekRangeLabel', () => {
  it('names the month once when the week stays in one month', () => {
    expect(weekRangeLabel('2025-09-22')).toBe('Sep 22 – 28');
  });

  it('names both months when the week crosses into the next', () => {
    expect(weekRangeLabel('2025-09-29')).toBe('Sep 29 – Oct 5');
    expect(weekRangeLabel('2025-12-29')).toBe('Dec 29 – Jan 4');
  });
});

describe('weekDays', () => {
  it('lists Monday to Sunday with their labels', () => {
    const days = weekDays('2025-09-22', '2025-09-24');

    expect(days.map((d) => d.date)).toEqual([
      '2025-09-22',
      '2025-09-23',
      '2025-09-24',
      '2025-09-25',
      '2025-09-26',
      '2025-09-27',
      '2025-09-28',
    ]);
    expect(days.map((d) => d.dow)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(days[3]).toMatchObject({ dayOfMonth: 25, weekday: 'Thursday', long: 'Thursday, Sep 25' });
  });

  it('flags today and the days before it', () => {
    const days = weekDays('2025-09-22', '2025-09-24');

    expect(days.map((d) => d.isToday)).toEqual([false, false, true, false, false, false, false]);
    expect(days.map((d) => d.isPast)).toEqual([true, true, false, false, false, false, false]);
  });

  it('marks every day past in an earlier week and none in a later one', () => {
    expect(weekDays('2025-09-15', '2025-09-24').every((d) => d.isPast && !d.isToday)).toBe(true);
    expect(weekDays('2025-09-29', '2025-09-24').some((d) => d.isPast || d.isToday)).toBe(false);
  });
});

describe('dayOf', () => {
  it('describes any date the same way weekDays does', () => {
    expect(dayOf('2026-09-29', '2026-09-26')).toEqual(weekDays('2026-09-28', '2026-09-26')[1]);
    expect(dayOf('2026-09-29', '2026-09-26')).toMatchObject({
      dow: 'Tue',
      weekday: 'Tuesday',
      long: 'Tuesday, Sep 29',
      dayOfMonth: 29,
      isToday: false,
      isPast: false,
    });
  });

  it('flags today and past dates', () => {
    expect(dayOf('2026-09-26', '2026-09-26')).toMatchObject({ isToday: true, isPast: false });
    expect(dayOf('2026-09-01', '2026-09-26')).toMatchObject({ isToday: false, isPast: true });
  });
});

describe('monthStartOf / monthEndOf / shiftMonth / monthLabel', () => {
  it("finds a date's month and its last day", () => {
    expect(monthStartOf('2026-09-26')).toBe('2026-09-01');
    expect(monthEndOf('2026-09-01')).toBe('2026-09-30');
    expect(monthEndOf('2026-10-01')).toBe('2026-10-31');
  });

  it('knows February, including a leap year', () => {
    expect(monthEndOf('2026-02-01')).toBe('2026-02-28');
    expect(monthEndOf('2028-02-01')).toBe('2028-02-29');
  });

  it('moves by whole months across a year end', () => {
    expect(shiftMonth('2026-09-01', 1)).toBe('2026-10-01');
    expect(shiftMonth('2026-12-01', 1)).toBe('2027-01-01');
    expect(shiftMonth('2026-01-01', -1)).toBe('2025-12-01');
  });

  it('names the month and year in full', () => {
    expect(monthLabel('2026-09-01')).toBe('September 2026');
    expect(monthLabel('2027-01-01')).toBe('January 2027');
  });
});

describe('monthGrid', () => {
  it('lays the month out in Monday-first weeks, blank outside the month', () => {
    // Sep 1 2026 is a Tuesday; Sep 30 is a Wednesday.
    const weeks = monthGrid('2026-09-01', '2026-09-26');

    expect(weeks).toHaveLength(5);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks[0][0]).toBeNull();
    expect(weeks[0][1]).toMatchObject({ date: '2026-09-01', dayOfMonth: 1, dow: 'Tue' });
    expect(weeks[4].map((day) => day?.dayOfMonth ?? null)).toEqual([28, 29, 30, null, null, null, null]);
  });

  it('flags today and the days before it', () => {
    const days = monthGrid('2026-09-01', '2026-09-26').flat().filter((day) => day !== null);

    expect(days).toHaveLength(30);
    expect(days.filter((day) => day.isToday).map((day) => day.date)).toEqual(['2026-09-26']);
    expect(days.filter((day) => day.isPast)).toHaveLength(25);
  });

  it('has no leading blanks for a month starting on Monday', () => {
    // Jun 1 2026 is a Monday.
    expect(monthGrid('2026-06-01', '2026-09-26')[0][0]).toMatchObject({ date: '2026-06-01' });
  });

  it('spans six weeks when the month needs them', () => {
    // Aug 1 2026 is a Saturday, and August has 31 days.
    expect(monthGrid('2026-08-01', '2026-09-26')).toHaveLength(6);
  });

  it('fits a 28-day February that starts on Monday into four weeks', () => {
    // Feb 1 2027 is a Monday.
    expect(monthGrid('2027-02-01', '2026-09-26')).toHaveLength(4);
  });

  it('keeps every date across the autumn daylight-saving change', () => {
    // US clocks fall back on Nov 1 2026.
    const dates = monthGrid('2026-11-01', '2026-09-26').flat().flatMap((day) => (day ? [day.date] : []));

    expect(dates).toHaveLength(30);
    expect(dates.slice(0, 3)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03']);
    expect(new Set(dates).size).toBe(30);
  });
});

describe('weekStartForMonth', () => {
  it("returns today's week when the month contains today", () => {
    expect(weekStartForMonth('2026-09-01', '2026-09-26')).toBe('2026-09-21');
  });

  it("otherwise returns the week holding the month's first day", () => {
    // Oct 1 2026 is a Thursday.
    expect(weekStartForMonth('2026-10-01', '2026-09-26')).toBe('2026-09-28');
    expect(weekStartForMonth('2026-08-01', '2026-09-26')).toBe('2026-07-27');
  });
});
