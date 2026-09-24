import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { FlatList, useColorScheme, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  router,
  useFocusEffect,
  useLocalSearchParams,
  useNavigation,
  type Href,
  type NativeStackNavigationProp,
} from 'expo-router';

import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { CirclePlusButton } from '@/components/ui/CirclePlusButton';
import { CheckIcon } from '@/components/ui/icons/CheckIcon';
import { ConnectionErrorNotice } from '@/components/ConnectionErrorNotice';
import { FitsGridCell } from '@/components/fits/FitsGridCell';
import { FitsGridSkeleton } from '@/components/fits/FitsGridSkeleton';
import { FitsFilterChips, type FitsFilter } from '@/components/fits/FitsFilterChips';
import { useSession } from '@/lib/auth/useSession';
import { useFits, type FitRow } from '@/lib/fits/listFits';
import { useFitWearCounts } from '@/lib/fits/wornFitIds';
import { useThumbnailUrls } from '@/lib/wardrobe/thumbnailUrls';
import { FitError, isNoConnectionError, NO_CONNECTION_MESSAGE, UNKNOWN_ERROR_MESSAGE } from '@/lib/fits/errors';
import { useTabBarClearance } from '@/lib/theme/tabBar';
import { colors } from '@/lib/theme/colors';
import { Sentry } from '@/lib/observability/sentry';

const FILTER_EMPTY_COPY: Record<Exclude<FitsFilter, 'all'>, { title: string; body: string }> = {
  favorites: {
    title: 'No favorites yet.',
    body: 'Tap the heart on a Fit to keep it here.',
  },
  worn: {
    title: 'Nothing worn yet.',
    body: "Mark a Fit as worn from its page and it shows up here, with how often you've worn it.",
  },
};

const ACK_DURATION_MS = 2500;
const GRID_COLUMNS = 2;
const GUTTER = 16;
const COLUMN_GAP = 10;
const ROW_GAP = 18;
const ITALIC_SERIF = 'Newsreader_400Regular_Italic';
const SAVED_DATE_FORMAT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

/** Line 2 under a tile: how often the Fit has been worn, or when it was saved if never. */
function fitMetaLabel(wearCount: number, updatedAt: string) {
  return wearCount > 0 ? `Worn ${wearCount}×` : `Saved ${SAVED_DATE_FORMAT.format(new Date(updatedAt))}`;
}

