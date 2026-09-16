import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import { Image } from 'expo-image';

import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { CATEGORY_OPTIONS, type WardrobeItemCategory } from '@/lib/wardrobe/addItem';
import type { BatchItem } from '@/stores/wardrobeCapture';

const CATEGORY_LABELS = Object.fromEntries(CATEGORY_OPTIONS.map((option) => [option.value, option.label])) as Record<
  WardrobeItemCategory,
  string
>;

/**
 * A small curated palette, not a full color picker -- matches Story 2.1's
 * "color swatches" wording. Each swatch carries a human-readable name for
 * its accessibility label -- without one, a screen reader would read the
 * raw hex digits aloud.
 */
const COLOR_SWATCHES: { hex: string; name: string }[] = [
  { hex: '#0C0A09', name: 'Black' },
  { hex: '#FFFFFF', name: 'White' },
  { hex: '#78716C', name: 'Gray' },
  { hex: '#1E3A8A', name: 'Navy' },
  { hex: '#DBEAFE', name: 'Light blue' },
  { hex: '#78350F', name: 'Brown' },
  { hex: '#D6D3D1', name: 'Beige' },
  { hex: '#7F1D1D', name: 'Red' },
  { hex: '#EA580C', name: 'Orange' },
  { hex: '#CA8A04', name: 'Yellow' },
  { hex: '#166534', name: 'Green' },
  { hex: '#4C1D95', name: 'Purple' },
  { hex: '#DB2777', name: 'Pink' },
];

type Props = {
  item: BatchItem;
  onToggleExpand: (id: string) => void;
  onRetake: (id: string) => void;
  onCategoryChange: (id: string, category: WardrobeItemCategory) => void;
  onColorChange: (id: string, colorHex: string) => void;
  onNameChange: (id: string, name: string) => void;
  onBrandChange: (id: string, brand: string) => void;
  onNotesChange: (id: string, notes: string) => void;
};

/**
 * One item in the batch queue/review screen -- collapsed by default to a
 * thumbnail + status, expandable to the full category/color/fields editor.
 * Showing every item's full editor open at once (as Story 2.1's single-item
 * screen does) would overwhelm a 10-item batch; this is progressive
 * disclosure instead. Reused for both single-item (batch-of-one) and
 * multi-item review.
 */
export function BatchQueueRow({
  item,
  onToggleExpand,
  onRetake,
  onCategoryChange,
  onColorChange,
  onNameChange,
  onBrandChange,
  onNotesChange,
}: Props) {
  const label = CATEGORY_LABELS[item.category];

  if (item.status === 'processing') {
    return (
      <View
        accessible
        accessibilityLabel="Processing photo"
        className="flex-row items-center border-b border-border-hairline py-4 dark:border-border-hairlineDark"
      >
        <ActivityIndicator />
        <Text variant="meta" className="ml-3 text-ink-secondary dark:text-ink-secondaryDark">
          Processing…
        </Text>
      </View>
    );
  }

  if (item.status === 'error') {
    return (
      <View className="border-b border-border-hairline py-4 dark:border-border-hairlineDark">
        <Text variant="meta" className="mb-3 text-destructive dark:text-destructiveDark">
          {item.errorMessage}
        </Text>
        <Button title="Retake" onPress={() => onRetake(item.id)} />
      </View>
    );
  }

  return (
    <View className="border-b border-border-hairline py-4 dark:border-border-hairlineDark">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={item.expanded ? `Collapse ${label}` : `Expand ${label}`}
        accessibilityState={{ expanded: item.expanded }}
        onPress={() => onToggleExpand(item.id)}
        className="flex-row items-center"
      >
        {item.cutoutUri ? (
          <Image
            testID="batch-row-cutout"
            accessibilityLabel="Captured item"
            source={{ uri: item.cutoutUri }}
            style={{ width: 56, height: 56 }}
            contentFit="contain"
          />
        ) : null}
        <Text variant="body" className="ml-3 text-ink-primary dark:text-ink-primaryDark">
          {label}
        </Text>
      </Pressable>

      {item.expanded ? (
        <View className="mt-4">
          <View className="flex-row flex-wrap gap-2">
            {CATEGORY_OPTIONS.map((option) => {
              const selected = option.value === item.category;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => onCategoryChange(item.id, option.value)}
                  className={[
                    'rounded-sm border px-4 py-2',
                    selected
                      ? 'border-ink-primary bg-ink-primary dark:border-ink-primaryDark dark:bg-ink-primaryDark'
                      : 'border-border-hairline dark:border-border-hairlineDark',
                  ].join(' ')}
                >
                  <Text
                    variant="body"
                    className={
                      selected
                        ? 'text-surface-raised dark:text-surface-baseDark'
                        : 'text-ink-primary dark:text-ink-primaryDark'
                    }
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View className="mt-4 flex-row flex-wrap gap-2">
            {COLOR_SWATCHES.map(({ hex, name }) => {
              const selected = hex.toLowerCase() === item.colorHex?.toLowerCase();
              return (
                <Pressable
                  key={hex}
                  accessibilityRole="button"
                  accessibilityLabel={name}
                  accessibilityState={{ selected }}
                  onPress={() => onColorChange(item.id, hex)}
                  hitSlop={8}
                  className={[
                    'h-8 w-8 rounded-full border',
                    selected
                      ? 'border-2 border-ink-primary dark:border-ink-primaryDark'
                      : 'border-border-hairline dark:border-border-hairlineDark',
                  ].join(' ')}
                  style={{ backgroundColor: hex }}
                />
              );
            })}
          </View>

          <View className="mt-4">
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
