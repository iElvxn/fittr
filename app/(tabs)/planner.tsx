import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Pressable, ScrollView, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';

import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { ChevronLeftIcon } from '@/components/ui/icons/ChevronLeftIcon';
import { ChevronRightIcon } from '@/components/ui/icons/ChevronRightIcon';
import { ConnectionErrorNotice } from '@/components/ConnectionErrorNotice';
import { PlannerDayRow } from '@/components/planner/PlannerDayRow';
import { PlannerSkeleton } from '@/components/planner/PlannerSkeleton';
import { PlannerMonthGrid, MonthWeekdayHeader, type MonthDayFit } from '@/components/planner/PlannerMonthGrid';
import { PlannerMonthSkeleton } from '@/components/planner/PlannerMonthSkeleton';
import { PlannerViewChips } from '@/components/planner/PlannerViewChips';
import { PlanDaySheet } from '@/components/planner/PlanDaySheet';
import { useSession } from '@/lib/auth/useSession';
import { useFits, type FitRow } from '@/lib/fits/listFits';
import { todayLocalDate } from '@/lib/fits/localDate';
import { isOffline, NO_CONNECTION_MESSAGE, UNKNOWN_ERROR_MESSAGE } from '@/lib/fits/errors';
import {
  type PlannedFitRow,
  useMonthWears,
  usePlannedFits,
  usePlannedMonth,
  useWeekWears,
} from '@/lib/planner/plannedFits';
import { usePlanDayWrites } from '@/lib/planner/usePlanDayWrites';
import { loadPlannerView, savePlannerView, type PlannerView } from '@/lib/planner/viewPreference';
import {
  dayOf,
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
import { useThumbnailUrls } from '@/lib/wardrobe/thumbnailUrls';
import { useTabBarClearance } from '@/lib/theme/tabBar';
import { colors } from '@/lib/theme/colors';
import { Sentry } from '@/lib/observability/sentry';

const ITALIC_SERIF = 'Newsreader_400Regular_Italic';
const WEEK_BUTTON_SIZE = 44;

/** Plans joined against the live Fits list, so a plan whose Fit was deleted reads as empty. */
function joinPlans(plans: PlannedFitRow[] | undefined, fitsById: Map<string, FitRow>) {
  const map = new Map<string, FitRow>();
  for (const plan of plans ?? []) {
    const fit = fitsById.get(plan.fit_id);
    if (fit) {
      map.set(plan.planned_on, fit);
    }
  }
  return map;
}

export default function Planner() {
  const insets = useSafeAreaInsets();
  const tabBarClearance = useTabBarClearance();
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;
  const { session } = useSession();
  const userId = session?.user.id;

  // Tabs stay mounted, and a backgrounded app can resume on a later day, so
  // "today" is re-read on focus and on returning to the foreground rather
  // than fixed at mount.
  const [today, setToday] = useState(todayLocalDate);
  const [weekStart, setWeekStart] = useState(() => weekStartOf(today));
  const [monthStart, setMonthStart] = useState(() => monthStartOf(today));
  // When the day rolls over into a new week (or month) while the user was
  // looking at the current one, follow it -- adjusted during render (React's
  // "storing information from previous renders" pattern, same as
  // `fits.tsx`'s ack). A week or month the user paged to on purpose stays put.
  const [seenToday, setSeenToday] = useState(today);
  if (today !== seenToday) {
    setSeenToday(today);
    if (weekStart === weekStartOf(seenToday)) {
      setWeekStart(weekStartOf(today));
    }
    if (monthStart === monthStartOf(seenToday)) {
      setMonthStart(monthStartOf(today));
    }
  }

  // Story 5.3: the last-used view is remembered on the device. `null` until
  // it's read, so the skeleton shows rather than Week flashing before Month.
  const [view, setView] = useState<PlannerView | null>(null);
  useEffect(() => {
    let active = true;
    void loadPlannerView().then((stored) => {
      if (active) {
        setView((current) => current ?? stored);
      }
    });
    return () => {
      active = false;
    };
  }, []);
  const isMonth = view === 'month';

  // Switching keeps the user near what's on screen: the month of the visible
  // week's Monday, or back to today's week (or the month's first week).
  function switchView(next: PlannerView) {
    if (next === view) {
      return;
    }
    if (next === 'month') {
      setMonthStart(monthStartOf(weekStart));
    } else {
      setWeekStart(weekStartForMonth(monthStart, today));
    }
    setView(next);
    void savePlannerView(next);
  }

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setToday(todayLocalDate());
      }
    });
    return () => subscription.remove();
  }, []);
  const days = useMemo(() => weekDays(weekStart, today), [weekStart, today]);

  const fitsQuery = useFits(userId);
  const plansQuery = usePlannedFits(userId, weekStart);
  const wearsQuery = useWeekWears(userId, weekStart);
  // The month reads only run while the month is showing.
  const monthPlansQuery = usePlannedMonth(userId, monthStart, isMonth);
  const monthWearsQuery = useMonthWears(userId, monthStart, isMonth);

  // Same reasoning as `fits.tsx`: tabs stay mounted, so a plan made on
  // another device (or a Fit worn from Fit detail) only shows up if every
  // read refetches when the tab regains focus. `refetch` ignores `enabled`,
  // so the month is refetched only while it's the view on screen.
  const isMonthRef = useRef(isMonth);
  useEffect(() => {
    isMonthRef.current = isMonth;
  }, [isMonth]);
  useFocusEffect(
    useCallback(() => {
      setToday(todayLocalDate());
      fitsQuery.refetch();
      plansQuery.refetch();
      wearsQuery.refetch();
      if (isMonthRef.current) {
        monthPlansQuery.refetch();
        monthWearsQuery.refetch();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch is stable; re-running per focus, not per identity change.
    }, []),
  );

  // Only the view on screen can block it or be reported.
  const activePlansQuery = isMonth ? monthPlansQuery : plansQuery;
  const activeWearsQuery = isMonth ? monthWearsQuery : wearsQuery;
  const fitsError = fitsQuery.isError ? fitsQuery.error : null;
  const plansError = activePlansQuery.isError ? activePlansQuery.error : null;
  useEffect(() => {
    for (const error of [fitsError, plansError]) {
      if (error && !isOffline(error)) {
        Sentry.captureException(error);
      }
    }
  }, [fitsError, plansError]);
  // React Query keeps the last good data through a failed refetch (a flaky
  // focus refetch, or the one after a write) while still reporting an
  // error -- only a read with nothing to show replaces the week or month.
  const readError = fitsError && !fitsQuery.data ? fitsError : plansError && !activePlansQuery.data ? plansError : null;

  // Fails open, same as `fits.tsx`'s wear counts: a failed wears read just
  // means no "Worn" captions or badges, never a blocked view.
  const wearsError = activeWearsQuery.isError ? activeWearsQuery.error : null;
  useEffect(() => {
    if (wearsError && !isOffline(wearsError)) {
      Sentry.captureException(wearsError);
    }
  }, [wearsError]);

  const fits = useMemo(() => fitsQuery.data ?? [], [fitsQuery.data]);
  const fitsById = useMemo(() => new Map(fits.map((fit) => [fit.id, fit])), [fits]);
  const weekPlanByDate = useMemo(() => joinPlans(plansQuery.data, fitsById), [plansQuery.data, fitsById]);
  const monthPlanByDate = useMemo(() => joinPlans(monthPlansQuery.data, fitsById), [monthPlansQuery.data, fitsById]);
  const planByDate = isMonth ? monthPlanByDate : weekPlanByDate;

  const weeks = useMemo(() => monthGrid(monthStart, today), [monthStart, today]);
  // Each month day shows its planned Fit, else a live Fit worn that day
  // (first in the Fits list's order), badged when that Fit was worn then.
  const monthDayFits = useMemo(() => {
    const wears = monthWearsQuery.data ?? new Set<string>();
    const map = new Map<string, MonthDayFit>();
    for (const day of weeks.flat()) {
      if (!day) {
        continue;
      }
      const fit = monthPlanByDate.get(day.date) ?? fits.find((candidate) => wears.has(`${candidate.id}|${day.date}`));
      if (fit) {
        map.set(day.date, { fit, worn: wears.has(`${fit.id}|${day.date}`) });
      }
    }
    return map;
  }, [weeks, monthPlanByDate, monthWearsQuery.data, fits]);

  const coverPaths = useMemo(() => fits.flatMap((fit) => (fit.cover_path ? [fit.cover_path] : [])), [fits]);
  const { data: thumbnailUrls } = useThumbnailUrls(coverPaths);

  const { sheetDate, sheetFit, busy, writeError, openDay, closeSheet, pickFit, removeFit } = usePlanDayWrites({
    userId,
    today,
    planByDate,
  });
  const sheetDay = sheetDate ? dayOf(sheetDate, today) : null;

  const header = (
    <View style={{ paddingTop: insets.top + 12 }} className="flex-row items-end justify-between gap-3 px-gutter">
      <View className="shrink gap-1.5">
        <Text variant="caption" className="text-ink-secondary dark:text-ink-secondaryDark">
          {isMonth ? monthLabel(monthStart) : weekRangeLabel(weekStart)}
        </Text>
        <Text accessibilityRole="header" variant="display" className="text-ink-primary dark:text-ink-primaryDark">
          Planner
        </Text>
      </View>
      <View className="flex-row gap-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isMonth ? 'Previous month' : 'Previous week'}
          onPress={() =>
            isMonth
              ? setMonthStart((current) => shiftMonth(current, -1))
              : setWeekStart((current) => shiftWeek(current, -1))
          }
          style={{ width: WEEK_BUTTON_SIZE, height: WEEK_BUTTON_SIZE }}
          className="items-center justify-center rounded-sm border border-border-hairline active:opacity-60 dark:border-border-hairlineDark"
        >
          <ChevronLeftIcon size={18} color={palette.inkPrimary} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isMonth ? 'Next month' : 'Next week'}
          onPress={() =>
            isMonth
              ? setMonthStart((current) => shiftMonth(current, 1))
              : setWeekStart((current) => shiftWeek(current, 1))
          }
          style={{ width: WEEK_BUTTON_SIZE, height: WEEK_BUTTON_SIZE }}
          className="items-center justify-center rounded-sm border border-border-hairline active:opacity-60 dark:border-border-hairlineDark"
        >
          <ChevronRightIcon size={18} color={palette.inkPrimary} />
        </Pressable>
      </View>
    </View>
  );

  // The switcher shows once the remembered view is known, except on the
  // no-Fits screen, where there is nothing to switch between.
  const showChips = view !== null && !(fitsQuery.data && fits.length === 0);

  function renderScreen(body: ReactNode) {
    return (
      <View className="flex-1 bg-surface-base dark:bg-surface-baseDark">
        {header}
        {showChips ? <PlannerViewChips selected={view} onSelect={switchView} /> : null}
        {body}
      </View>
    );
  }

  if (!userId || view === null || fitsQuery.isLoading || activePlansQuery.isLoading || activeWearsQuery.isLoading) {
    return renderScreen(
      isMonth ? (
        <View className="px-gutter pt-5">
          <MonthWeekdayHeader />
          <PlannerMonthSkeleton weeks={weeks.length} />
        </View>
      ) : (
        <PlannerSkeleton />
      ),
    );
  }

  if (readError) {
    return renderScreen(
      <View className="px-gutter pt-6">
        <View className="mb-6">
          <ConnectionErrorNotice message={isOffline(readError) ? NO_CONNECTION_MESSAGE : UNKNOWN_ERROR_MESSAGE} />
        </View>
        <Button
          title="Retry"
          variant="primary"
          onPress={() => {
            fitsQuery.refetch();
            activePlansQuery.refetch();
            activeWearsQuery.refetch();
          }}
        />
      </View>,
    );
  }

  if (fits.length === 0) {
    return renderScreen(
      <View className="items-start px-8 pt-24">
        <Text
          variant="title"
          style={{ fontFamily: ITALIC_SERIF }}
          className="mb-3 text-ink-primary dark:text-ink-primaryDark"
        >
          Nothing to plan yet.
        </Text>
        <Text variant="body" className="mb-6 text-ink-secondary dark:text-ink-secondaryDark">
          Save a Fit first, then give it a day. It&apos;ll be waiting on Home that morning.
        </Text>
        <Button title="Build a Fit" variant="primary" onPress={() => router.push('/new-fit')} />
      </View>,
    );
  }

  return renderScreen(
    <>
      {isMonth ? (
        <ScrollView
          contentContainerClassName="px-gutter pt-5"
          contentContainerStyle={{ paddingBottom: tabBarClearance }}
        >
          <MonthWeekdayHeader />
          <PlannerMonthGrid weeks={weeks} dayFits={monthDayFits} thumbnailUrls={thumbnailUrls} onOpenDay={openDay} />
        </ScrollView>
      ) : (
        <ScrollView
          testID="planner-week"
          contentContainerClassName="px-gutter pt-5"
          contentContainerStyle={{ paddingBottom: tabBarClearance }}
        >
          {days.map((day) => {
            const fit = planByDate.get(day.date) ?? null;
            const coverUrl = fit?.cover_path ? (thumbnailUrls?.[fit.cover_path] ?? null) : null;
            const meta = !fit
              ? ''
              : wearsQuery.data?.has(`${fit.id}|${day.date}`)
                ? 'Worn'
                : day.isToday
                  ? 'Planned for today'
                  : 'Planned';
            return (
              <PlannerDayRow
                key={day.date}
                day={day}
                fit={fit}
                coverUrl={coverUrl}
                meta={meta}
                onPress={() => openDay(day.date)}
              />
            );
          })}
        </ScrollView>
      )}
      <PlanDaySheet
        day={sheetDay}
        fits={fits}
        selectedFitId={sheetFit?.id ?? null}
        thumbnailUrls={thumbnailUrls}
        busy={busy}
        errorMessage={writeError}
        onPick={pickFit}
        onRemove={removeFit}
        onClose={closeSheet}
      />
    </>,
  );
}
