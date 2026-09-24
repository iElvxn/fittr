import { colors } from '@/lib/theme/colors';

// This project's tsconfig only loads `jest` types (no `@types/node`), so the
// few Node APIs the source scan needs are typed locally.
type Dirent = { name: string; isDirectory(): boolean };
declare const __dirname: string;
/* eslint-disable @typescript-eslint/no-require-imports */
const fs: {
  readdirSync(dir: string, opts: { withFileTypes: true }): Dirent[];
  readFileSync(file: string, encoding: 'utf8'): string;
} = require('fs');
const path: { join(...parts: string[]): string; resolve(...parts: string[]): string } = require('path');
const tailwindConfig = require('../tailwind.config.js');
/* eslint-enable @typescript-eslint/no-require-imports */

const twColors = tailwindConfig.theme.extend.colors;

/** colors.ts key -> [tailwind light value, tailwind dark value]. */
const TAILWIND_PAIRS: Record<keyof typeof colors.light, [string, string]> = {
  surfaceBase: [twColors.surface.base, twColors.surface.baseDark],
  surfaceRaised: [twColors.surface.raised, twColors.surface.raisedDark],
  surfaceTile: [twColors.surface.tile, twColors.surface.tileDark],
  inkPrimary: [twColors.ink.primary, twColors.ink.primaryDark],
  inkSecondary: [twColors.ink.secondary, twColors.ink.secondaryDark],
  inkDisabled: [twColors.ink.disabled, twColors.ink.disabledDark],
  borderHairline: [twColors.border.hairline, twColors.border.hairlineDark],
  destructive: [twColors.destructive, twColors.destructiveDark],
};

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

describe('theme tokens', () => {
  it('colors.ts and tailwind.config.js define the same token set', () => {
    expect(Object.keys(colors.light).sort()).toEqual(Object.keys(TAILWIND_PAIRS).sort());
    expect(Object.keys(colors.dark).sort()).toEqual(Object.keys(TAILWIND_PAIRS).sort());
  });

  it.each(Object.keys(TAILWIND_PAIRS) as (keyof typeof colors.light)[])(
    '%s matches between colors.ts and tailwind in both modes',
    (key) => {
      const [light, dark] = TAILWIND_PAIRS[key];
      expect(light.toUpperCase()).toBe(colors.light[key].toUpperCase());
      expect(dark.toUpperCase()).toBe(colors.dark[key].toUpperCase());
    },
  );

  it('uses the locked v2 palette', () => {
    expect(colors.light).toMatchObject({
      surfaceBase: '#F6F4EE',
      surfaceRaised: '#FFFDF8',
      surfaceTile: '#ECE8DF',
      inkPrimary: '#252220',
      inkSecondary: '#766E64',
      borderHairline: '#E4DFD6',
      destructive: '#B91C1C',
    });
    expect(colors.dark).toMatchObject({
      surfaceBase: '#1A1816',
      surfaceRaised: '#24211E',
      surfaceTile: '#2A2622',
      inkPrimary: '#EDE8DF',
      inkSecondary: '#A39B90',
      borderHairline: '#35302B',
    });
  });

  it('has no accent token anywhere', () => {
    expect('accent' in colors.light).toBe(false);
    expect('accent' in colors.dark).toBe(false);
    expect(Object.keys(twColors).some((k) => /accent/i.test(k))).toBe(false);
  });

  it('sets the square control radius (2px) and keeps md/lg', () => {
    expect(tailwindConfig.theme.extend.borderRadius).toEqual({ sm: '2px', md: '12px', lg: '16px' });
  });

  describe.each(['light', 'dark'] as const)('%s mode contrast (WCAG AA 4.5:1)', (mode) => {
    const p = colors[mode];

    it.each(['inkPrimary', 'inkSecondary', 'destructive'] as const)('%s on base and raised', (ink) => {
      expect(contrast(p[ink], p.surfaceBase)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p[ink], p.surfaceRaised)).toBeGreaterThanOrEqual(4.5);
    });

    it('inverse text (surfaceBase) on an inkPrimary fill', () => {
      expect(contrast(p.surfaceBase, p.inkPrimary)).toBeGreaterThanOrEqual(4.5);
    });
  });

  it('no source file in app/ or components/ uses an accent className or colors.*.accent', () => {
    const root = path.resolve(__dirname, '..');
    const offenders = [...sourceFiles(path.join(root, 'app')), ...sourceFiles(path.join(root, 'components'))].filter(
      (file) => {
        const src = fs.readFileSync(file, 'utf8');
        return /\b(?:bg|text|border|tint|fill|stroke)-accent/.test(src) || /colors\.\w+\.accent\b/.test(src);
      },
    );
    expect(offenders).toEqual([]);
  });
});
