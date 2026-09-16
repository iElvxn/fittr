// `extractDominantColor` is pure and touches none of these, but importing
// the module still runs its top-level imports -- each of these is a native
// module that can't initialize outside a real app runtime (Skia's JSI
// bindings, image-manipulator/bg-removal's native calls), so they're
// stubbed the same way `avatar.test.ts` stubs `expo-image-picker`.
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('expo-image-manipulator', () => ({ ImageManipulator: {}, SaveFormat: {} }));
jest.mock('@six33/react-native-bg-removal', () => ({ removeBackground: jest.fn() }));
jest.mock('@shopify/react-native-skia', () => ({ AlphaType: {}, ColorType: {}, Skia: {} }));

import { extractDominantColor, type RgbaPixels } from '@/lib/wardrobe/processImage';

function pixels(width: number, height: number, rgba: [number, number, number, number][]): RgbaPixels {
  const data = new Uint8Array(width * height * 4);
  rgba.forEach(([r, g, b, a], i) => {
    data.set([r, g, b, a], i * 4);
  });
  return { width, height, data };
}

describe('extractDominantColor', () => {
  it('returns the most frequent opaque color, not an average', () => {
    // 3 red pixels, 1 blue -- an average would blend toward purple; the
    // dominant-color algorithm should pick red outright.
    const input = pixels(2, 2, [
      [255, 0, 0, 255],
      [255, 0, 0, 255],
      [255, 0, 0, 255],
      [0, 0, 255, 255],
    ]);

    expect(extractDominantColor(input)).toBe('#ff0000');
  });

  it('excludes pixels below the opaque-alpha threshold', () => {
    // A fully-transparent green pixel must not skew the result away from
    // the one opaque (red) pixel.
    const input = pixels(1, 2, [
      [0, 255, 0, 0],
      [255, 0, 0, 255],
    ]);

    expect(extractDominantColor(input)).toBe('#ff0000');
  });

  it('returns null when every sampled pixel is transparent', () => {
    const input = pixels(1, 1, [[10, 20, 30, 0]]);

    expect(extractDominantColor(input)).toBeNull();
  });
});
