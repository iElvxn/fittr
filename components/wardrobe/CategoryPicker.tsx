import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { CATEGORY_OPTIONS, type WardrobeItemCategory } from '@/lib/wardrobe/addItem';

type Props = {
  value: WardrobeItemCategory;
  onChange: (category: WardrobeItemCategory) => void;
};

/** Category chip row shared by the batch-review editor and the item-detail edit form. */
export function CategoryPicker({ value, onChange }: Props) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {CATEGORY_OPTIONS.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
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
                  ? 'text-surface-base dark:text-surface-baseDark'
                  : 'text-ink-primary dark:text-ink-primaryDark'
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
