import { PixelRatio, Pressable, TextInput, View, useColorScheme } from 'react-native';

import { CloseIcon } from '@/components/ui/icons/CloseIcon';
import { SearchIcon } from '@/components/ui/icons/SearchIcon';
import { colors } from '@/lib/theme/colors';
import { typeScale } from '@/lib/theme/fonts';

const FIELD_HEIGHT = 44;

type Props = {
  value: string;
  onChangeText: (value: string) => void;
};

/**
 * My Closet's on-device search. A control, so square (`rounded-sm`) on
 * `surface-raised` with a hairline border. Placeholder uses `ink-secondary`,
 * which meets AA on `surface-raised` in both modes. Scales its text with the
 * user's font-scale setting the same way the shared `Text` component does,
 * growing past 44pt rather than clipping at large Dynamic Type sizes.
 */
export function ClosetSearchField({ value, onChangeText }: Props) {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;
  const scale = PixelRatio.getFontScale();
  const { fontFamily, fontSize } = typeScale.body;

  return (
    <View
      style={{ minHeight: FIELD_HEIGHT }}
      className="flex-row items-center rounded-sm border border-border-hairline bg-surface-raised pl-3 dark:border-border-hairlineDark dark:bg-surface-raisedDark"
    >
      <SearchIcon size={16} color={palette.inkSecondary} />
      <TextInput
        testID="closet-search-input"
        accessibilityLabel="Search your closet by name or brand"
        value={value}
        onChangeText={onChangeText}
        placeholder="Search by name or brand"
        placeholderTextColor={palette.inkSecondary}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="never"
        allowFontScaling={false}
        selectionColor={palette.inkPrimary}
        style={{
          flex: 1,
          minHeight: FIELD_HEIGHT - 2,
          paddingVertical: 0,
          paddingHorizontal: 10,
          fontFamily,
          fontSize: fontSize * scale,
          color: palette.inkPrimary,
        }}
      />
      {value.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          onPress={() => onChangeText('')}
          hitSlop={8}
          style={{ width: FIELD_HEIGHT - 2, height: FIELD_HEIGHT - 2 }}
          className="items-center justify-center"
        >
          <CloseIcon size={14} color={palette.inkSecondary} />
        </Pressable>
      ) : (
        <View style={{ width: 12 }} />
      )}
    </View>
  );
}