export default function Fits() {
  const insets = useSafeAreaInsets();
  const tabBarClearance = useTabBarClearance();
  const { width } = useWindowDimensions();
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;
  const { session } = useSession();
  const userId = session?.user.id;

  const navigation = useNavigation<NativeStackNavigationProp<Record<string, object | undefined>>>();
  const { fitSaved } = useLocalSearchParams<{ fitSaved?: string }>();
  // Derived directly from the route param, not mirrored into local state --
  // same convention as `wardrobe.tsx`'s `itemAdded` ack.
  const showAck = fitSaved === '1';

  useEffect(() => {
    if (!showAck) {
      return;
    }

    // Scoped to this screen's own route via `useNavigation()`, not the
    // global `router.setParams` -- that one targets whichever screen is
    // currently focused, so if the user taps into a Fit's detail screen
    // before this timeout fires, it would clear the wrong screen's params
    // and leave the banner stuck here indefinitely.
    const timeout = setTimeout(() => navigation.setParams({ fitSaved: undefined }), ACK_DURATION_MS);
    return () => clearTimeout(timeout);
  }, [showAck, navigation]);

  const { data: fits, isLoading, isError, error, refetch } = useFits(userId);
  const {
    data: wearCounts,
    isLoading: isWornLoading,
    isError: isWornError,
    error: wornError,
  } = useFitWearCounts(userId);
  const [filter, setFilter] = useState<FitsFilter>('all');

  // The banner confirms a Fit was just saved -- make sure it's actually
  // visible, not hidden behind a leftover Favorites/Worn filter. Adjusted
  // during render on the ack's rising edge (React's "storing information
  // from previous renders" pattern, same as `wardrobe.tsx`) rather than in
  // an effect.
  const [ackSeen, setAckSeen] = useState(showAck);
  if (showAck !== ackSeen) {
    setAckSeen(showAck);
    if (showAck) {
      setFilter('all');
    }
  }

  // Same reasoning as `wardrobe.tsx`'s own `useFocusEffect`: `router.dismissTo`
  // (used on a successful save/edit in `new-fit.tsx`) returns to this
  // already-mounted tab rather than remounting it, so a mount-time refetch
  // never fires on its own.
  useFocusEffect(
    useCallback(() => {
      refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch is stable; re-running per focus, not per identity change.
    }, []),
  );

  useEffect(() => {
    if (isError && !isNoConnectionError(error)) {
      Sentry.captureException(error);
    }
  }, [isError, error]);

  // Fails open, same as `fit/[id].tsx`'s item-count read: a failed secondary
  // read (wear counts) shouldn't block viewing/filtering an otherwise
  // healthy Fits list -- every tile just reads "Saved …" and the Worn filter
  // stays empty until this self-heals on the next refetch.
  // `getFitWearCounts` throws its own classified `FitError` (unlike
  // `useFits`'s queryFn, which lets the raw Supabase error through), so this
  // checks `instanceof FitError` rather than the generic
  // `isNoConnectionError`, same as `fit/[id].tsx`'s own
  // `isItemsNoConnection` check.
  const isWornNoConnection = wornError instanceof FitError && wornError.kind === 'no_connection';
  useEffect(() => {
    if (isWornError && !isWornNoConnection) {
      Sentry.captureException(wornError);
    }
  }, [isWornError, isWornNoConnection, wornError]);

  const coverPaths = useMemo(() => (fits ?? []).map((fit) => fit.cover_path).filter((path): path is string => Boolean(path)), [fits]);
  const { data: thumbnailUrls } = useThumbnailUrls(coverPaths);
  const columnWidth = (width - GUTTER * 2 - COLUMN_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
  const fitCount = fits?.length ?? 0;
  const isReady = Boolean(userId) && !isLoading && !isWornLoading && !isError;
  const gridExtraData = useMemo(() => ({ wearCounts, thumbnailUrls, columnWidth }), [wearCounts, thumbnailUrls, columnWidth]);

  // Client-side filtering. A failed wear-count read leaves `wearCounts`
  // undefined, so Worn is simply empty (fails open, see above).
  const filteredFits = useMemo(() => {
    const allFits = fits ?? [];
    if (filter === 'favorites') {
      return allFits.filter((candidate) => candidate.is_favorite);
    }
    if (filter === 'worn') {
      return allFits.filter((candidate) => (wearCounts?.get(candidate.id) ?? 0) > 0);
    }
    return allFits;
  }, [fits, filter, wearCounts]);

  const header = (
    <View style={{ paddingTop: insets.top + 12 }} className="flex-row items-end justify-between gap-3 px-gutter">
      <View className="shrink">
        {/* Always rendered so its line height is reserved while loading --
            otherwise the title and "+" jump down when the data arrives. */}
        <Text variant="caption" className="mb-1.5 text-ink-secondary dark:text-ink-secondaryDark">
          {isReady ? (fitCount === 0 ? 'No Fits yet' : `${fitCount} ${fitCount === 1 ? 'Fit' : 'Fits'}`) : ' '}
        </Text>
        <Text accessibilityRole="header" variant="display" className="text-ink-primary dark:text-ink-primaryDark">
          My Fits
        </Text>
      </View>
      <CirclePlusButton accessibilityLabel="New Fit" onPress={() => router.push('/new-fit')} />
    </View>
  );

  // Floats above the tab bar rather than pushing the grid down, and shows
  // over whichever state is current -- the same ink banner as My Closet's.
  const ackBanner = showAck ? (
    <View
      testID="fits-ack-banner"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{ bottom: tabBarClearance, minHeight: 48 }}
      className="absolute left-gutter right-gutter flex-row items-center gap-2.5 rounded-sm bg-ink-primary px-4 py-3 shadow-sm dark:bg-ink-primaryDark"
    >
      <CheckIcon size={16} color={palette.surfaceBase} />
      <Text variant="caption" className="flex-1 text-surface-base dark:text-surface-baseDark">
        Fit saved
      </Text>
    </View>
  ) : null;

  function renderScreen(body: ReactNode) {
    return (
      <View className="flex-1 bg-surface-base dark:bg-surface-baseDark">
        {header}
        {body}
        {ackBanner}
      </View>
    );
  }

  if (!userId || isLoading || isWornLoading) {
    return renderScreen(
      <FitsGridSkeleton columns={GRID_COLUMNS} columnWidth={columnWidth} columnGap={COLUMN_GAP} rowGap={ROW_GAP} />,
    );
  }

  if (isError) {
    const message = isNoConnectionError(error) ? NO_CONNECTION_MESSAGE : UNKNOWN_ERROR_MESSAGE;
    return renderScreen(
      <View className="px-gutter pt-6">
        <View className="mb-6">
          <ConnectionErrorNotice message={message} />
        </View>
        <Button title="Retry" variant="primary" onPress={() => refetch()} />
      </View>,
    );
  }

  if (fitCount === 0) {
    // No chips here -- there's nothing to narrow yet.
    return renderScreen(
      <View className="items-start px-8 pt-24">
        <Text
          variant="title"
          style={{ fontFamily: ITALIC_SERIF }}
          className="mb-3 text-ink-primary dark:text-ink-primaryDark"
        >
          No Fits yet.
        </Text>
        <Text variant="body" className="mb-6 text-ink-secondary dark:text-ink-secondaryDark">
          Put pieces from your closet together on the canvas, then save the looks you&apos;d actually wear.
        </Text>
        <Button title="Build your first Fit" variant="primary" onPress={() => router.push('/new-fit')} />
      </View>,
    );
  }

  function renderCell({ item }: { item: FitRow }) {
    const thumbnailUrl = item.cover_path ? (thumbnailUrls?.[item.cover_path] ?? null) : null;
    return (
      <FitsGridCell
        name={item.name}
        thumbnailUrl={thumbnailUrl}
        columnWidth={columnWidth}
        onPress={() => router.push({ pathname: '/fit/[id]', params: { id: item.id } } as Href)}
        fitId={item.id}
        isFavorite={item.is_favorite}
        userId={userId}
        backgroundColor={item.canvas_background_color}
        meta={fitMetaLabel(wearCounts?.get(item.id) ?? 0, item.updated_at)}
      />
    );
  }

  const filterEmptyCopy = filter !== 'all' && filteredFits.length === 0 ? FILTER_EMPTY_COPY[filter] : null;

  return renderScreen(
    <>
      <View className="pt-4">
        <FitsFilterChips selected={filter} onSelect={setFilter} />
      </View>
      {filterEmptyCopy ? (
        <View className="items-start px-8 pt-16">
          <Text
            variant="title"
            style={{ fontFamily: ITALIC_SERIF }}
            className="mb-3 text-ink-primary dark:text-ink-primaryDark"
          >
            {filterEmptyCopy.title}
          </Text>
          <Text variant="body" className="mb-5 text-ink-secondary dark:text-ink-secondaryDark">
            {filterEmptyCopy.body}
          </Text>
          <Button title="Show all Fits" variant="secondary" onPress={() => setFilter('all')} />
        </View>
      ) : (
        <FlatList
          testID="fits-grid"
          data={filteredFits}
          numColumns={GRID_COLUMNS}
          keyExtractor={(item) => item.id}
          // Cells read wear counts and signed URLs from outside `data`.
          extraData={gridExtraData}
          contentContainerClassName="px-gutter pt-5"
          contentContainerStyle={{ paddingBottom: tabBarClearance }}
          columnWrapperStyle={{ gap: COLUMN_GAP, marginBottom: ROW_GAP }}
          renderItem={renderCell}
        />
      )}
    </>,
  );
}
