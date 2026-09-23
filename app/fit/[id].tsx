import { useEffect, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Pressable, ScrollView, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { BackHeader } from '@/components/ui/BackHeader';
import { PencilIcon } from '@/components/ui/icons/PencilIcon';
import { TrashIcon } from '@/components/ui/icons/TrashIcon';
import { HeartIcon } from '@/components/ui/icons/HeartIcon';
import { CalendarIcon } from '@/components/ui/icons/CalendarIcon';
import { CheckIcon } from '@/components/ui/icons/CheckIcon';
import { ConnectionErrorNotice } from '@/components/ConnectionErrorNotice';
import { SectionLabel } from '@/components/wardrobe/SectionLabel';
import { FitItemsList } from '@/components/fits/FitItemsList';
import { useSession } from '@/lib/auth/useSession';
import { useFits } from '@/lib/fits/listFits';
import { useThumbnailUrls } from '@/lib/wardrobe/thumbnailUrls';
import { deleteFit } from '@/lib/fits/deleteFit';
import { getFitItems } from '@/lib/fits/getFitItems';
import { toggleFitFavorite } from '@/lib/fits/toggleFavorite';
import { markFitWornToday, unmarkFitWornToday } from '@/lib/fits/markFitWorn';
import { useTodayWornFitIds } from '@/lib/fits/wornFitIds';
import { FitError, isNoConnectionError, NO_CONNECTION_MESSAGE, UNKNOWN_ERROR_MESSAGE } from '@/lib/fits/errors';
import { Sentry } from '@/lib/observability/sentry';
import { colors } from '@/lib/theme/colors';

const ACK_DURATION_MS = 2500;
const UPDATED_AT_FORMAT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const ACTION_ICON_SIZE = 20;
const ACTION_TOUCH_TARGET = 44;

/**
 * Scoped to exactly what Story 3.3/4.1/4.2 need -- collage, name, item
 * list, Edit, Favorite, Wear today, Delete. Plan/Share (EXPERIENCE.md's
 * full Fit-detail action set) belong to their own later stories and get no
 * placeholders here. The cover carries no shadow -- DESIGN.md:
 * "Photography ... never gets a shadow of its own."
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
  // separate from `useWornFitIds`'s "ever worn" (used by the My Fits Worn
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

  const { data: thumbnailUrls } = useThumbnailUrls(fit?.cover_path ? [fit.cover_path] : []);
  const coverUrl = fit?.cover_path ? (thumbnailUrls?.[fit.cover_path] ?? null) : null;

  const [deleting, setDeleting] = useState(false);
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
      } else {
        await unmarkFitWornToday(userId, fit.id);
      }
      // Awaited, same reasoning as `handleToggleFavorite` -- clear the
      // override only once both refetches have actually landed.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['wornFitIds', userId] }),
        queryClient.invalidateQueries({ queryKey: ['todayWornFitIds', userId] }),
      ]);
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

  return (
    <View className="flex-1 bg-surface-base dark:bg-surface-baseDark">
      {header}
      {/*
       * Name/meta sit right under the back arrow, not below the image --
       * `display` type's own DESIGN.md example is "a Fit's name on its own
       * detail screen," and keeping it out of the scrollable footer frees
       * that whole region for the image and item list instead of splitting
       * it with text. `numberOfLines` caps a pathological name so it can't
       * push the image down indefinitely.
       */}
      <View className="px-gutter pb-3 pt-1">
        {showAck ? (
          <Text accessibilityRole="alert" variant="body" className="mb-2 text-ink-primary dark:text-ink-primaryDark">
            Fit updated.
          </Text>
        ) : null}
        <Text variant="display" numberOfLines={2} className="text-accent dark:text-accentDark">
          {fit.name}
        </Text>
        <Text variant="meta" className="mt-1 uppercase tracking-widest text-ink-secondary dark:text-ink-secondaryDark">
          Updated {UPDATED_AT_FORMAT.format(new Date(fit.updated_at))}
        </Text>
      </View>
      {/*
       * Image and item list split the remaining space by a fixed 2:1 ratio
       * (both `flex`) rather than the item list being unconstrained -- a
       * `ScrollView` with no bounded height doesn't actually scroll in React
       * Native, it just lets content overflow past the screen.
       * `contentFit="contain"` (not "cover") so a portrait Fit is never
       * cropped -- it just letterboxes within the space available.
       */}
      <View style={{ flex: 2 }} className="px-gutter pb-3">
        <View className="flex-1 overflow-hidden rounded-lg bg-surface-raised dark:bg-surface-raisedDark">
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
            />
          ) : (
            <View testID="fit-detail-cover-fallback" className="h-full w-full" />
          )}
        </View>
      </View>
      <View className="border-t border-border-hairline px-gutter py-3 dark:border-border-hairlineDark">
        {errorMessage ? (
          <View className="mb-3">
            <ConnectionErrorNotice message={errorMessage} />
          </View>
        ) : null}
        {/*
         * Icon-only action row (Photos-app convention: Google Photos, Apple
         * Photos, Halide) rather than a stacked primary button + text link
         * -- every icon is the same weight/color, including Delete, so
         * `colors.destructive` stays reserved for the confirmation sheet
         * itself (DESIGN.md: destructive red is "never decorative"). Share
         * (Story 4.3) and Plan (Story 5.1) land here later, one icon at a
         * time. `active:opacity-60`
         * gives each icon real pressed-state feedback (pro-rules.md: icon
         * buttons need a visible response within 80-150ms of a tap).
         */}
        <View className="flex-row items-center gap-6">
          {/* Empty state above already offers its own "Add items" CTA for this exact action -- avoid two differently-labeled controls for the same thing. */}
          {isEmptyFit ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit Fit"
              onPress={handleEditPress}
              disabled={deleting}
              hitSlop={8}
              className="active:opacity-60"
              style={{ minWidth: ACTION_TOUCH_TARGET, minHeight: ACTION_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' }}
            >
              <PencilIcon size={ACTION_ICON_SIZE} color={deleting ? inkDisabled : inkPrimary} />
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            accessibilityState={{ selected: isFavorite }}
            onPress={handleToggleFavorite}
            disabled={deleting || favoriteBusy}
            hitSlop={8}
            className="active:opacity-60"
            style={{ minWidth: ACTION_TOUCH_TARGET, minHeight: ACTION_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' }}
          >
            <HeartIcon size={ACTION_ICON_SIZE} color={deleting || favoriteBusy ? inkDisabled : inkPrimary} filled={isFavorite} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isWornToday ? "Remove today's wear entry" : 'Wear today'}
            accessibilityState={{ selected: isWornToday }}
            onPress={handleToggleWornToday}
            disabled={deleting || wearBusy}
            hitSlop={8}
            className="active:opacity-60"
            style={{ minWidth: ACTION_TOUCH_TARGET, minHeight: ACTION_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' }}
          >
            {isWornToday ? (
              <CheckIcon size={ACTION_ICON_SIZE} color={deleting || wearBusy ? inkDisabled : inkPrimary} />
            ) : (
              <CalendarIcon size={ACTION_ICON_SIZE} color={deleting || wearBusy ? inkDisabled : inkPrimary} />
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete Fit"
            onPress={handleDeletePress}
            disabled={deleting || favoriteBusy || wearBusy}
            hitSlop={8}
            className="active:opacity-60"
            style={{ minWidth: ACTION_TOUCH_TARGET, minHeight: ACTION_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' }}
          >
            {deleting ? <ActivityIndicator size="small" /> : <TrashIcon size={ACTION_ICON_SIZE} color={inkPrimary} />}
          </Pressable>
        </View>
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 12 }}
        contentContainerClassName="px-gutter pt-3"
      >
        {/* Not shown in the zero-live-item empty state above -- a "Removed" row list would contradict its own "no items left" message. */}
        {!isEmptyFit && fitItems && fitItems.length > 0 ? (
          <>
            <SectionLabel>Items</SectionLabel>
            <FitItemsList items={fitItems} />
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
