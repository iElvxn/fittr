import { useReducer } from 'react';
import { Pressable, View } from 'react-native';
import { Image, type ImageLoadEventData } from 'expo-image';

import { Text } from '@/components/ui/Text';
import { CATEGORY_LABELS, type WardrobeItemCategory } from '@/lib/wardrobe/addItem';

/** Inset between the photo well's edge and the cutout, so the garment sits inside the soft tile. */
export const TILE_PADDING = 10;

const MIN_ASPECT = 0.5;
const MAX_ASPECT = 1.6;

/**
 * Width ÷ height guesses per category, used until a thumbnail reports its
 * real size (and for tiles with no thumbnail URL at all).
 */
export const CATEGORY_DEFAULT_ASPECT: Record<WardrobeItemCategory, number> = {
  outerwear: 0.75,
  top: 0.85,
  bottom: 0.6,
  shoes: 1.4,
  accessory: 1.0,
};

/**
 * Module-level on purpose: FlashList recycles and remounts tiles as the
 * grid scrolls, and the category filter/search remount them too. Keeping
 * each thumbnail's measured aspect here means a tile that
 * has loaded once renders at its real height straight away afterwards,
 * instead of jumping from the category default again. Keyed by the stable
 * storage path, not the signed URL -- URLs are re-signed whenever the item
 * set changes and again near expiry, which would otherwise drop every
 * measurement (and grow the map without bound). Nothing is persisted
 * to the database -- cutouts are trimmed to the garment
 * (`lib/wardrobe/processImage.ts`), so the thumbnail's own size is the
 * garment's shape.
 */
const measuredAspects = new Map<string, number>();

/** Test-only: module state otherwise leaks between test cases. */
export function resetMeasuredAspectCache() {
  measuredAspects.clear();
}

export function clampAspect(aspect: number) {
  return Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, aspect));
}

/** Photo-well height for a tile `width` wide whose inset cutout has `aspect` (width ÷ height). */
export function closetTileHeight(width: number, aspect: number) {
  const inner = width - TILE_PADDING * 2;
  return inner / aspect + TILE_PADDING * 2;
}

type Props = {
  category: WardrobeItemCategory;
  name: string | null;
  brand: string | null;
  /** Stable storage path -- the key for the measured-aspect cache. */
  thumbPath: string;
  thumbnailUrl: string | null;
  width: number;
  onPress: () => void;
};

/**
 * My Closet's masonry tile: the cutout contained inside a soft
 * `surface-tile` well (DESIGN.md's photo treatment), then two text lines
 * under it -- never on the well, which isn't contrast-checked for text.
 * Line 1 is the name (or the category when unnamed); line 2 the brand, or
 * the category when there's a name but no brand. With neither, line 2 is
 * dropped so the category never shows twice.
 *
 * Tile height follows the cutout's own shape, measured on the device: it
 * starts at a per-category default, then snaps to the real aspect ratio
 * (clamped to 0.5–1.6) once `expo-image` reports the thumbnail's size.
 */
export function ClosetTile({ category, name, brand, thumbPath, thumbnailUrl, width, onPress }: Props) {
  // Aspect is read from the module cache on every render rather than held
  // in state, so a recycled tile given a new item never shows the previous
  // item's measurement. This just forces the re-render after a measurement.
  const [, bumpMeasured] = useReducer((count: number) => count + 1, 0);

  const categoryLabel = CATEGORY_LABELS[category];
  const trimmedName = name?.trim() || null;
  const trimmedBrand = brand?.trim() || null;
  const primaryLine = trimmedName ?? categoryLabel;
  const secondaryLine = trimmedBrand ?? (trimmedName ? categoryLabel : null);
  const accessibilityLabel = [trimmedName, trimmedBrand, categoryLabel].filter(Boolean).join(', ');

  const aspect = measuredAspects.get(thumbPath) ?? CATEGORY_DEFAULT_ASPECT[category];
  const height = closetTileHeight(width, aspect);

  function handleLoad(event: ImageLoadEventData) {
    const { url, width: sourceWidth, height: sourceHeight } = event.source;
    // A recycled tile can still receive the previous image's late `onLoad`
    // after its URL changed -- don't cache that shape under this item.
    if (url && url !== thumbnailUrl) {
      return;
    }
    if (!(sourceWidth > 0) || !(sourceHeight > 0)) {
      return;
    }
    const measured = clampAspect(sourceWidth / sourceHeight);
    if (measuredAspects.get(thumbPath) !== measured) {
      measuredAspects.set(thumbPath, measured);
      bumpMeasured();
    }
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={{ width }}
      className="active:opacity-80"
    >
      <View
        testID="closet-tile-well"
        style={{ width, height, padding: TILE_PADDING }}
        className="overflow-hidden rounded-lg bg-surface-tile dark:bg-surface-tileDark"
      >
        {thumbnailUrl ? (
          <Image
            testID="wardrobe-thumbnail-image"
            accessibilityLabel=""
            source={{ uri: thumbnailUrl }}
            style={{ width: '100%', height: '100%' }}
            contentFit="contain"
            recyclingKey={thumbnailUrl}
            onLoad={handleLoad}
          />
        ) : (
          <View testID="wardrobe-thumbnail-fallback" className="h-full w-full" />
        )}
      </View>
      <View className="mt-2 px-0.5">
        <Text variant="meta" numberOfLines={1} className="text-ink-primary dark:text-ink-primaryDark">
          {primaryLine}
        </Text>
        {secondaryLine ? (
          <Text variant="caption" numberOfLines={1} className="mt-0.5 text-ink-secondary dark:text-ink-secondaryDark">
            {secondaryLine}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
