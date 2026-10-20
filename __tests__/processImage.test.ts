// Every module below is native (Skia's JSI bindings, image-manipulator and
// bg-removal's native calls, expo-file-system) and can't initialize outside
// a real app runtime, so each is stubbed the same way `avatar.test.ts`
// stubs `expo-image-picker`. The manipulator stub tags each saved file's URI
// with its source and format (`{source}->{format}`), so the pipeline tests
// can tell which input every step was given. Factories wrap the `mock*`
// functions in closures because `jest.mock` is hoisted above their
// declarations; the closures only read them once a test runs.
const mockManipulate = jest.fn();
const mockRemoveBackground = jest.fn();
const mockFile = jest.fn();
const mockReadPixels = jest.fn();

jest.mock('expo-file-system', () => ({ File: jest.fn((uri: string) => mockFile(uri)) }));
jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: (source: string) => mockManipulate(source) },
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
}));
jest.mock('@six33/react-native-bg-removal', () => ({
  removeBackground: (uri: string, options: unknown) => mockRemoveBackground(uri, options),
}));
jest.mock('@shopify/react-native-skia', () => ({
  AlphaType: { Unpremul: 'unpremul' },
  ColorType: { RGBA_8888: 'rgba8888' },
  Skia: {
    Data: { fromBytes: (bytes: Uint8Array) => bytes },
    Image: {
      MakeImageFromEncoded: () => ({ width: () => 1, height: () => 1, readPixels: () => mockReadPixels() }),
    },
  },
}));

import { extractDominantColor, processWardrobePhoto, type RgbaPixels } from '@/lib/wardrobe/processImage';

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

describe('processWardrobePhoto', () => {
  const PNG_URI = 'file://bg-removed.png';
  type SaveOptions = { format: string; compress: number };
  let saveAsync: jest.Mock;

  const saved = (source: string, resized: boolean, { format }: SaveOptions) => ({
    uri: `${source}${resized ? '->resized' : ''}->${format}`,
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Every render reports 2000x1000 -- over both the 1500px working edge
    // and the 400px thumb edge -- so `resizeLongEdge` always takes its resize
    // branch, and its saves are tagged `->resized`. An un-resized save of the
    // PNG can only be the cutout encode.
    const rendered = (source: string, resized: boolean) => ({
      source,
      width: resized ? 400 : 2000,
      height: resized ? 200 : 1000,
      saveAsync: (options: SaveOptions) => saveAsync(source, resized, options),
    });
    mockManipulate.mockImplementation((input: string | { source: string }) => {
      const source = typeof input === 'string' ? input : input.source;
      return {
        renderAsync: async () => rendered(source, false),
        resize: () => ({ renderAsync: async () => rendered(source, true) }),
      };
    });
    saveAsync = jest.fn(async (source: string, resized: boolean, options: SaveOptions) =>
      saved(source, resized, options),
    );
    mockRemoveBackground.mockResolvedValue(PNG_URI);
    mockFile.mockImplementation(() => ({ arrayBuffer: async () => new ArrayBuffer(4) }));
    mockReadPixels.mockReturnValue(new Uint8Array([255, 0, 0, 255]));
  });

  it('encodes the background-removal PNG to WebP at the same size and returns it as the cutout', async () => {
    const result = await processWardrobePhoto('file://source.jpg');

    expect(mockRemoveBackground).toHaveBeenCalledWith('file://source.jpg->resized->jpeg', { trim: true });
    expect(saveAsync).toHaveBeenCalledWith(PNG_URI, false, { format: 'webp', compress: 0.9 });
    expect(result.cutoutUri).toBe(`${PNG_URI}->webp`);
  });

  it('reads the lossless PNG, not the WebP, for color extraction', async () => {
    const result = await processWardrobePhoto('file://source.jpg');

    expect(mockFile).toHaveBeenCalledTimes(1);
    expect(mockFile).toHaveBeenCalledWith(PNG_URI);
    expect(result.colorHex).toBe('#ff0000');
  });

  it('makes the thumbnail from the PNG via the resize path, so it is not lossy-encoded twice', async () => {
    const result = await processWardrobePhoto('file://source.jpg');

    expect(result.thumbUri).toBe(`${PNG_URI}->resized->webp`);
    expect(result.thumbUri).not.toBe(result.cutoutUri);
    // Nothing is ever made from the WebP cutout.
    const sources = saveAsync.mock.calls.map(([source]) => source);
    expect(sources).not.toContain(result.cutoutUri);
  });

  it('rejects when the WebP cutout encode throws, before the thumbnail is made', async () => {
    const encodeError = new Error('encode failed');
    saveAsync.mockImplementation(async (source: string, resized: boolean, options: SaveOptions) => {
      if (source === PNG_URI && !resized && options.format === 'webp') {
        throw encodeError;
      }
      return saved(source, resized, options);
    });

    await expect(processWardrobePhoto('file://source.jpg')).rejects.toBe(encodeError);
    expect(saveAsync).not.toHaveBeenCalledWith(PNG_URI, true, expect.anything());
  });
});
