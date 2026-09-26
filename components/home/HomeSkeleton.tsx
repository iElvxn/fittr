import { View } from 'react-native';

import { WEEK_TILE_HEIGHT } from './WeekStrip';

const BAR = 'rounded-sm bg-surface-tile dark:bg-surface-tileDark';

/**
 * Home's loading state, shaped like the loaded screen -- the 3:4 tile, name
 * and meta bars, the two buttons and the week strip -- on `surface-tile`
 * (EXPERIENCE.md's "never a bare spinner" rule). Hidden from screen
 * readers, since it carries no content.
 */
export function HomeSkeleton() {
  return (
    <View
      testID="home-skeleton"
      className="px-gutter pt-5"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={{ width: '100%', aspectRatio: 3 / 4 }} className="rounded-lg bg-surface-tile dark:bg-surface-tileDark" />
      <View className="gap-2 pt-4">
        <View style={{ width: '60%', height: 26 }} className={BAR} />
        <View style={{ width: '45%', height: 10 }} className={BAR} />
      </View>
      <View className="flex-row gap-2.5 pt-4">
        <View style={{ height: 48 }} className={`flex-1 ${BAR}`} />
        <View style={{ width: 104, height: 48 }} className={BAR} />
      </View>
      <View className="flex-row gap-1.5 pt-8">
        {Array.from({ length: 7 }, (_, index) => (
          <View key={index} style={{ height: WEEK_TILE_HEIGHT }} className="flex-1 rounded-md bg-surface-tile dark:bg-surface-tileDark" />
        ))}
      </View>
    </View>
  );
}
