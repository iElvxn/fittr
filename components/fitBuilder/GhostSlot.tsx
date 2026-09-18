import { Pressable, View, useColorScheme } from 'react-native';

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
  /**
   * Opens the catalog sheet pre-filtered to this slot's category. Omitted in
   * `TemplatePicker`'s small preview cards, where the whole card previews a
   * template but isn't itself tappable (a separate "Use this template"
   * button selects it) -- there, the badge renders as a plain, non-focusable
   * view instead of a button nobody can meaningfully press.
   */
  onPress?: () => void;
};

/**
 * A category's unfilled-slot marker: a garment silhouette (sized per the
 * template's own slot definition) with a "+" badge and label centered on it,
 * matching a user-provided reference's layout. The badge+label area is the
 * tappable surface (not the full silhouette bleed) so it doesn't compete with
 * dragging a placed item that overlaps this slot's silhouette region.
 */
export function GhostSlot({
  category,
  containerWidth,
  containerHeight,
  x,
  y,
  width = 0,
  height = 0,
  onPress,
}: Props) {
  const scheme = useColorScheme();
  const silhouetteColor = scheme === 'dark' ? colors.dark.borderHairline : colors.light.borderHairline;

  return (
    <View style={{ position: 'absolute', left: x * containerWidth, top: y * containerHeight }}>
      {width > 0 && height > 0 ? (
        <View
          pointerEvents="none"
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
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Add ${CATEGORY_LABELS[category]}`}
          onPress={onPress}
          hitSlop={8}
          style={{ alignItems: 'center', width: 84, marginLeft: -42 }}
        >
          {({ pressed }) => (
            <GhostSlotBadge category={category} pressed={pressed} />
          )}
        </Pressable>
      ) : (
        <View style={{ alignItems: 'center', width: 84, marginLeft: -42 }}>
          <GhostSlotBadge category={category} pressed={false} />
        </View>
      )}
    </View>
  );
}

function GhostSlotBadge({ category, pressed }: { category: WardrobeItemCategory; pressed: boolean }) {
  return (
    <>
      <View
        style={{
          shadowColor: '#000',
          shadowOpacity: 0.08,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
          elevation: 2,
          opacity: pressed ? 0.6 : 1,
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
    </>
  );
}
