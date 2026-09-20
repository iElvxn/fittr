import { useState } from 'react';
import type { ImageLoadEventData } from 'expo-image';

/**
 * Tracks an `expo-image`'s real aspect ratio once it reports its own size
 * via `onLoad` -- covers/cutouts aren't captured at a fixed size and the app
 * doesn't persist their dimensions, so callers render at
 * `defaultAspectRatio` until then, then settle to the real one. Used by
 * `FitsGridCell`'s grid cells, which each need their own fixed pixel height
 * up front; screens that just fill a flexible container (e.g. the Fit
 * detail screen's `flex-1` cover) don't need it at all.
 */
export function useImageAspectRatio(defaultAspectRatio: number) {
  const [aspectRatio, setAspectRatio] = useState(defaultAspectRatio);

  function handleLoad(event: ImageLoadEventData) {
    const { width, height } = event.source;
    if (width > 0 && height > 0) {
      setAspectRatio(width / height);
    }
  }

  return { aspectRatio, handleLoad };
}
