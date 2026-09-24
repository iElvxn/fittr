import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
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
import {
  CATEGORY_FILTER_LABELS,
  CategoryFilterChips,
  type CategoryFilter,
} from '@/components/wardrobe/CategoryFilterChips';
import { ClosetSearchField } from '@/components/wardrobe/ClosetSearchField';
import { ClosetTile } from '@/components/wardrobe/ClosetTile';
import { WardrobeGridSkeleton } from '@/components/wardrobe/WardrobeGridSkeleton';
import { useSession } from '@/lib/auth/useSession';
import { useWardrobeItems, filterByCategory, searchItems, type WardrobeItemRow } from '@/lib/wardrobe/listItems';
import { useThumbnailUrls } from '@/lib/wardrobe/thumbnailUrls';
import { isNoConnectionError, NO_CONNECTION_MESSAGE, UNKNOWN_ERROR_MESSAGE } from '@/lib/wardrobe/errors';
import { useTabBarClearance } from '@/lib/theme/tabBar';
import { colors } from '@/lib/theme/colors';
import { Sentry } from '@/lib/observability/sentry';

const ACK_DURATION_MS = 2500;
const GRID_COLUMNS = 3;
const GUTTER = 16;
const COLUMN_GAP = 8;
const ROW_GAP = 14;
const ITALIC_SERIF = 'Newsreader_400Regular_Italic';

