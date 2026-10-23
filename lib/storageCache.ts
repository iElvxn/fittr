/**
 * `Cache-Control` max-age (one year) for Storage files whose bytes never
 * change at their path: covers (`cover-{ts}.png`), item cutouts/thumbs
 * (`cutout.webp`, or `cutout.png` before Story 6.12, and `thumb.webp`;
 * fixed per item id; a retry re-uploads the same bytes), wear photos
 * (UUID names) and avatars (`avatar-{ts}.jpg`). Never use it for a path that
 * is overwritten with different content. It reaches HTTP caches only: the
 * device's own image cache (`StorageImage`) keys by path and evicts on its
 * own limits. The buckets stay private -- every fetch still needs a signed
 * link.
 */
export const WRITE_ONCE_CACHE_CONTROL = '31536000';
