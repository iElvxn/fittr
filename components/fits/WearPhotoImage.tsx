import { Image, type ImageStyle } from 'expo-image';
import type { StyleProp } from 'react-native';

type Props = {
  /** Storage path of the file shown -- the cache key, since the signed URL changes on every re-sign. */
  path: string;
  /** Signed URL for `path`, or null/undefined while it's being signed (the placeholder shows meanwhile). */
  url: string | null | undefined;
  thumbhash: string | null;
  /** A just-picked local file shown while it saves; takes the place of `url` and is never cached. */
  localUri?: string;
  /** The day, in grids, so a recycled cell never flashes another day's photo. */
  recyclingKey?: string;
  testID?: string;
  style?: StyleProp<ImageStyle>;
};

/**
 * Every wear photo renders through here so the cost controls hold
 * everywhere: cached in memory and on disk by storage path (a replaced photo
 * is a new file name, so a path's cache entry never goes stale) and a
 * thumbhash placeholder while it loads. Decorative to screen readers -- the
 * surrounding control carries the label.
 */
export function WearPhotoImage({ path, url, thumbhash, localUri, recyclingKey, testID, style }: Props) {
  const source = localUri ? { uri: localUri } : url ? { uri: url, cacheKey: path } : null;

  return (
    <Image
      testID={testID}
      accessible={false}
      source={source}
      placeholder={thumbhash ? { thumbhash } : undefined}
      cachePolicy="memory-disk"
      recyclingKey={recyclingKey}
      contentFit="cover"
      transition={150}
      style={[{ width: '100%', height: '100%' }, style]}
    />
  );
}
