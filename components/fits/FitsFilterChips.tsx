import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/Text';

export type FitsFilter = 'all' | 'favorites' | 'worn';

const OPTIONS: { value: FitsFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'favorites', label: 'Favorites' },
  { value: 'worn', label: 'Worn' },
];

type Props = {
  selected: FitsFilter;
  onSelect: (value: FitsFilter) => void;
};

/**
 * Fits-scoped counterpart to `components/wardrobe/CategoryFilterChips.tsx`
 * -- kept as its own component rather than generalizing that one, matching
 * the existing per-domain split between `components/fits` and
 * `components/wardrobe`. Same fill-vs-outline selected state, never color,
 * per DESIGN.md.
 */
export function FitsFilterChips({ selected, onSelect }: Props) {
  return (
    <View className="flex-row gap-2 px-gutter">
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
              variant="caption"
              className={
                isSelected
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
