import { Pressable, ScrollView } from 'react-native';

import { Text } from '@/components/ui/Text';
import { CATEGORY_OPTIONS, type WardrobeItemCategory } from '@/lib/wardrobe/addItem';

export type CategoryFilter = WardrobeItemCategory | 'all';

const OPTIONS: { value: CategoryFilter; label: string }[] = [{ value: 'all', label: 'All' }, ...CATEGORY_OPTIONS];

type Props = {
  selected: CategoryFilter;
  onSelect: (value: CategoryFilter) => void;
};

/**
 * Selected state is shown by fill-vs-outline (not color), same treatment as
 * `Button`'s primary/secondary variants -- per DESIGN.md's "never by color"
 * rule for active/selected states.
 */
export function CategoryFilterChips({ selected, onSelect }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="flex-row gap-2 px-gutter"
    >
      {OPTIONS.map((option) => {
        const isSelected = option.value === selected;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(option.value)}
            hitSlop={8}
            className={[
              'rounded-sm border px-4 py-2',
              isSelected
                ? 'border-ink-primary bg-ink-primary dark:border-ink-primaryDark dark:bg-ink-primaryDark'
                : 'border-border-hairline bg-transparent dark:border-border-hairlineDark',
            ].join(' ')}
          >
            <Text
              variant="label"
              className={
                isSelected
                  ? 'text-surface-raised dark:text-surface-baseDark'
                  : 'text-ink-secondary dark:text-ink-secondaryDark'
              }
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
