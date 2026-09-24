import { useEffect, useRef, useState } from 'react';
import { PixelRatio, Pressable, View, useColorScheme } from 'react-native';
import { Image } from 'expo-image';
import { useQueryClient } from '@tanstack/react-query';

import { Text } from '@/components/ui/Text';
import { HeartIcon } from '@/components/ui/icons/HeartIcon';
import { toggleFitFavorite } from '@/lib/fits/toggleFavorite';
import { FitError } from '@/lib/fits/errors';
import { Sentry } from '@/lib/observability/sentry';
import { colors } from '@/lib/theme/colors';

/** Height ÷ width of every My Fits tile (4:5); shared with `FitsGridSkeleton`. */
export const TILE_HEIGHT_RATIO = 1.25;
/** The mockup's 2-column name size -- `title`'s serif, scaled down for a grid cell. */
const NAME_FONT_SIZE = 17;
const NAME_LINE_HEIGHT = 21;
const FAVORITE_ICON_SIZE = 14;
const FAVORITE_BADGE_SIZE = 28;
const FAVORITE_HIT_SLOP = 8;

type Props = {
  name: string;
  thumbnailUrl: string | null;
  columnWidth: number;
  onPress: () => void;
  fitId: string;
  isFavorite: boolean;
  userId: string | undefined;
  /** The Fit's `canvas_background_color`; null falls back to `surface-raised`. */
  backgroundColor: string | null;
  /** Line 2 under the name, e.g. "Worn 3×" or "Saved Sep 21". */
  meta: string;
};

/**
 * My Fits' grid tile: a fixed 4:5 well filled with the Fit's own canvas
 * color (`surface-raised` when it has none). The builder's canvas is
 * `flex-1`, so covers vary in shape by device; whatever its shape, the
 * cover is contained (letterboxed) -- never cropped -- on that same color,
 * so the rows stay aligned.
 *
 * The name and meta line sit below the well, never on it. The favorite
 * heart is the one deliberate exception (Story 4.2 fast-follow): DESIGN.md's
 * own favorite-indicator convention already lives on top of content
 * elsewhere (the Fit detail action row), and Depop/Pinterest (Mobbin) both
 * place this exact affordance directly over the photo, behind a small
 * semi-transparent circular backing for legibility rather than a full pill.
 */
export function FitsGridCell({
  name,
  thumbnailUrl,
  columnWidth,
  onPress,
  fitId,
  isFavorite,
  userId,
  backgroundColor,
  meta,
}: Props) {
  const height = columnWidth * TILE_HEIGHT_RATIO;
  const fontScale = PixelRatio.getFontScale();
  const queryClient = useQueryClient();
  const scheme = useColorScheme();
  const inkPrimary = scheme === 'dark' ? colors.dark.inkPrimary : colors.light.inkPrimary;
  const inkDisabled = scheme === 'dark' ? colors.dark.inkDisabled : colors.light.inkDisabled;

  // Optimistic override, same "null = trust the fetched value" shape as
  // `app/fit/[id].tsx`'s favorite toggle -- but with no reset-on-id-change
  // logic, since `fits.tsx`'s `FlatList` keys each cell by Fit id, giving
  // this component a stable instance per Fit rather than one instance
  // reused across different Fits.
  const [favoriteOverride, setFavoriteOverride] = useState<boolean | null>(null);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const favorite = favoriteOverride ?? isFavorite;

  // Unlike the detail screen (favoriting never removes it from its own
  // view), un-favoriting from a Favorites-filtered grid triggers a refetch
  // that can filter this exact cell out of the list -- unmounting it -- before
  // this handler's own `await` chain resumes. Guards the post-await
  // `setState` calls below from firing after that unmount.
  const isMounted = useRef(true);
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  async function handleToggleFavorite() {
    if (favoriteBusy) {
      return;
    }
    const next = !favorite;
    setFavoriteOverride(next);
    setFavoriteBusy(true);
    try {
      await toggleFitFavorite(fitId, next);
      await queryClient.invalidateQueries({ queryKey: ['fits', userId] });
      if (isMounted.current) {
        setFavoriteOverride(null);
      }
    } catch (error) {
      // No screen-level error banner here (unlike the detail screen) -- a
      // multi-cell grid has no single slot for one. Fails open and reports
      // to Sentry, same "don't block the grid" precedent as the Worn-status
      // fetch in `app/(tabs)/fits.tsx`.
      if (!(error instanceof FitError && error.kind === 'no_connection')) {
        Sentry.captureException(error);
      }
      if (isMounted.current) {
        setFavoriteOverride(!next);
      }
    } finally {
      if (isMounted.current) {
        setFavoriteBusy(false);
      }
    }
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${meta}`}
      onPress={onPress}
      style={{ width: columnWidth }}
      className="active:opacity-80"
    >
      <View
        testID="fits-grid-tile"
        style={[{ width: columnWidth, height }, backgroundColor ? { backgroundColor } : null]}
        className={
          backgroundColor ? 'overflow-hidden rounded-lg' : 'overflow-hidden rounded-lg bg-surface-raised dark:bg-surface-raisedDark'
        }
      >
        {thumbnailUrl ? (
          <Image
            testID="fits-grid-thumbnail-image"
            accessibilityLabel=""
            source={{ uri: thumbnailUrl }}
            style={{ width: '100%', height: '100%' }}
            contentFit="contain"
          />
        ) : (
          <View testID="fits-grid-thumbnail-fallback" className="h-full w-full" />
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={favorite ? `Remove ${name} from favorites` : `Add ${name} to favorites`}
          accessibilityState={{ selected: favorite }}
          onPress={handleToggleFavorite}
          disabled={favoriteBusy}
          hitSlop={FAVORITE_HIT_SLOP}
          className="absolute right-2 top-2 items-center justify-center rounded-full bg-surface-raised/90 dark:bg-surface-raisedDark/90"
          style={{ width: FAVORITE_BADGE_SIZE, height: FAVORITE_BADGE_SIZE }}
        >
          <HeartIcon size={FAVORITE_ICON_SIZE} color={favoriteBusy ? inkDisabled : inkPrimary} filled={favorite} />
        </Pressable>
      </View>
      <View className="mt-2 px-0.5">
        <Text
          variant="title"
          numberOfLines={1}
          style={{ fontSize: NAME_FONT_SIZE * fontScale, lineHeight: NAME_LINE_HEIGHT * fontScale }}
          className="text-ink-primary dark:text-ink-primaryDark"
        >
          {name}
        </Text>
        <Text variant="caption" numberOfLines={1} className="mt-0.5 text-ink-secondary dark:text-ink-secondaryDark">
          {meta}
        </Text>
      </View>
    </Pressable>
  );
}
