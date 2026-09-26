import { PixelRatio, Pressable, useColorScheme, View } from 'react-native';
import { Image } from 'expo-image';

import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { CheckIcon } from '@/components/ui/icons/CheckIcon';
import { ConnectionErrorNotice } from '@/components/ConnectionErrorNotice';
import type { FitRow } from '@/lib/fits/listFits';
import { colors } from '@/lib/theme/colors';

const TILE_ASPECT_RATIO = 3 / 4;
const NAME_FONT_SIZE = 28;
const NAME_LINE_HEIGHT = 34;
const CHANGE_BUTTON_WIDTH = 104;

type Props = {
  fit: FitRow;
  coverUrl: string | null;
  /** "Planned for today · Worn 3×", or "Worn 4× · including today" once worn. */
  meta: string;
  isWornToday: boolean;
  /** A wear write is in flight: the toggle ignores taps until it settles. */
  busy: boolean;
  errorMessage: string | null;
  onOpen: () => void;
  onToggleWorn: () => void;
  onChange: () => void;
};

/**
 * Today's planned Fit on Home: a full-width 3:4 tile filled with the Fit's
 * canvas color (cover contained, as in the Planner), the serif name and a
 * meta line, then Mark worn and Change. Worn today is shown by fill vs
 * outline alone: the primary "Mark worn" becomes an outlined "Worn today"
 * that undoes the wear.
 */
export function TodayFitCard({ fit, coverUrl, meta, isWornToday, busy, errorMessage, onOpen, onToggleWorn, onChange }: Props) {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;
  const fontScale = PixelRatio.getFontScale();

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${fit.name}`}
        onPress={onOpen}
        style={[
          { width: '100%', aspectRatio: TILE_ASPECT_RATIO },
          fit.canvas_background_color ? { backgroundColor: fit.canvas_background_color } : null,
        ]}
        className={
          fit.canvas_background_color
            ? 'overflow-hidden rounded-lg active:opacity-90'
            : 'overflow-hidden rounded-lg bg-surface-raised active:opacity-90 dark:bg-surface-raisedDark'
        }
      >
        {coverUrl ? (
          <Image accessibilityLabel="" source={{ uri: coverUrl }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
        ) : null}
      </Pressable>

      <View className="gap-1 px-0.5 pt-4">
        <Text
          variant="title"
          style={{ fontSize: NAME_FONT_SIZE * fontScale, lineHeight: NAME_LINE_HEIGHT * fontScale }}
          className="text-ink-primary dark:text-ink-primaryDark"
        >
          {fit.name}
        </Text>
        <Text variant="caption" className="text-ink-secondary dark:text-ink-secondaryDark">
          {meta}
        </Text>
      </View>

      <View className="flex-row gap-2.5 pt-4">
        <View className="flex-1">
          {isWornToday ? (
            <Button
              title="Worn today"
              variant="secondary"
              accessibilityLabel="Worn today. Tap to undo"
              accessibilityState={{ selected: true, busy }}
              leftIcon={<CheckIcon size={15} color={palette.inkPrimary} />}
              onPress={busy ? undefined : onToggleWorn}
            />
          ) : (
            <Button
              title="Mark worn"
              variant="primary"
              accessibilityState={{ selected: false, busy }}
              leftIcon={<CheckIcon size={15} color={palette.surfaceBase} />}
              onPress={busy ? undefined : onToggleWorn}
            />
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change today's Fit"
          onPress={onChange}
          style={{ width: CHANGE_BUTTON_WIDTH }}
          className="min-h-12 items-center justify-center rounded-sm border border-border-hairline active:opacity-60 dark:border-border-hairlineDark"
        >
          <Text variant="caption" className="text-ink-primary dark:text-ink-primaryDark">
            Change
          </Text>
        </Pressable>
      </View>

      {errorMessage ? (
        <View className="pt-4">
          <ConnectionErrorNotice message={errorMessage} />
        </View>
      ) : null}
    </View>
  );
}
