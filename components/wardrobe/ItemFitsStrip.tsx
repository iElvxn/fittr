import { PixelRatio, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';

import { Text } from '@/components/ui/Text';
import { useThumbnailUrls } from '@/lib/wardrobe/thumbnailUrls';
import type { FitRow } from '@/lib/fits/listFits';

const TILE_WIDTH = 108;
/** Same fixed 3:4 as the My Fits grid tile. */
const TILE_HEIGHT = TILE_WIDTH * (4 / 3);
const TILE_GAP = 10;
/** The mockup's strip name size -- `title`'s serif, scaled down for a small tile. */
const NAME_FONT_SIZE = 15;
const NAME_LINE_HEIGHT = 19;

type Props = {
  fits: FitRow[];
};

/**
 * Item detail's "In N Fits" strip: a horizontal row of small 3:4 tiles,
 * each filled with the Fit's own canvas color (`surface-raised` when it has
 * none) with the cover contained on it -- the same fill as
 * `FitsGridCell`, so no seam shows around a cover. The Fit name sits below
 * the tile in serif; tapping a tile opens Fit detail.
 */
export function ItemFitsStrip({ fits }: Props) {
  const fontScale = PixelRatio.getFontScale();
  const coverPaths = fits.flatMap((fit) => (fit.cover_path ? [fit.cover_path] : []));
  const { data: thumbnailUrls } = useThumbnailUrls(coverPaths);

  return (
    <ScrollView
      testID="item-fits-strip"
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="px-gutter"
      contentContainerStyle={{ gap: TILE_GAP }}
    >
      {fits.map((fit) => {
        const coverUrl = fit.cover_path ? (thumbnailUrls?.[fit.cover_path] ?? null) : null;
        return (
          <Pressable
            key={fit.id}
            accessibilityRole="button"
            accessibilityLabel={fit.name}
            onPress={() => router.push({ pathname: '/fit/[id]', params: { id: fit.id } })}
            style={{ width: TILE_WIDTH }}
            className="active:opacity-80"
          >
            <View
              testID="item-fits-tile"
              style={[
                { width: TILE_WIDTH, height: TILE_HEIGHT },
                fit.canvas_background_color ? { backgroundColor: fit.canvas_background_color } : null,
              ]}
              className={
                fit.canvas_background_color
                  ? 'overflow-hidden rounded-lg'
                  : 'overflow-hidden rounded-lg bg-surface-raised dark:bg-surface-raisedDark'
              }
            >
              {coverUrl ? (
                <Image
                  testID="item-fits-cover"
                  accessibilityLabel=""
                  source={{ uri: coverUrl }}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="contain"
                />
              ) : null}
            </View>
            <Text
              variant="title"
              numberOfLines={1}
              style={{ fontSize: NAME_FONT_SIZE * fontScale, lineHeight: NAME_LINE_HEIGHT * fontScale }}
              className="mt-2 px-0.5 text-ink-primary dark:text-ink-primaryDark"
            >
              {fit.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
