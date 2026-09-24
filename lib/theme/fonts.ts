import {
  Montserrat_400Regular,
  Montserrat_500Medium,
} from '@expo-google-fonts/montserrat';
import {
  Newsreader_400Regular,
  Newsreader_400Regular_Italic,
  Newsreader_500Medium,
} from '@expo-google-fonts/newsreader';

/** Passed to `useFonts` in the root layout. Keys are used as `fontFamily` values. */
export const appFonts = {
  Newsreader_400Regular,
  Newsreader_500Medium,
  Newsreader_400Regular_Italic,
  Montserrat_400Regular,
  Montserrat_500Medium,
};

type TypeStyle = {
  fontFamily: keyof typeof appFonts;
  fontSize: number;
  lineHeight: number;
  letterSpacing?: number;
  textTransform?: 'uppercase';
};

/**
 * DESIGN.md's six type roles, mapped to the loaded font family + base
 * size/line-height. Newsreader (display/title) is the v2 editorial serif --
 * set at regular weight, where its fine contrast reads most refined;
 * Montserrat carries everything read at length. `caption` is the small,
 * tracked, uppercase label used for chips, button labels and section labels.
 */
export const typeScale = {
  display: { fontFamily: 'Newsreader_400Regular', fontSize: 36, lineHeight: 40, letterSpacing: -0.4 },
  title: { fontFamily: 'Newsreader_400Regular', fontSize: 24, lineHeight: 30 },
  body: { fontFamily: 'Montserrat_400Regular', fontSize: 16, lineHeight: 22 },
  label: { fontFamily: 'Montserrat_500Medium', fontSize: 14, lineHeight: 20 },
  meta: { fontFamily: 'Montserrat_400Regular', fontSize: 13, lineHeight: 18 },
  caption: {
    fontFamily: 'Montserrat_500Medium',
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
} as const satisfies Record<string, TypeStyle>;

export type TypeRole = keyof typeof typeScale;
