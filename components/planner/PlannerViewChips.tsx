import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import type { PlannerView } from '@/lib/planner/viewPreference';

const OPTIONS: { value: PlannerView; label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

type Props = {
  selected: PlannerView;
  onSelect: (value: PlannerView) => void;
};

/**
 * The Planner's Week/Month switch -- the same chips as
 * `components/fits/FitsFilterChips.tsx`, kept per-domain like that one.
 * Selected is fill vs outline, never color.
 */
export function PlannerViewChips({ selected, onSelect }: Props) {
  return (
    <View className="flex-row gap-2 px-gutter pt-4">
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
