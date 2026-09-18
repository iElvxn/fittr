/**
 * The box a `naturalWidth` x `naturalHeight` image occupies when scaled to
 * fit within a `maxSize` x `maxSize` square without cropping (the same math
 * `contentFit="contain"` uses to paint the image) -- but returned as real
 * dimensions, not just a paint-time fit, so the caller can size an element's
 * actual layout box (and therefore its touch/gesture region) to hug the
 * image's own shape instead of sitting inside a full square of empty space.
 */
export function containSize(
  naturalWidth: number,
  naturalHeight: number,
  maxSize: number,
): { width: number; height: number } {
  if (naturalWidth <= 0 || naturalHeight <= 0) {
    return { width: maxSize, height: maxSize };
  }
  const scale = Math.min(maxSize / naturalWidth, maxSize / naturalHeight);
  return { width: naturalWidth * scale, height: naturalHeight * scale };
}
