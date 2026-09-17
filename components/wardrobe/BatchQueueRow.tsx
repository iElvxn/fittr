import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import { Image } from 'expo-image';

import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { CategoryPicker } from '@/components/wardrobe/CategoryPicker';
import { ColorSwatchPicker } from '@/components/wardrobe/ColorSwatchPicker';
import { SectionLabel } from '@/components/wardrobe/SectionLabel';
import { CATEGORY_LABELS, type WardrobeItemCategory } from '@/lib/wardrobe/addItem';
import type { BatchItem } from '@/stores/wardrobeCapture';

const THUMB_SIZE = 88;

type Props = {
  item: BatchItem;
  onToggleExpand: (id: string) => void;
  onRetake: (id: string) => void;
  onRemove: (id: string) => void;
  onCategoryChange: (id: string, category: WardrobeItemCategory) => void;
  onColorChange: (id: string, colorHex: string) => void;
  onNameChange: (id: string, name: string) => void;
  onBrandChange: (id: string, brand: string) => void;
  onNotesChange: (id: string, notes: string) => void;
};

/**
 * A small "x" -- not a swipe gesture, and not behind a confirmation dialog
 * (unlike deleting a *saved* wardrobe item elsewhere in the app): nothing
 * here is persisted yet, and removing a photo by mistake is trivially
 * undone by recapturing/re-picking it. Available regardless of the item's
 * status, including mid-processing or errored.
 */
function RemoveButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Remove" onPress={onPress} hitSlop={12} className="p-1">
      <Text variant="label" className="text-destructive dark:text-destructiveDark" style={{ fontSize: 24, lineHeight: 24 }}>
        ×
      </Text>
    </Pressable>
  );
}

/**
 * One item in the batch queue/review screen -- collapsed by default to a
 * thumbnail + status, expandable to the full category/color/fields editor.
 * Showing every item's full editor open at once (as Story 2.1's single-item
 * screen does) would overwhelm a 10-item batch; this is progressive
 * disclosure instead. Reused for both single-item (batch-of-one) and
 * multi-item review.
 *
 * Renders as a raised card (tonal-difference elevation, `rounded.md` per
 * DESIGN.md) rather than a flat hairline-divided list row -- a visible card
 * reads as an interactive surface the way a 1px divider doesn't.
 */
export function BatchQueueRow({
  item,
  onToggleExpand,
  onRetake,
  onRemove,
  onCategoryChange,
  onColorChange,
  onNameChange,
  onBrandChange,
  onNotesChange,
}: Props) {
  const label = CATEGORY_LABELS[item.category];

  if (item.status === 'processing') {
    return (
      <View className="mb-4 flex-row items-center justify-between rounded-md bg-surface-raised p-5 dark:bg-surface-raisedDark">
        <View accessible accessibilityLabel="Processing photo" className="flex-row items-center">
          <ActivityIndicator />
          <Text variant="meta" className="ml-3 text-ink-secondary dark:text-ink-secondaryDark">
            Processing…
          </Text>
        </View>
        <RemoveButton onPress={() => onRemove(item.id)} />
      </View>
    );
  }

  if (item.status === 'error') {
    return (
      <View className="mb-4 rounded-md bg-surface-raised p-5 dark:bg-surface-raisedDark">
        <View className="flex-row items-start justify-between">
          <Text variant="meta" className="mb-3 flex-1 text-destructive dark:text-destructiveDark">
            {item.errorMessage}
          </Text>
          <RemoveButton onPress={() => onRemove(item.id)} />
        </View>
        <Button title="Retake" onPress={() => onRetake(item.id)} />
      </View>
    );
  }

  return (
    <View className="mb-4 rounded-md bg-surface-raised p-5 dark:bg-surface-raisedDark">
      <View className="flex-row items-center justify-between">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={item.expanded ? `Collapse ${label}` : `Expand ${label}`}
          accessibilityState={{ expanded: item.expanded }}
          onPress={() => onToggleExpand(item.id)}
          className="flex-1 flex-row items-center"
        >
          {item.cutoutUri ? (
            <Image
              testID="batch-row-cutout"
              accessibilityLabel="Captured item"
              source={{ uri: item.cutoutUri }}
              style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
              contentFit="contain"
            />
          ) : null}
          <Text variant="title" className="ml-4 flex-1 text-ink-primary dark:text-ink-primaryDark">
            {label}
          </Text>
          <Text
            variant="label"
            className="mr-1 text-ink-secondary dark:text-ink-secondaryDark"
            style={{ fontSize: 20, lineHeight: 22 }}
          >
            {item.expanded ? '▴' : '▾'}
          </Text>
        </Pressable>
        <RemoveButton onPress={() => onRemove(item.id)} />
      </View>

      {item.expanded ? (
        <View className="mt-5">
          <SectionLabel>Category</SectionLabel>
          <CategoryPicker value={item.category} onChange={(category) => onCategoryChange(item.id, category)} />

          <View className="mt-5">
            <SectionLabel>Color</SectionLabel>
          </View>
          <ColorSwatchPicker value={item.colorHex} onChange={(hex) => onColorChange(item.id, hex)} />

          <View className="mt-5">
            <TextInput
              value={item.name}
              onChangeText={(value) => onNameChange(item.id, value)}
              placeholder="Name (optional)"
              accessibilityLabel="Item name"
              className="mb-3 rounded-sm border border-border-hairline px-4 py-3 font-[Montserrat_400Regular] text-ink-primary dark:border-border-hairlineDark dark:text-ink-primaryDark"
            />
            <TextInput
              value={item.brand}
              onChangeText={(value) => onBrandChange(item.id, value)}
              placeholder="Brand (optional)"
              accessibilityLabel="Item brand"
              className="mb-3 rounded-sm border border-border-hairline px-4 py-3 font-[Montserrat_400Regular] text-ink-primary dark:border-border-hairlineDark dark:text-ink-primaryDark"
            />
            <TextInput
              value={item.notes}
              onChangeText={(value) => onNotesChange(item.id, value)}
              placeholder="Notes (optional)"
              multiline
              accessibilityLabel="Item notes"
              className="mb-3 rounded-sm border border-border-hairline px-4 py-3 font-[Montserrat_400Regular] text-ink-primary dark:border-border-hairlineDark dark:text-ink-primaryDark"
            />
          </View>

          <Button title="Retake" onPress={() => onRetake(item.id)} />
        </View>
      ) : null}
    </View>
  );
}
