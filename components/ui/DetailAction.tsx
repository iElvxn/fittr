import type { ReactNode } from 'react';
import { Pressable, useWindowDimensions } from 'react-native';

import { Text } from '@/components/ui/Text';

export const ACTION_ICON_SIZE = 22;
export const ACTION_TOUCH_TARGET = 44;
const CAPTION_FONT_SIZE = 10;
const CAPTION_LINE_HEIGHT = 14;

type DetailActionProps = {
  /** VoiceOver label -- the full action, which can differ from the short visible caption. */
  label: string;
  caption: string;
  onPress: () => void;
  disabled: boolean;
  selected?: boolean;
  /**
   * `'destructive'` colors the caption with the `destructive` token (Item
   * detail's Delete). The icon is the caller's child, so the caller colors
   * it to match.
   */
  tone?: 'destructive';
  children: ReactNode;
};

function captionClassName(disabled: boolean, tone: DetailActionProps['tone']) {
  if (disabled) {
    return 'mt-1.5 text-center uppercase text-ink-disabled dark:text-ink-disabledDark';
  }
  if (tone === 'destructive') {
    return 'mt-1.5 text-center uppercase text-destructive dark:text-destructiveDark';
  }
  return 'mt-1.5 text-center uppercase text-ink-secondary dark:text-ink-secondaryDark';
}

/**
 * One captioned action for a detail screen's hairline action row (Fit
 * detail, Item detail): icon over a tiny tracked uppercase caption. The
 * caption is visual only -- `accessibilityLabel` carries the spoken name,
 * so VoiceOver doesn't read both.
 */
export function DetailAction({ label, caption, onPress, disabled, selected, tone, children }: DetailActionProps) {
  // Reactive (unlike `PixelRatio.getFontScale()`), so a Dynamic Type change
  // while this screen is open re-renders the captions at the new size.
  const { fontScale: scale } = useWindowDimensions();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      // Equal-width columns (`flex-1`) rather than a fixed min width, so four
      // actions always fit the row; at large Dynamic Type sizes a caption
      // wraps to a second line instead of truncating or overflowing.
      className="flex-1 items-center justify-center active:opacity-60"
      style={{ minHeight: ACTION_TOUCH_TARGET, paddingVertical: 6 }}
    >
      {children}
      <Text
        variant="meta"
        numberOfLines={2}
        className={captionClassName(disabled, tone)}
        style={{ fontSize: CAPTION_FONT_SIZE * scale, lineHeight: CAPTION_LINE_HEIGHT * scale, letterSpacing: 1.2 }}
      >
        {caption}
      </Text>
    </Pressable>
  );
}
