/**
 * DESIGN.md's v2 palette (Aesop cream, pure monochrome, no accent), for the
 * places a color must be a JS value rather than a NativeWind className (e.g.
 * `ActivityIndicator`'s `color` prop). `useColorScheme` picks light vs.
 * dark. `tailwind.config.js` mirrors these values token for token --
 * `__tests__/themeTokens.test.ts` fails if the two ever drift.
 *
 * `surfaceTile` is the photo-well fill behind clothing photography only --
 * never a text background (it isn't contrast-checked for text).
 * Inverse text on an `inkPrimary` fill uses `surfaceBase` in both modes.
 */
export const colors = {
  light: {
    surfaceBase: '#F6F4EE',
    surfaceRaised: '#FFFDF8',
    surfaceTile: '#ECE8DF',
    inkPrimary: '#252220',
    inkSecondary: '#766E64',
    inkDisabled: '#A8A095',
    borderHairline: '#E4DFD6',
    destructive: '#B91C1C',
  },
  dark: {
    surfaceBase: '#1A1816',
    surfaceRaised: '#24211E',
    surfaceTile: '#2A2622',
    inkPrimary: '#EDE8DF',
    inkSecondary: '#A39B90',
    inkDisabled: '#6B645C',
    borderHairline: '#35302B',
    destructive: '#F87171',
  },
} as const;
