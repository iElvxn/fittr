import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { CATEGORY_OPTIONS, type WardrobeItemCategory } from '@/lib/wardrobe/addItem';

type Props = {
  value: WardrobeItemCategory;
  onChange: (category: WardrobeItemCategory) => void;
};

/**
 * Category chip row shared by the batch-review editor and the item-detail
 * edit form. Square `caption` chips (DESIGN.md's chip component): selected
 * is an ink fill with inverse text, unselected a hairline outline with
 * `ink-secondary` text -- fill-vs-outline, never color. The chip is 32pt
 * tall; the vertical `hitSlop` brings its touch target to 44pt.
 */
export function CategoryPicker({ value, onChange }: Props) {
  return (
    <View className="flex-row flex-wrap gap-x-1.5 gap-y-3">
      {CATEGORY_OPTIONS.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            hitSlop={{ top: 6, bottom: 6 }}
            className={[
              'min-h-8 justify-center rounded-sm border px-3',
              selected
                ? 'border-ink-primary bg-ink-primary dark:border-ink-primaryDark dark:bg-ink-primaryDark'
                : 'border-border-hairline bg-transparent dark:border-border-hairlineDark',
            ].join(' ')}
          >
            <Text
              variant="caption"
              className={
                selected
                  ? 'text-surface-base dark:text-surface-baseDark'
                  : 'text-ink-secondary dark:text-ink-secondaryDark'
              }
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
