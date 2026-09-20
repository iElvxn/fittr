import { DarkTheme, DefaultTheme, type Theme } from 'expo-router';

import { colors } from '@/lib/theme/colors';

/**
 * React Navigation's own default themes fill screen/tab-bar chrome with
 * their stock colors, not this app's -- this is what shows through in the
 * gaps around the floating tab bar pill unless overridden here.
 */
export const navigationLightTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.light.inkPrimary,
    background: colors.light.surfaceBase,
    card: colors.light.surfaceRaised,
    text: colors.light.inkPrimary,
    border: colors.light.borderHairline,
    notification: colors.light.destructive,
  },
};

export const navigationDarkTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.dark.inkPrimary,
    background: colors.dark.surfaceBase,
    card: colors.dark.surfaceRaised,
    text: colors.dark.inkPrimary,
    border: colors.dark.borderHairline,
    notification: colors.dark.destructive,
  },
};
