import { useEffect, useRef, useState } from 'react';
import { Pressable, View, useColorScheme } from 'react-native';
import { Image } from 'expo-image';
import { useQueryClient } from '@tanstack/react-query';

import { Text } from '@/components/ui/Text';
import { HeartIcon } from '@/components/ui/icons/HeartIcon';
import { useImageAspectRatio } from '@/lib/theme/useImageAspectRatio';
import { toggleFitFavorite } from '@/lib/fits/toggleFavorite';
import { FitError } from '@/lib/fits/errors';
import { Sentry } from '@/lib/observability/sentry';
import { colors } from '@/lib/theme/colors';

const DEFAULT_ASPECT_RATIO = 3 / 4;
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
};

/**
 * Fit covers aren't captured at a fixed size and the app doesn't persist
 * their dimensions, so height starts at a portrait guess and settles to the
 * cover's real aspect ratio once the image reports its own size -- that's
 * what gives the columns their uneven, Pinterest-board look instead of
 * forcing every cover into a square crop.
 *
 * The name sits below the photo, not overlaid on it -- DESIGN.md's grid
 * cell rule is "no card chrome" on the photography itself. The favorite
 * heart is the one deliberate exception (Story 4.2 fast-follow): DESIGN.md's
 * own favorite-indicator convention already lives on top of content
 * elsewhere (the Fit detail action row), and Depop/Pinterest (Mobbin) both
 * place this exact affordance directly over the photo, behind a small
 * semi-transparent circular backing for legibility rather than a full pill.
 */
export function FitsGridCell({ name, thumbnailUrl, columnWidth, onPress, fitId, isFavorite, userId }: Props) {
  const { aspectRatio, handleLoad } = useImageAspectRatio(DEFAULT_ASPECT_RATIO);
  const height = columnWidth / aspectRatio;
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
      accessibilityLabel={name}
      onPress={onPress}
      style={{ width: columnWidth }}
      className="active:opacity-80"
    >
      <View
        style={{ width: columnWidth, height }}
        className="overflow-hidden rounded-lg bg-surface-raised dark:bg-surface-baseDark"
      >
        {thumbnailUrl ? (
          <Image
            testID="fits-grid-thumbnail-image"
            accessibilityLabel=""
            source={{ uri: thumbnailUrl }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            onLoad={handleLoad}
          />
        ) : (
          <View testID="fits-grid-thumbnail-fallback" className="h-full w-full bg-surface-raised dark:bg-surface-baseDark" />
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
      <Text variant="meta" numberOfLines={1} className="mt-1.5 text-ink-secondary dark:text-ink-secondaryDark">
        {name}
      </Text>
    </Pressable>
  );
}
