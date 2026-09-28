import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

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
import { useToday } from '@/lib/fits/useToday';
import { isOffline, NO_CONNECTION_MESSAGE, UNKNOWN_ERROR_MESSAGE } from '@/lib/fits/errors';
import {
  type PlannedFitRow,
  type WearsInRange,
  useMonthWears,
  usePlannedFits,
  usePlannedMonth,
  useWeekWears,
} from '@/lib/planner/plannedFits';
import { usePlanDayWrites } from '@/lib/planner/usePlanDayWrites';
import { loadPlannerView, savePlannerView, type PlannerView } from '@/lib/planner/viewPreference';
import {
  dayOf,
  isLocalDate,
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
import { useWearPhotoUrls } from '@/lib/fits/wearPhoto';
import { wearKey, type WearRef } from '@/lib/fits/wearRef';
import { useWearPhotoActions } from '@/lib/fits/useWearPhotoActions';
import { useWornTodayToggle } from '@/lib/fits/useWornTodayToggle';
import { useFitWearCounts, useTodayWornFitIds } from '@/lib/fits/wornFitIds';
import { dayFitStatus, todayPlannedStatus } from '@/lib/fits/wearStatus';
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

/**
 * The Fit a day counts as worn, and its wear: the planned Fit if that was
 * worn, else (with nothing planned) the first live Fit worn that day. A
 * planned Fit that wasn't worn wins over a different Fit that was, same as
 * the month tiles, so that day has no photo section.
 */
function wornOnDay(
  date: string,
  plannedFit: FitRow | undefined,
  fits: FitRow[],
  wears: WearsInRange | undefined,
): { fit: FitRow; wear: WearRef } | null {
  if (!wears) {
    return null;
  }
  const candidates = plannedFit ? [plannedFit] : fits;
  for (const fit of candidates) {
    const wear = wears.byKey.get(wearKey(fit.id, date));
    if (wear) {
      return { fit, wear };
    }
  }
  return null;
}

export default function Planner() {
  const insets = useSafeAreaInsets();
  const tabBarClearance = useTabBarClearance();
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;
  const { session } = useSession();
  const userId = session?.user.id;

  // Tabs stay mounted, and a backgrounded app can resume on a later day, so
  // "today" follows the real day (resume, midnight) and is re-read on focus.
  const { today, syncToday } = useToday();
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

  const days = useMemo(() => weekDays(weekStart, today), [weekStart, today]);

  const fitsQuery = useFits(userId);
  const plansQuery = usePlannedFits(userId, weekStart);
  const wearsQuery = useWeekWears(userId, weekStart);
  // The month reads only run while the month is showing.
  const monthPlansQuery = usePlannedMonth(userId, monthStart, isMonth);
  const monthWearsQuery = useMonthWears(userId, monthStart, isMonth);
  // Story 5.6: the day sheet's header -- wear counts for its status, and
  // today's wears for the Mark worn toggle Home also uses. Both fail open.
  const countsQuery = useFitWearCounts(userId);
  const todayWornQuery = useTodayWornFitIds(userId, today);

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
      syncToday();
      fitsQuery.refetch();
      plansQuery.refetch();
      wearsQuery.refetch();
      countsQuery.refetch();
      todayWornQuery.refetch();
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
  const countsError = countsQuery.isError ? countsQuery.error : null;
  const todayWornError = todayWornQuery.isError ? todayWornQuery.error : null;
  // One effect per read, so a lasting error isn't reported again when another read's changes.
  useEffect(() => {
    if (wearsError && !isOffline(wearsError)) {
      Sentry.captureException(wearsError);
    }
  }, [wearsError]);
  useEffect(() => {
    if (countsError && !isOffline(countsError)) {
      Sentry.captureException(countsError);
    }
  }, [countsError]);
  useEffect(() => {
    if (todayWornError && !isOffline(todayWornError)) {
      Sentry.captureException(todayWornError);
    }
  }, [todayWornError]);

  const fits = useMemo(() => fitsQuery.data ?? [], [fitsQuery.data]);
  const fitsById = useMemo(() => new Map(fits.map((fit) => [fit.id, fit])), [fits]);
  const weekPlanByDate = useMemo(() => joinPlans(plansQuery.data, fitsById), [plansQuery.data, fitsById]);
  const monthPlanByDate = useMemo(() => joinPlans(monthPlansQuery.data, fitsById), [monthPlansQuery.data, fitsById]);
  const planByDate = isMonth ? monthPlanByDate : weekPlanByDate;

  const weeks = useMemo(() => monthGrid(monthStart, today), [monthStart, today]);
  // Each month day shows its planned Fit, else a live Fit worn that day
  // (first in the Fits list's order), badged when that Fit was worn then.
  const monthDayFits = useMemo(() => {
    const map = new Map<string, MonthDayFit>();
    for (const day of weeks.flat()) {
      if (!day) {
        continue;
      }
      const planned = monthPlanByDate.get(day.date);
      const worn = wornOnDay(day.date, planned, fits, monthWearsQuery.data);
      const fit = planned ?? worn?.fit;
      if (fit) {
        map.set(day.date, { fit, worn: Boolean(worn), photo: worn?.wear.photo ?? null });
      }
    }
    return map;
  }, [weeks, monthPlanByDate, monthWearsQuery.data, fits]);

  // Story 5.4: a week row shows only its planned Fit, so its photo is that
  // Fit's wear photo. (A day worn with nothing planned stays an empty row, as
  // before; its photo shows in the month and in the day's sheet.)
  const weekDayWears = useMemo(() => {
    const map = new Map<string, { fit: FitRow; wear: WearRef }>();
    for (const day of days) {
      const planned = weekPlanByDate.get(day.date);
      const worn = planned ? wornOnDay(day.date, planned, fits, wearsQuery.data) : null;
      if (worn) {
        map.set(day.date, worn);
      }
    }
    return map;
  }, [days, weekPlanByDate, fits, wearsQuery.data]);

  // Only the photos on screen are signed, and only their thumbnails; the
  // full photo is loaded by the day sheet alone.
  const photoThumbPaths = useMemo(() => {
    const photos = isMonth
      ? [...monthDayFits.values()].map((dayFit) => (dayFit.worn ? dayFit.photo : null))
      : [...weekDayWears.values()].map((worn) => worn.wear.photo);
    return photos.flatMap((photo) => (photo ? [photo.thumbPath] : []));
  }, [isMonth, monthDayFits, weekDayWears]);
  const { data: photoUrls } = useWearPhotoUrls(photoThumbPaths);

  const coverPaths = useMemo(() => fits.flatMap((fit) => (fit.cover_path ? [fit.cover_path] : [])), [fits]);
  const { data: thumbnailUrls } = useThumbnailUrls(coverPaths);

  const { sheetDate, sheetFit, busy, writeError, openDay, closeSheet, pickFit, removeFit } = usePlanDayWrites({
    userId,
    today,
    planByDate,
  });
  const sheetDay = sheetDate ? dayOf(sheetDate, today) : null;
  const sheetWornOnDay = sheetDate
    ? wornOnDay(sheetDate, planByDate.get(sheetDate), fits, isMonth ? monthWearsQuery.data : wearsQuery.data)
    : null;
  // Story 5.6: the sheet leads with the planned Fit, else the one worn that day.
  const sheetLead = sheetFit ?? sheetWornOnDay?.fit ?? null;
  const sheetIsToday = sheetDate === today;

  const photoActions = useWearPhotoActions(userId);
  // Mark worn exists only on today, for the Fit the sheet leads with.
  const toggleFit = sheetIsToday ? sheetLead : null;
  const toggleWear = toggleFit ? (todayWornQuery.data?.get(toggleFit.id) ?? null) : null;
  const wornToday = useWornTodayToggle({
    userId,
    fitId: toggleFit?.id ?? null,
    wear: toggleWear,
    source: 'planner',
    blocked: busy || photoActions.busy,
  });
  const sheetBusy = busy || photoActions.busy || wornToday.busy;
  // The toggle waits for today's wears; until they land (or if they fail)
  // the header offers no Mark worn rather than a wrong one.
  const hasTodayWorn = Boolean(todayWornQuery.data);
  // An undo takes the photo section away at once, as Home's card does.
  const sheetWorn = toggleFit && wornToday.override === false ? null : sheetWornOnDay;

  let sheetStatus = '';
  if (sheetLead && sheetDate) {
    if (!sheetFit) {
      // Worn with nothing planned, today included: plain "Worn".
      sheetStatus = toggleFit && wornToday.override === false ? '' : 'Worn';
    } else if (sheetIsToday && hasTodayWorn) {
      sheetStatus = todayPlannedStatus(
        countsQuery.data,
        sheetFit.id,
        wornToday.serverWornToday,
        wornToday.isWornToday,
      );
    } else {
      sheetStatus = dayFitStatus(Boolean(sheetWornOnDay), countsQuery.data?.get(sheetFit.id));
    }
  }

  function openSheet(date: string) {
    photoActions.clearError();
    wornToday.clearError();
    openDay(date);
  }

  function closeDaySheet() {
    if (photoActions.busy || wornToday.isBusy()) {
      return;
    }
    photoActions.clearError();
    wornToday.clearError();
    closeSheet();
  }

  // Story 5.5: Fit detail's "Worn" strip opens a day here as `?date=YYYY-MM-DD`.
  // The tab stays mounted, so this follows the param rather than reading it
  // once. Once the remembered view is known it shows the week or month
  // holding that day and opens its sheet -- adjusted during render, like
  // `seenToday` above -- then the param is cleared so a later visit to the
  // tab doesn't open it again. A malformed date is just cleared.
  const { date: dateParam } = useLocalSearchParams<{ date?: string }>();
  const [handledDate, setHandledDate] = useState<string | null>(null);
  if (!dateParam && handledDate) {
    // Cleared, so the same day can be opened again later.
    setHandledDate(null);
  } else if (dateParam && view !== null && dateParam !== handledDate && !sheetBusy) {
    // Waits out a day-sheet write, as closing or leaving the sheet does.
    setHandledDate(dateParam);
    if (isLocalDate(dateParam)) {
      setWeekStart(weekStartOf(dateParam));
      setMonthStart(monthStartOf(dateParam));
      openSheet(dateParam);
    }
  }
  useEffect(() => {
    if (dateParam && dateParam === handledDate) {
      router.setParams({ date: undefined });
    }
  }, [dateParam, handledDate]);

  function viewFit(fitId: string) {
    if (busy || photoActions.busy || wornToday.isBusy()) {
      return;
    }
    closeDaySheet();
    router.push(`/fit/${fitId}`);
  }

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
          <PlannerMonthGrid
            weeks={weeks}
            dayFits={monthDayFits}
            thumbnailUrls={thumbnailUrls}
            photoUrls={photoUrls}
            onOpenDay={openSheet}
          />
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
            const photo = weekDayWears.get(day.date)?.wear.photo ?? null;
            const meta = !fit
              ? ''
              : weekDayWears.has(day.date)
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
                photo={photo}
                photoUrl={photo ? (photoUrls?.[photo.thumbPath] ?? null) : null}
                onPress={() => openSheet(day.date)}
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
        busy={sheetBusy}
        errorMessage={writeError ?? wornToday.error ?? photoActions.error}
        onPick={pickFit}
        onRemove={removeFit}
        onClose={closeDaySheet}
        worn={sheetWorn}
        photoSavingUri={
          sheetWorn && photoActions.saving?.wearId === sheetWorn.wear.id ? photoActions.saving.uri : null
        }
        onAddPhoto={photoActions.addPhoto}
        onRemovePhoto={photoActions.removePhoto}
        header={
          sheetLead
            ? {
                fit: sheetLead,
                status: sheetStatus,
                onViewFit: () => viewFit(sheetLead.id),
                wornToggle:
                  toggleFit && hasTodayWorn
                    ? { isWornToday: wornToday.isWornToday, onToggle: () => void wornToday.toggle() }
                    : null,
              }
            : null
        }
      />
    </>,
  );
}
