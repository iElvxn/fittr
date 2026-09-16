import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { removeBackground } from '@six33/react-native-bg-removal';
import { AlphaType, ColorType, Skia } from '@shopify/react-native-skia';

import { WardrobeItemError, NO_SUBJECT_FOUND_MESSAGE, UNKNOWN_ERROR_MESSAGE } from './errors';

const WORKING_LONG_EDGE = 1500;
const THUMB_LONG_EDGE = 400;

/** Alpha below this (out of 255) is treated as background, not part of the item, when sampling color. */
const OPAQUE_ALPHA_THRESHOLD = 32;
/** Caps the color-sampling loop's work regardless of the cutout's resolution. */
const MAX_COLOR_SAMPLES = 40_000;

export type ProcessedItemPhoto = {
  /** Local file:// URI of the transparent PNG cutout. */
  cutoutUri: string;
  /** Local file:// URI of the transparent WebP thumbnail. */
  thumbUri: string;
  /** Auto-detected dominant color of the cutout's opaque pixels, or null if none could be sampled. */
  colorHex: string | null;
};

/**
 * The on-device capture pipeline (NFR2): resize -> background removal ->
 * dominant-color extraction from opaque pixels -> thumbnail generation.
 * Every step runs locally; nothing here calls a network API.
 */
export async function processWardrobePhoto(sourceUri: string): Promise<ProcessedItemPhoto> {
  const working = await resizeLongEdge(sourceUri, WORKING_LONG_EDGE, SaveFormat.JPEG);

  let cutoutUri: string;
  try {
    cutoutUri = await removeBackground(working.uri, { trim: true });
  } catch {
    // The native module's documented error surface (REQUIRES_API_FALLBACK,
    // Invalid URL, Unable to load image, plus undocumented mask-creation
    // failures when Vision finds no foreground instance) has no reliable way
    // to distinguish "no subject" from any other on-device failure. NFR2
    // rules out the README's suggested API fallback anyway, so every
    // failure here maps to the same user-facing outcome: retake.
    throw new WardrobeItemError('processing_failed', NO_SUBJECT_FOUND_MESSAGE);
  }

  const cutoutPixels = await readRgbaPixels(cutoutUri);
  const colorHex = extractDominantColor(cutoutPixels);

  // WebP holds alpha the same way PNG does, so this is a plain resize --
  // no compositing onto a background color needed (unlike a JPEG output
  // would have required).
  const thumb = await resizeLongEdge(cutoutUri, THUMB_LONG_EDGE, SaveFormat.WEBP);

  return { cutoutUri, thumbUri: thumb.uri, colorHex };
}

/** Resizes so the longer edge equals `longEdge`, preserving aspect ratio; skips upscaling a source that's already smaller. */
async function resizeLongEdge(uri: string, longEdge: number, format: SaveFormat) {
  const probe = await ImageManipulator.manipulate(uri).renderAsync();

  if (Math.max(probe.width, probe.height) <= longEdge) {
    return probe.saveAsync({ format, compress: 0.9 });
  }

  const isLandscape = probe.width >= probe.height;
  const resized = await ImageManipulator.manipulate(probe)
    .resize(isLandscape ? { width: longEdge } : { height: longEdge })
    .renderAsync();

  return resized.saveAsync({ format, compress: 0.9 });
}

export type RgbaPixels = { width: number; height: number; data: Uint8Array };

/** Decodes an image and reads its raw, unpremultiplied RGBA bytes -- the only reliable way to honor alpha, per the spec's Design Notes (a generic RGB-only color library may not). */
async function readRgbaPixels(uri: string): Promise<RgbaPixels> {
  const file = new File(uri);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const image = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(bytes));

  if (!image) {
    throw new WardrobeItemError('unknown', UNKNOWN_ERROR_MESSAGE);
  }

  const width = image.width();
  const height = image.height();
  const pixels = image.readPixels(0, 0, {
    width,
    height,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  });

  if (!pixels) {
    throw new WardrobeItemError('unknown', UNKNOWN_ERROR_MESSAGE);
  }

  return { width, height, data: pixels instanceof Uint8Array ? pixels : new Uint8Array(pixels.buffer) };
}

/**
 * Dominant (most frequent), not average, color -- averaging a multi-tone
 * item would blend toward a muddy in-between that matches no visible part
 * of it. Colors are bucketed at 4-bit-per-channel precision to keep the
 * histogram small while still separating visually distinct colors, and
 * sampling is strided to bound the loop's cost regardless of resolution.
 */
export function extractDominantColor({ width, height, data }: RgbaPixels): string | null {
  const totalPixels = width * height;
  const stride = Math.max(1, Math.floor(Math.sqrt(totalPixels / MAX_COLOR_SAMPLES)));

  const buckets = new Map<number, { r: number; g: number; b: number; count: number }>();

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const i = (y * width + x) * 4;
      const a = data[i + 3];
      if (a < OPAQUE_ALPHA_THRESHOLD) {
        continue;
      }

      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);

      const bucket = buckets.get(key);
      if (bucket) {
        bucket.r += r;
        bucket.g += g;
        bucket.b += b;
        bucket.count += 1;
      } else {
        buckets.set(key, { r, g, b, count: 1 });
      }
    }
  }

  let dominant: { r: number; g: number; b: number; count: number } | null = null;
  for (const bucket of buckets.values()) {
    if (!dominant || bucket.count > dominant.count) {
      dominant = bucket;
    }
  }

  if (!dominant) {
    return null;
  }

  const r = Math.round(dominant.r / dominant.count);
  const g = Math.round(dominant.g / dominant.count);
  const b = Math.round(dominant.b / dominant.count);
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}