export default function Wardrobe() {
  const navigation = useNavigation<NativeStackNavigationProp<Record<string, object | undefined>>>();
  const { itemAdded } = useLocalSearchParams<{ itemAdded?: string }>();
  // Derived directly from the route param, not mirrored into local state --
  // the param itself is the source of truth for whether the ack is showing.
  const showAck = itemAdded === '1';

  useEffect(() => {
    if (!showAck) {
      return;
    }

    // Scoped to this screen's own route via `useNavigation()`, not the
    // global `router.setParams` -- that one targets whichever screen is
    // currently focused, so if the user taps into an item's detail screen
    // before this timeout fires, it would clear the wrong screen's params
    // and leave the ack stuck here indefinitely.
    const timeout = setTimeout(() => navigation.setParams({ itemAdded: undefined }), ACK_DURATION_MS);
    return () => clearTimeout(timeout);
  }, [showAck, navigation]);

  const { session } = useSession();
  const userId = session?.user.id;
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tabBarClearance = useTabBarClearance();
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('all');
  const [query, setQuery] = useState('');

  // The banner confirms a piece was just added -- make sure it's actually
  // visible, not hidden behind a leftover search or chip (and a chip can't
  // stay set invisibly behind the empty state either).
  // Adjusted during render on the ack's rising edge (React's "storing
  // information from previous renders" pattern) rather than in an effect.
  const [ackSeen, setAckSeen] = useState(showAck);
  if (showAck !== ackSeen) {
    setAckSeen(showAck);
    if (showAck) {
      setQuery('');
      setSelectedCategory('all');
    }
  }

  const { data: items, isLoading, isError, error, refetch, isRefetching } = useWardrobeItems(userId);

  // `router.dismissTo` (used when Save succeeds in add-item.tsx) returns to
  // this already-mounted tab rather than remounting it, so TanStack Query's
  // mount-time refetch never fires on its own -- without this, the "added"
  // ack can show while the grid still reflects the pre-save state.
  useFocusEffect(
    useCallback(() => {
      refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch is stable; re-running per focus, not per identity change.
    }, []),
  );

  useEffect(() => {
    if (isError && !isNoConnectionError(error)) {
      // Everything expected (no connection) is already distinguishable via
      // `isNoConnectionError`; anything else here is worth seeing rather
      // than silently collapsing into the generic message.
      Sentry.captureException(error);
    }
  }, [isError, error]);

  // Computed from the full unfiltered list, not `visibleItems` -- a chip tap
  // or a keystroke in search must not trigger a new signed-URL fetch for
  // images already on screen.
  const thumbPaths = useMemo(() => (items ?? []).map((item) => item.thumb_path), [items]);
  const {
    data: thumbnailUrls,
    isError: isThumbnailError,
    error: thumbnailError,
  } = useThumbnailUrls(thumbPaths);

  useEffect(() => {
    if (isThumbnailError) {
      // No user-facing retry for this one -- a broken bulk signed-URL
      // request already degrades gracefully to per-tile placeholders, but
      // that degradation was otherwise invisible to anyone but the user.
      Sentry.captureException(thumbnailError);
    }
  }, [isThumbnailError, thumbnailError]);

  const visibleItems = useMemo(
    () => searchItems(filterByCategory(items ?? [], selectedCategory), query),
    [items, selectedCategory, query],
  );
  const columnWidth = (width - GUTTER * 2 - COLUMN_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
  const itemCount = items?.length ?? 0;
  const gridExtraData = useMemo(() => ({ thumbnailUrls, columnWidth }), [thumbnailUrls, columnWidth]);
  const isReady = Boolean(userId) && !isLoading && !isError;

  function showEverything() {
    setQuery('');
    setSelectedCategory('all');
  }

  const header = (
    <View style={{ paddingTop: insets.top + 12 }} className="flex-row items-end justify-between gap-3 px-gutter">
      <View className="shrink">
        {/* Always rendered so its line height is reserved while loading --
            otherwise the title and "+" jump down when the data arrives. */}
        <Text variant="caption" className="mb-1.5 text-ink-secondary dark:text-ink-secondaryDark">
          {isReady
            ? itemCount === 0
              ? 'No pieces yet'
              : `${itemCount} ${itemCount === 1 ? 'piece' : 'pieces'}`
            : ' '}
        </Text>
        <Text accessibilityRole="header" variant="display" className="text-ink-primary dark:text-ink-primaryDark">
          My Closet
        </Text>
      </View>
      <CirclePlusButton accessibilityLabel="Add item" onPress={() => router.push('/add-item')} />
    </View>
  );

  // Floats above the tab bar rather than pushing the grid down, and shows
  // over whichever state is current (it's usually the empty -> first-piece
  // transition). Ink fill with inverse `surface-base` text in both modes.
  const ackBanner = showAck ? (
    <View
      testID="wardrobe-ack-banner"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{ bottom: tabBarClearance, minHeight: 48 }}
      className="absolute left-gutter right-gutter flex-row items-center gap-2.5 rounded-sm bg-ink-primary px-4 py-3 shadow-sm dark:bg-ink-primaryDark"
    >
      <CheckIcon size={16} color={palette.surfaceBase} />
      <Text variant="caption" className="flex-1 text-surface-base dark:text-surface-baseDark">
        Added to your closet
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

  if (!userId || isLoading) {
    return renderScreen(
      <WardrobeGridSkeleton
        columns={GRID_COLUMNS}
        columnWidth={columnWidth}
        columnGap={COLUMN_GAP}
        rowGap={ROW_GAP}
      />,
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

  if (itemCount === 0) {
    // No search or chips here -- there's nothing to narrow yet.
    return renderScreen(
      <View className="items-start px-8 pt-24">
        <Text
          variant="title"
          style={{ fontFamily: ITALIC_SERIF }}
          className="mb-3 text-ink-primary dark:text-ink-primaryDark"
        >
          An empty closet.
        </Text>
        <Text variant="body" className="mb-6 text-ink-secondary dark:text-ink-secondaryDark">
          Photograph a piece and Fittr cuts it out for you. Start with what you wear most.
        </Text>
        <Button title="Add your first piece" variant="primary" onPress={() => router.push('/add-item')} />
      </View>,
    );
  }

  const trimmedQuery = query.trim();
  const noResultsMessage = trimmedQuery
    ? `Nothing matches "${trimmedQuery}".`
    : `No ${CATEGORY_FILTER_LABELS[selectedCategory].toLowerCase()} yet.`;

  function renderTile({ item }: { item: WardrobeItemRow }) {
    return (
      <View style={{ paddingHorizontal: COLUMN_GAP / 2, paddingBottom: ROW_GAP }}>
        <ClosetTile
          category={item.category}
          name={item.name}
          brand={item.brand}
          thumbPath={item.thumb_path}
          thumbnailUrl={thumbnailUrls?.[item.thumb_path] ?? null}
          width={columnWidth}
          // `Href` cast: this app's first dynamic route, so the local
          // (gitignored) `.expo/types/router.d.ts` union hasn't been
          // regenerated to include `/item/[id]` yet -- it picks this up
          // automatically the next time `expo start`/`export` runs.
          onPress={() => router.push(`/item/${item.id}` as Href)}
        />
      </View>
    );
  }

  return renderScreen(
    <>
      <View className="px-gutter pt-4">
        <ClosetSearchField value={query} onChangeText={setQuery} />
      </View>
      <View className="pt-3">
        <CategoryFilterChips selected={selectedCategory} onSelect={setSelectedCategory} />
      </View>
      {visibleItems.length === 0 ? (
        <View className="items-start px-8 pt-16">
          <Text
            variant="title"
            style={{ fontFamily: ITALIC_SERIF }}
            className="mb-5 text-ink-primary dark:text-ink-primaryDark"
          >
            {noResultsMessage}
          </Text>
          <Button title="Show everything" variant="secondary" onPress={showEverything} />
        </View>
      ) : (
        <FlashList
          testID="wardrobe-grid"
          data={visibleItems}
          masonry
          numColumns={GRID_COLUMNS}
          keyExtractor={(item) => item.id}
          renderItem={renderTile}
          // Tiles read this outside `data`, so a late signed-URL batch or a
          // rotation has to re-render them explicitly.
          extraData={gridExtraData}
          // Each tile carries half the column gap on both sides, so the
          // outer padding gives back that half to land on the 16pt gutter
          // -- masonry doesn't expose a column index to gap on one side.
          contentContainerStyle={{
            paddingHorizontal: GUTTER - COLUMN_GAP / 2,
            paddingTop: 20,
            paddingBottom: tabBarClearance,
          }}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          refreshing={isRefetching}
          onRefresh={() => refetch()}
        />
      )}
    </>,
  );
}
