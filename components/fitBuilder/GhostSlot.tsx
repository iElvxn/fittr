import { View, useColorScheme } from 'react-native';

import { Text } from '@/components/ui/Text';
import { GarmentSilhouette } from '@/components/fitBuilder/GarmentSilhouette';
import { CATEGORY_LABELS, type WardrobeItemCategory } from '@/lib/wardrobe/addItem';
import { colors } from '@/lib/theme/colors';

type Props = {
  category: WardrobeItemCategory;
  /** Container this slot is positioned within -- a template preview card or the live canvas. */
  containerWidth: number;
  containerHeight: number;
  /** Slot center, as 0-1 fractions of the container. */
  x: number;
  y: number;
  /** Silhouette size, as 0-1 fractions of the container -- 0 (or omitted) renders no silhouette, just the badge. */
  width?: number;
  height?: number;
};

/**
 * A category's unfilled-slot marker: a garment silhouette (sized per the
 * template's own slot definition) with a "+" badge and label centered on it,
 * matching a user-provided reference's layout. Purely illustrative -- adding
 * an item for this category still goes through the category tray, this
 * renders nothing interactive.
 */
export function GhostSlot({ category, containerWidth, containerHeight, x, y, width = 0, height = 0 }: Props) {
  const scheme = useColorScheme();
  const silhouetteColor = scheme === 'dark' ? colors.dark.borderHairline : colors.light.borderHairline;

  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: x * containerWidth, top: y * containerHeight }}
    >
      {width > 0 && height > 0 ? (
        <View
          style={{
            position: 'absolute',
            left: -(width * containerWidth) / 2,
            top: -(height * containerHeight) / 2,
          }}
        >
          <GarmentSilhouette
            category={category}
            width={width * containerWidth}
            height={height * containerHeight}
            color={silhouetteColor}
          />
        </View>
      ) : null}
      <View style={{ alignItems: 'center', width: 84, marginLeft: -42 }}>
        <View
          style={{
            shadowColor: '#000',
            shadowOpacity: 0.08,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 2 },
            elevation: 2,
          }}
          className="h-11 w-11 items-center justify-center rounded-full border border-border-hairline bg-surface-raised dark:border-border-hairlineDark dark:bg-surface-raisedDark"
        >
          <Text variant="title" className="text-ink-secondary dark:text-ink-secondaryDark">
            +
          </Text>
        </View>
        <Text variant="label" className="mt-2 text-center text-ink-secondary dark:text-ink-secondaryDark">
          {CATEGORY_LABELS[category]}
        </Text>
      </View>
    </View>
  );
}
