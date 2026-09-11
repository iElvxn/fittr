import { Text as RNText, useColorScheme } from 'react-native';

import { colors } from '@/lib/theme/colors';

/**
 * The platform-standard Apple mark: U+F8FF renders as the Apple logo glyph
 * specifically in San Francisco (iOS's system font), so this must NOT go
 * through the app's custom-font `Text` component. Monochrome — no color
 * exception here, unlike Google's logomark.
 */
export function AppleGlyph({ size = 16 }: { size?: number }) {
  const scheme = useColorScheme();
  const color = scheme === 'dark' ? colors.dark.inkPrimary : colors.light.inkPrimary;

  return (
    <RNText style={{ fontSize: size, color, lineHeight: size + 2 }} allowFontScaling={false}>
      {''}
    </RNText>
  );
}
