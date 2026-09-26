import { toLocalDate } from '@/lib/fits/localDate';
import { addDays, daysBetween, shiftWeek, weekDays, weekRangeLabel, weekStartOf } from '@/lib/planner/week';

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
