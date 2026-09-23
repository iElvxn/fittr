import { ActivityIndicator, Pressable, type PressableProps, useColorScheme } from 'react-native';

import { Text } from '@/components/ui/Text';
import { colors } from '@/lib/theme/colors';

type Props = PressableProps & {
  title: string;
  variant?: 'primary' | 'secondary';
  loading?: boolean;
  leftIcon?: React.ReactNode;
};

/**
 * Primary: solid `ink-primary` fill with `surface-base` text in both modes
 * (the inverse pair -- in dark mode the ink is light, so the text goes
 * dark). One per screen. Secondary: ink outline, transparent fill.
 * Hierarchy comes from fill-vs-outline alone -- DESIGN.md has no accent.
 * Square (`rounded-sm`, 2px) like every control; label in the tracked,
 * uppercase `caption` role; 48pt minimum height.
 */
export function Button({ title, variant = 'secondary', loading, leftIcon, disabled, ...props }: Props) {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;
  const isPrimary = variant === 'primary';
  const isDisabled = Boolean(disabled) || Boolean(loading);

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      className={[
        'min-h-12 flex-row items-center justify-center rounded-sm px-6 py-3',
        isPrimary
          ? 'bg-ink-primary dark:bg-ink-primaryDark'
          : 'border border-ink-primary bg-transparent dark:border-ink-primaryDark',
        isDisabled ? 'opacity-50' : '',
      ].join(' ')}
      {...props}
    >
      {loading ? (
        <ActivityIndicator testID="button-spinner" color={isPrimary ? palette.surfaceBase : palette.inkPrimary} />
      ) : (
        <>
          {leftIcon ? <>{leftIcon}</> : null}
          <Text
            variant="caption"
            className={[
              leftIcon ? 'ml-2' : '',
              isPrimary
                ? 'text-surface-base dark:text-surface-baseDark'
                : 'text-ink-primary dark:text-ink-primaryDark',
            ].join(' ')}
          >
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}
