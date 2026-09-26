import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
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
import { PlanDaySheet } from '@/components/planner/PlanDaySheet';
import { useSession } from '@/lib/auth/useSession';
import { useFits, type FitRow } from '@/lib/fits/listFits';
import { todayLocalDate } from '@/lib/fits/localDate';
import { isOffline, NO_CONNECTION_MESSAGE, UNKNOWN_ERROR_MESSAGE } from '@/lib/fits/errors';
import { usePlannedFits, useWeekWears } from '@/lib/planner/plannedFits';
import { usePlanDayWrites } from '@/lib/planner/usePlanDayWrites';
import { shiftWeek, weekDays, weekRangeLabel, weekStartOf } from '@/lib/planner/week';
import { useThumbnailUrls } from '@/lib/wardrobe/thumbnailUrls';
import { useTabBarClearance } from '@/lib/theme/tabBar';
import { colors } from '@/lib/theme/colors';
import { Sentry } from '@/lib/observability/sentry';

const ITALIC_SERIF = 'Newsreader_400Regular_Italic';
const WEEK_BUTTON_SIZE = 44;

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
  // When the day rolls over into a new week while the user was looking at
  // the current one, follow it -- adjusted during render (React's "storing
  // information from previous renders" pattern, same as `fits.tsx`'s ack).
  // A week the user paged to on purpose stays put.
  const [seenToday, setSeenToday] = useState(today);
  if (today !== seenToday) {
    setSeenToday(today);
    if (weekStart === weekStartOf(seenToday)) {
      setWeekStart(weekStartOf(today));
    }
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

  // Same reasoning as `fits.tsx`: tabs stay mounted, so a plan made on
  // another device (or a Fit worn from Fit detail) only shows up if every
  // read refetches when the tab regains focus.
  useFocusEffect(
    useCallback(() => {
      setToday(todayLocalDate());
      fitsQuery.refetch();
      plansQuery.refetch();
      wearsQuery.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch is stable; re-running per focus, not per identity change.
    }, []),
  );

  const fitsError = fitsQuery.isError ? fitsQuery.error : null;
  const plansError = plansQuery.isError ? plansQuery.error : null;
  useEffect(() => {
    for (const error of [fitsError, plansError]) {
      if (error && !isOffline(error)) {
        Sentry.captureException(error);
      }
    }
  }, [fitsError, plansError]);
  // React Query keeps the last good data through a failed refetch (a flaky
  // focus refetch, or the one after a write) while still reporting an
  // error -- only a read with nothing to show replaces the week.
  const readError = fitsError && !fitsQuery.data ? fitsError : plansError && !plansQuery.data ? plansError : null;

  // Fails open, same as `fits.tsx`'s wear counts: a failed wears read just
  // means no "Worn" captions, never a blocked week.
  const wearsError = wearsQuery.isError ? wearsQuery.error : null;
  useEffect(() => {
    if (wearsError && !isOffline(wearsError)) {
      Sentry.captureException(wearsError);
    }
  }, [wearsError]);

  const fits = useMemo(() => fitsQuery.data ?? [], [fitsQuery.data]);
  const fitsById = useMemo(() => new Map(fits.map((fit) => [fit.id, fit])), [fits]);
  // Joined against the live Fits list, so a plan whose Fit was deleted reads as empty.
  const planByDate = useMemo(() => {
    const map = new Map<string, FitRow>();
    for (const plan of plansQuery.data ?? []) {
      const fit = fitsById.get(plan.fit_id);
      if (fit) {
        map.set(plan.planned_on, fit);
      }
    }
    return map;
  }, [plansQuery.data, fitsById]);

  const coverPaths = useMemo(() => fits.flatMap((fit) => (fit.cover_path ? [fit.cover_path] : [])), [fits]);
  const { data: thumbnailUrls } = useThumbnailUrls(coverPaths);

  const { sheetDate, sheetFit, busy, writeError, openDay, closeSheet, pickFit, removeFit } = usePlanDayWrites({
    userId,
    today,
    planByDate,
  });
  const sheetDay = days.find((day) => day.date === sheetDate) ?? null;

  const header = (
    <View style={{ paddingTop: insets.top + 12 }} className="flex-row items-end justify-between gap-3 px-gutter">
      <View className="shrink gap-1.5">
        <Text variant="caption" className="text-ink-secondary dark:text-ink-secondaryDark">
          {weekRangeLabel(weekStart)}
        </Text>
        <Text accessibilityRole="header" variant="display" className="text-ink-primary dark:text-ink-primaryDark">
          Planner
        </Text>
      </View>
      <View className="flex-row gap-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous week"
          onPress={() => setWeekStart((current) => shiftWeek(current, -1))}
          style={{ width: WEEK_BUTTON_SIZE, height: WEEK_BUTTON_SIZE }}
          className="items-center justify-center rounded-sm border border-border-hairline active:opacity-60 dark:border-border-hairlineDark"
        >
          <ChevronLeftIcon size={18} color={palette.inkPrimary} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next week"
          onPress={() => setWeekStart((current) => shiftWeek(current, 1))}
          style={{ width: WEEK_BUTTON_SIZE, height: WEEK_BUTTON_SIZE }}
          className="items-center justify-center rounded-sm border border-border-hairline active:opacity-60 dark:border-border-hairlineDark"
        >
          <ChevronRightIcon size={18} color={palette.inkPrimary} />
        </Pressable>
      </View>
    </View>
  );

  function renderScreen(body: ReactNode) {
    return (
      <View className="flex-1 bg-surface-base dark:bg-surface-baseDark">
        {header}
        {body}
      </View>
    );
  }

  if (!userId || fitsQuery.isLoading || plansQuery.isLoading || wearsQuery.isLoading) {
    return renderScreen(<PlannerSkeleton />);
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
            plansQuery.refetch();
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
