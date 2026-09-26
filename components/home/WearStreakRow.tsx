import { View } from 'react-native';

import { Text } from '@/components/ui/Text';

type Props = {
  /** Always at least 1 -- Home hides the row at 0. */
  days: number;
  includesToday: boolean;
};

/**
 * Story 4.4's wear streak: passive, plain numerals, no flame, nudge or
 * celebration (DESIGN.md's wear-streak counter).
 */
export function WearStreakRow({ days, includesToday }: Props) {
  return (
    <View className="flex-row items-end justify-between gap-4 border-t border-border-hairline pt-4 dark:border-border-hairlineDark">
      <View className="shrink gap-1">
        <Text variant="caption" className="text-ink-secondary dark:text-ink-secondaryDark">
          Wear streak
        </Text>
        <Text variant="title" className="text-ink-primary dark:text-ink-primaryDark">
          {days === 1 ? '1 day' : `${days} days`}
        </Text>
      </View>
      <Text variant="meta" className="shrink pb-1 text-right text-ink-secondary dark:text-ink-secondaryDark">
        {includesToday ? 'In a row, including today' : 'In a row, through yesterday'}
      </Text>
    </View>
  );
}
