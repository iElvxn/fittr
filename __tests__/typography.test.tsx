import { PixelRatio, StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { Text } from '@/components/ui/Text';
import { appFonts, typeScale } from '@/lib/theme/fonts';

describe('typography', () => {
  afterEach(() => jest.restoreAllMocks());

  it('every typeScale fontFamily is a loaded appFonts key', () => {
    for (const role of Object.values(typeScale)) {
      expect(Object.keys(appFonts)).toContain(role.fontFamily);
    }
  });

  it('display and title are Newsreader; no Fraunces is loaded', () => {
    expect(typeScale.display.fontFamily).toMatch(/^Newsreader_/);
    expect(typeScale.title.fontFamily).toMatch(/^Newsreader_/);
    expect(Object.keys(appFonts).some((k) => /Fraunces/.test(k))).toBe(false);
  });

  it('caption renders uppercase with letterSpacing scaled by the font scale', async () => {
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1.5);
    await render(<Text variant="caption">All</Text>);

    const style = StyleSheet.flatten(screen.getByText('All').props.style);
    expect(style.textTransform).toBe('uppercase');
    expect(style.letterSpacing).toBeCloseTo(typeScale.caption.letterSpacing * 1.5);
    expect(style.fontSize).toBeCloseTo(typeScale.caption.fontSize * 1.5);
  });

  it('roles without tracking set no letterSpacing or textTransform', async () => {
    await render(<Text variant="body">Plain</Text>);

    const style = StyleSheet.flatten(screen.getByText('Plain').props.style);
    expect(style.letterSpacing).toBeUndefined();
    expect(style.textTransform).toBeUndefined();
  });
});
