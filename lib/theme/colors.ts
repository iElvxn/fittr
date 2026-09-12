/**
 * DESIGN.md's palette, for the handful of places a color must be a JS value
 * rather than a NativeWind className (e.g. `ActivityIndicator`'s `color`
 * prop). `useColorScheme` picks light vs. dark; Tailwind classNames
 * (`tailwind.config.js`) are the source of truth for everything stylable
 * via `className`.
 */
export const colors = {
  light: {
    surfaceBase: '#FAFAF9',
    surfaceRaised: '#FFFFFF',
    inkPrimary: '#1C1917',
    inkSecondary: '#78716C',
    inkDisabled: '#A8A29E',
    borderHairline: '#E7E5E4',
    destructive: '#DC2626',
  },
  dark: {
    surfaceBase: '#171412',
    surfaceRaised: '#211D1A',
    inkPrimary: '#F5F3F1',
    inkSecondary: '#A39C93',
    inkDisabled: '#6B6560',
    borderHairline: '#332E29',
    destructive: '#F87171',
  },
} as const;
