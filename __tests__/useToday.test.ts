import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { useToday } from '@/lib/fits/useToday';

/** Every `change` listener the hook registered, called as the app would. */
function appStateChange(state: string) {
  const listeners = (AppState.addEventListener as jest.Mock).mock.calls
    .filter(([event]) => event === 'change')
    .map(([, listener]) => listener as (next: string) => void);
  return act(async () => listeners.forEach((listener) => listener(state)));
}

describe('useToday', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date(2026, 8, 26, 21, 0, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("starts on the device's local date", async () => {
    const { result } = await renderHook(() => useToday());

    expect(result.current.today).toBe('2026-09-26');
  });

  it('moves to the new day when the app returns to the foreground on a later day', async () => {
    const { result } = await renderHook(() => useToday());

    jest.setSystemTime(new Date(2026, 8, 27, 8, 0, 0));
    await appStateChange('active');

    expect(result.current.today).toBe('2026-09-27');
  });

  it('ignores the app going to the background', async () => {
    const { result } = await renderHook(() => useToday());

    jest.setSystemTime(new Date(2026, 8, 27, 8, 0, 0));
    await appStateChange('background');

    expect(result.current.today).toBe('2026-09-26');
  });

  it('keeps the same date, and the same render, on a same-day resume', async () => {
    let renders = 0;
    const { result } = await renderHook(() => {
      renders += 1;
      return useToday();
    });
    const before = renders;

    jest.setSystemTime(new Date(2026, 8, 26, 22, 0, 0));
    await appStateChange('active');

    expect(result.current.today).toBe('2026-09-26');
    expect(renders).toBe(before);
  });

  it('moves to the new day at local midnight while the app stays open', async () => {
    jest.setSystemTime(new Date(2026, 8, 26, 23, 59, 0));
    const { result } = await renderHook(() => useToday());

    await act(async () => jest.advanceTimersByTime(59_000));
    expect(result.current.today).toBe('2026-09-26');

    await act(async () => jest.advanceTimersByTime(1_000));
    expect(result.current.today).toBe('2026-09-27');
  });

  it('keeps following midnight, one day after the next', async () => {
    jest.setSystemTime(new Date(2026, 8, 26, 23, 0, 0));
    const { result } = await renderHook(() => useToday());

    await act(async () => jest.advanceTimersByTime(60 * 60 * 1000));
    expect(result.current.today).toBe('2026-09-27');

    await act(async () => jest.advanceTimersByTime(24 * 60 * 60 * 1000));
    expect(result.current.today).toBe('2026-09-28');
  });

  it('reschedules from the new day when a resume already moved it', async () => {
    const { result } = await renderHook(() => useToday());

    // Resumed the next evening: the old timer (set for the 27th's midnight) is replaced.
    jest.setSystemTime(new Date(2026, 8, 27, 23, 30, 0));
    await appStateChange('active');
    expect(result.current.today).toBe('2026-09-27');

    await act(async () => jest.advanceTimersByTime(30 * 60 * 1000));
    expect(result.current.today).toBe('2026-09-28');
  });

  it('follows a 25-hour day (daylight saving ends) to its real midnight', async () => {
    // Nov 1 2026 is 25 hours long in America/Los_Angeles (the suite's zone).
    jest.setSystemTime(new Date(2026, 10, 1, 0, 30, 0));
    const { result } = await renderHook(() => useToday());

    await act(async () => jest.advanceTimersByTime(24 * 60 * 60 * 1000));
    expect(result.current.today).toBe('2026-11-01');

    await act(async () => jest.advanceTimersByTime(30 * 60 * 1000));
    expect(result.current.today).toBe('2026-11-02');
  });

  it('re-reads the date on syncToday', async () => {
    const { result } = await renderHook(() => useToday());

    jest.setSystemTime(new Date(2026, 8, 27, 8, 0, 0));
    await act(async () => result.current.syncToday());

    expect(result.current.today).toBe('2026-09-27');
  });

  it('keeps syncToday stable across renders', async () => {
    const { result, rerender } = await renderHook(() => useToday());
    const first = result.current.syncToday;

    await rerender({});

    expect(result.current.syncToday).toBe(first);
  });

  it('removes its listener and clears its timer on unmount', async () => {
    const setTimeoutSpy = jest.spyOn(globalThis, 'setTimeout');
    const { unmount } = await renderHook(() => useToday());
    const subscription = (AppState.addEventListener as jest.Mock).mock.results.at(-1)?.value as { remove: jest.Mock };
    // 21:00 -> midnight.
    const midnightCall = setTimeoutSpy.mock.calls.findIndex((call) => call[1] === 3 * 60 * 60 * 1000);
    const midnightTimer = setTimeoutSpy.mock.results[midnightCall].value;
    const clearTimeoutSpy = jest.spyOn(globalThis, 'clearTimeout');

    await unmount();

    expect(subscription.remove).toHaveBeenCalled();
    expect(clearTimeoutSpy).toHaveBeenCalledWith(midnightTimer);
    setTimeoutSpy.mockRestore();
    clearTimeoutSpy.mockRestore();
  });
});
