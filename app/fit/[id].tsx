import { useEffect, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Pressable, ScrollView, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { BackHeader } from '@/components/ui/BackHeader';
import { ACTION_ICON_SIZE, ACTION_TOUCH_TARGET, DetailAction } from '@/components/ui/DetailAction';
import { PencilIcon } from '@/components/ui/icons/PencilIcon';
import { TrashIcon } from '@/components/ui/icons/TrashIcon';
import { HeartIcon } from '@/components/ui/icons/HeartIcon';
import { CalendarIcon } from '@/components/ui/icons/CalendarIcon';
import { CheckIcon } from '@/components/ui/icons/CheckIcon';
import { ShareIcon } from '@/components/ui/icons/ShareIcon';
import { ConnectionErrorNotice } from '@/components/ConnectionErrorNotice';
import { SectionLabel } from '@/components/wardrobe/SectionLabel';
import { FitItemsList } from '@/components/fits/FitItemsList';
import { useSession } from '@/lib/auth/useSession';
import { useFits } from '@/lib/fits/listFits';
import { useThumbnailUrls } from '@/lib/wardrobe/thumbnailUrls';
import { deleteFit } from '@/lib/fits/deleteFit';
import { getFitItems } from '@/lib/fits/getFitItems';
import { toggleFitFavorite } from '@/lib/fits/toggleFavorite';
import { invalidateWearQueries, markFitWornToday, unmarkFitWornToday } from '@/lib/fits/markFitWorn';
import { useTodayWornFitIds } from '@/lib/fits/wornFitIds';
import { shareFitCover } from '@/lib/fits/shareFit';
import { FitError, isNoConnectionError, NO_CONNECTION_MESSAGE, UNKNOWN_ERROR_MESSAGE } from '@/lib/fits/errors';
import { Sentry } from '@/lib/observability/sentry';
import { trackFitWorn } from '@/lib/analytics/posthog';
import { colors } from '@/lib/theme/colors';

const ACK_DURATION_MS = 2500;
const UPDATED_AT_FORMAT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const COVER_ASPECT_RATIO = 4 / 5;

/**
 * Scoped to what Stories 3.3/4.1/4.2/4.3 need -- collage, name, item list,
 * Share, Favorite, Wear today, Edit, Delete. Plan (EXPERIENCE.md's full
 * Fit-detail action set) belongs to Story 5.1 and gets no placeholder here.
 */
export default function FitDetail() {
  const { id, fitUpdated } = useLocalSearchParams<{ id: string; fitUpdated?: string }>();
  const { session } = useSession();
  const userId = session?.user.id;
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const scheme = useColorScheme();
  const inkPrimary = scheme === 'dark' ? colors.dark.inkPrimary : colors.light.inkPrimary;
  const inkDisabled = scheme === 'dark' ? colors.dark.inkDisabled : colors.light.inkDisabled;

  // Same "already-cached list is the single source of truth" convention as
  // `app/item/[id].tsx` -- no separate single-Fit query.
  const { data: fits, isLoading, isError: isListError, error: listError, refetch: refetchFits } = useFits(userId);
  const fit = fits?.find((candidate) => candidate.id === id);

  // Powers the zero-item empty state (Story 3.4) -- `fit` itself carries no
  // item count, only `getFitItems`'s placements do. Never blocking, loading
  // or failed alike: `liveItemCount` stays `null` in both cases and the
  // cover renders as it always has, only swapping to the empty state once
  // this has actually resolved to zero live items. A failed secondary read
  // here shouldn't cost the user the ability to view/edit/delete an
  // otherwise perfectly healthy Fit -- it's reported to Sentry (below) and
  // self-heals on the next mount/refetch rather than blocking the screen.
  const {
    data: fitItems,
    isError: isItemsError,
    error: itemsError,
  } = useQuery({
    queryKey: ['fitItems', fit?.id],
    queryFn: () => getFitItems(fit!.id),
    enabled: Boolean(fit),
  });
  const liveItemCount = fitItems ? fitItems.filter((item) => !item.wardrobeItemDeleted).length : null;
  const isEmptyFit = liveItemCount === 0;
  // `getFitItems` throws its own classified `FitError`, unlike `useFits`'s
  // queryFn (which lets the raw Supabase error through for `isNoConnectionError`
  // above) -- same `instanceof FitError` check `app/new-fit.tsx`'s `loadFit` uses.
  const isItemsNoConnection = itemsError instanceof FitError && itemsError.kind === 'no_connection';

  useEffect(() => {
    if (isItemsError && !isItemsNoConnection) {
      Sentry.captureException(itemsError);
    }
  }, [isItemsError, isItemsNoConnection, itemsError]);

  useEffect(() => {
    if (isListError && !isNoConnectionError(listError)) {
      Sentry.captureException(listError);
    }
  }, [isListError, listError]);

  // Story 4.2: whether *today's* fit_wears row already exists for this Fit,
  // separate from `useFitWearCounts`'s "ever worn" (used by the My Fits Worn
  // filter) -- powers the Wear-today button's already-logged state.
  const { data: todayWornFitIds } = useTodayWornFitIds(userId);

  const showAck = fitUpdated === '1';
  useEffect(() => {
    if (!showAck) {
      return;
    }
    const timeout = setTimeout(() => router.setParams({ fitUpdated: undefined }), ACK_DURATION_MS);
    return () => clearTimeout(timeout);
  }, [showAck]);

  const {
    data: thumbnailUrls,
    isStale: isCoverUrlStale,
    refetch: refetchCoverUrl,
  } = useThumbnailUrls(fit?.cover_path ? [fit.cover_path] : []);
  const coverUrl = fit?.cover_path ? (thumbnailUrls?.[fit.cover_path] ?? null) : null;

  const [deleting, setDeleting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Optimistic overrides: DESIGN.md requires an immediate visual flip with
  // no confirmation step, but `fit`/`todayWornFitIds` only reflect the
  // server once the corresponding query is invalidated and refetched.
  // `null` means "no override -- trust the fetched value"; reset whenever
  // the viewed Fit changes so a stale override can't leak across Fits.
  // Resetting during render (React's documented "adjust state when a prop
  // changes" pattern), not in an effect, avoids an extra render pass.
  const [favoriteOverride, setFavoriteOverride] = useState<boolean | null>(null);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [wornTodayOverride, setWornTodayOverride] = useState<boolean | null>(null);
  const [wearBusy, setWearBusy] = useState(false);
  const [overrideResetForId, setOverrideResetForId] = useState(id);

  if (id !== overrideResetForId) {
    setOverrideResetForId(id);
    setFavoriteOverride(null);
    setWornTodayOverride(null);
  }

  const isFavorite = favoriteOverride ?? fit?.is_favorite ?? false;
  const isWornToday = wornTodayOverride ?? (fit ? (todayWornFitIds?.has(fit.id) ?? false) : false);

  function reportUnknownError(error: unknown) {
    Sentry.captureException(error);
    setErrorMessage(UNKNOWN_ERROR_MESSAGE);
  }

  async function handleToggleFavorite() {
    if (!fit || favoriteBusy) {
      return;
    }
    setErrorMessage(null);
    const next = !isFavorite;
    setFavoriteOverride(next);
    setFavoriteBusy(true);
    try {
      await toggleFitFavorite(fit.id, next);
      // Awaited (unlike `handleDelete`'s fire-and-forget invalidate, which
      // navigates away regardless): clearing the override only once the
      // refetch has actually landed avoids trusting a stale local value
      // forever -- `isFavorite` falls back to `fit?.is_favorite` once this
      // resolves, so the override's only job was bridging the gap until now.
      await queryClient.invalidateQueries({ queryKey: ['fits', userId] });
      setFavoriteOverride(null);
    } catch (error) {
      setFavoriteOverride(!next);
      if (error instanceof FitError && error.kind === 'no_connection') {
        setErrorMessage(NO_CONNECTION_MESSAGE);
      } else {
        reportUnknownError(error);
      }
    } finally {
      setFavoriteBusy(false);
    }
  }

  async function handleToggleWornToday() {
    if (!fit || !userId || wearBusy) {
      return;
    }
    setErrorMessage(null);
    const next = !isWornToday;
    setWornTodayOverride(next);
    setWearBusy(true);
    try {
      if (next) {
        await markFitWornToday(userId, fit.id);
        trackFitWorn('detail');
      } else {
        await unmarkFitWornToday(userId, fit.id);
      }
      // Awaited, same reasoning as `handleToggleFavorite` -- clear the
      // override only once every wear read has actually refetched.
      await invalidateWearQueries(queryClient, userId);
      setWornTodayOverride(null);
    } catch (error) {
      setWornTodayOverride(!next);
      if (error instanceof FitError && error.kind === 'no_connection') {
        setErrorMessage(NO_CONNECTION_MESSAGE);
      } else {
        reportUnknownError(error);
      }
    } finally {
      setWearBusy(false);
    }
  }

  async function handleDelete() {
    if (!fit) {
      return;
    }
    setErrorMessage(null);
    setDeleting(true);
    try {
      await deleteFit(fit.id);
      // Not awaited: the delete itself already succeeded and is the only
      // thing that must not fail silently here -- a failed post-delete
      // refetch shouldn't be reported through the same catch as a failed
      // delete, which would misrepresent an already-successful,
      // non-reversible delete as failed.
      queryClient.invalidateQueries({ queryKey: ['fits', userId] }).catch(() => {});
      router.back();
    } catch (error) {
      if (error instanceof FitError && error.kind === 'no_connection') {
        setErrorMessage(NO_CONNECTION_MESSAGE);
      } else {
        reportUnknownError(error);
      }
    } finally {
      setDeleting(false);
    }
  }

  async function handleShare() {
    const coverPath = fit?.cover_path;
    if (!fit || !coverPath || !coverUrl || sharing || deleting) {
      return;
    }
    setErrorMessage(null);
    setSharing(true);
    try {
      let url: string | null = coverUrl;
      // Signed URLs expire after an hour and nothing re-signs them while
      // this screen stays mounted (e.g. the app sat in the background
      // overnight) -- `staleTime` is set a minute short of expiry, so a
      // stale query means the URL is about to (or already did) 403.
      if (isCoverUrlStale) {
        const refreshed = await refetchCoverUrl();
        if (refreshed.isError) {
          throw refreshed.error;
        }
        url = refreshed.data?.[coverPath] ?? null;
        if (!url) {
          throw new Error('Cover URL could not be re-signed for sharing');
        }
      }
      await shareFitCover(fit.id, url);
    } catch (error) {
      if ((error instanceof FitError && error.kind === 'no_connection') || isNoConnectionError(error)) {
        setErrorMessage(NO_CONNECTION_MESSAGE);
      } else {
        reportUnknownError(error);
      }
    } finally {
      setSharing(false);
    }
  }

  function handleDeletePress() {
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ['Delete', 'Cancel'], destructiveButtonIndex: 0, cancelButtonIndex: 1 },
      (buttonIndex) => {
        if (buttonIndex === 0) {
          void handleDelete();
        }
      },
    );
  }

  function handleEditPress() {
    if (!fit) {
      return;
    }
    router.push({ pathname: '/new-fit', params: { fitId: fit.id } });
  }

  const header = <BackHeader disabled={deleting} compact />;

  if (!userId || isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-base dark:bg-surface-baseDark">
        {header}
        <ActivityIndicator />
      </View>
    );
  }

  if (isListError) {
    const message = isNoConnectionError(listError) ? NO_CONNECTION_MESSAGE : UNKNOWN_ERROR_MESSAGE;
    return (
      <View className="flex-1 bg-surface-base dark:bg-surface-baseDark">
        {header}
        <View className="px-gutter">
          <View className="mb-6">
            <ConnectionErrorNotice message={message} />
          </View>
          <Button title="Retry" variant="primary" onPress={() => refetchFits()} />
        </View>
      </View>
    );
  }

  if (!fit) {
    return (
      <View className="flex-1 bg-surface-base dark:bg-surface-baseDark">
        {header}
        <View className="flex-1 items-center justify-center px-gutter">
          <Text variant="body" className="text-center text-ink-secondary dark:text-ink-secondaryDark">
            This Fit is no longer available.
          </Text>
        </View>
      </View>
    );
  }

  // Also disabled until the live item count is known, so a zero-item Fit's
  // stale cover can't be shared in the window before `isEmptyFit` resolves.
  // A failed count read fails open (same as the rest of this screen, Story 3.4).
  const itemCountPending = liveItemCount === null && !isItemsError;
  const shareDisabled = !coverUrl || itemCountPending || deleting || sharing;
  // Hidden (not just disabled) for a zero-live-item Fit: its stored cover
  // still shows the items that were since deleted, so sharing it would hand
  // out an image that no longer matches the Fit.
  const shareButton = isEmptyFit ? null : (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Share Fit"
      accessibilityState={{ busy: sharing }}
      onPress={handleShare}
      disabled={shareDisabled}
      hitSlop={8}
      className="active:opacity-60"
      style={{ minWidth: ACTION_TOUCH_TARGET, minHeight: ACTION_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' }}
    >
      {sharing ? (
        <ActivityIndicator size="small" />
      ) : (
        <ShareIcon size={ACTION_ICON_SIZE} color={shareDisabled ? inkDisabled : inkPrimary} />
      )}
    </Pressable>
  );

  const updatedLabel = `Updated ${UPDATED_AT_FORMAT.format(new Date(fit.updated_at))}`;
  // Item count only once `getFitItems` has resolved -- never a guessed or
  // zero-until-loaded number.
  const metaLine =
    liveItemCount === null ? updatedLabel : `${liveItemCount} ${liveItemCount === 1 ? 'item' : 'items'} · ${updatedLabel}`;

  return (
    <View className="flex-1 bg-surface-base dark:bg-surface-baseDark">
      <BackHeader disabled={deleting} compact right={shareButton} />
      {/*
       * Story 4.3 "editorial scroll" layout: collage first, then name/meta,
       * then a captioned action row, then the items -- one scroll, image
       * leading (DESIGN.md: "the photo dominates the top of the screen").
       * Share sits top-right in the header, the iOS convention Grailed /
       * Zalando / lululemon all follow on Mobbin.
       */}
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {showAck ? (
          <Text accessibilityRole="alert" variant="body" className="px-gutter pb-2 text-ink-primary dark:text-ink-primaryDark">
            Fit updated.
          </Text>
        ) : null}
        {/*
         * Fixed 4:5 frame (the portrait ratio fashion apps use for a look)
         * with `contentFit="contain"`, so a Fit of any shape letterboxes
         * inside it and is never cropped. No shadow -- DESIGN.md:
         * "Photography ... never gets a shadow of its own."
         */}
        <View className="px-gutter pt-2">
          <View
            style={{ aspectRatio: COVER_ASPECT_RATIO }}
            className="w-full overflow-hidden rounded-lg bg-surface-raised dark:bg-surface-raisedDark"
          >
            {isEmptyFit ? (
              <View testID="fit-detail-empty" className="flex-1 items-center justify-center px-gutter">
                <Text variant="body" className="mb-6 text-center text-ink-secondary dark:text-ink-secondaryDark">
                  This Fit has no items left.
                </Text>
                <Button title="Add item" variant="primary" onPress={handleEditPress} />
              </View>
            ) : coverUrl ? (
              <Image
                testID="fit-detail-cover"
                accessibilityLabel="Fit collage"
                source={{ uri: coverUrl }}
                style={{ width: '100%', height: '100%' }}
                contentFit="contain"
                transition={200}
                priority="high"
              />
            ) : (
              <View testID="fit-detail-cover-fallback" className="h-full w-full" />
            )}
          </View>
        </View>

        <View className="px-gutter pt-6">
          <Text variant="display" numberOfLines={3} className="text-ink-primary dark:text-ink-primaryDark">
            {fit.name}
          </Text>
          <Text variant="meta" className="mt-2 uppercase tracking-widest text-ink-secondary dark:text-ink-secondaryDark">
            {metaLine}
          </Text>
        </View>

        {/*
         * Captioned action row between two hairlines (Whering puts its
         * actions directly under the collage; the tiny tracked uppercase
         * captions are Zara/SSENSE's editorial register). Every icon is the
         * same weight/color, Delete included -- `colors.destructive` stays
         * reserved for the confirmation sheet itself (DESIGN.md: destructive
         * red is "never decorative"). State is fill/glyph only, never color.
         */}
        <View className="mx-gutter mt-6 flex-row border-y border-border-hairline py-2 dark:border-border-hairlineDark">
          <DetailAction
            label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            caption="Favorite"
            selected={isFavorite}
            onPress={handleToggleFavorite}
            disabled={deleting || favoriteBusy}
          >
            <HeartIcon size={ACTION_ICON_SIZE} color={deleting || favoriteBusy ? inkDisabled : inkPrimary} filled={isFavorite} />
          </DetailAction>
          <DetailAction
            label={isWornToday ? "Remove today's wear entry" : 'Wear today'}
            caption={isWornToday ? 'Worn today' : 'Wear today'}
            selected={isWornToday}
            onPress={handleToggleWornToday}
            disabled={deleting || wearBusy}
          >
            {isWornToday ? (
              <CheckIcon size={ACTION_ICON_SIZE} color={deleting || wearBusy ? inkDisabled : inkPrimary} />
            ) : (
              <CalendarIcon size={ACTION_ICON_SIZE} color={deleting || wearBusy ? inkDisabled : inkPrimary} />
            )}
          </DetailAction>
          {/* Empty state above already offers its own "Add item" CTA for this exact action -- avoid two differently-labeled controls for the same thing. */}
          {isEmptyFit ? null : (
            <DetailAction label="Edit Fit" caption="Edit" onPress={handleEditPress} disabled={deleting}>
              <PencilIcon size={ACTION_ICON_SIZE} color={deleting ? inkDisabled : inkPrimary} />
            </DetailAction>
          )}
          <DetailAction
            label="Delete Fit"
            caption="Delete"
            onPress={handleDeletePress}
            disabled={deleting || favoriteBusy || wearBusy || sharing}
          >
            {deleting ? <ActivityIndicator size="small" /> : <TrashIcon size={ACTION_ICON_SIZE} color={inkPrimary} />}
          </DetailAction>
        </View>

        {errorMessage ? (
          <View className="px-gutter pt-4">
            <ConnectionErrorNotice message={errorMessage} />
          </View>
        ) : null}

        {/* Not shown in the zero-live-item empty state above -- a "Removed" row list would contradict its own "no items left" message. */}
        {!isEmptyFit && fitItems && fitItems.length > 0 ? (
          <View className="px-gutter pt-8">
            <SectionLabel>Items</SectionLabel>
            <FitItemsList items={fitItems} />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
