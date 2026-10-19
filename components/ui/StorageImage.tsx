import { Image, type ImageProps } from 'expo-image';

type Props = Omit<ImageProps, 'source' | 'cachePolicy'> & {
  /** Storage path of the file shown -- the cache key, since the signed URL changes on every re-sign. */
  path: string;
  /** Signed URL for `path`, or null/undefined while it's being signed (no source meanwhile). */
  url: string | null | undefined;
};

/**
 * Every Storage image renders through here, cached in memory and on disk by
 * its path rather than its signed URL, so a re-signed link (hourly, a
 * batch that gained or lost a path, a garbage-collected query) is served
 * from the device instead of downloading the same file again. Only valid
 * because a path's bytes never change: covers, avatars and wear photos get
 * a new file name per save, and item files are fixed per item. Recycles by
 * path too, unless the caller keys it some other way.
 */
export function StorageImage({ path, url, recyclingKey, ...imageProps }: Props) {
  return (
    <Image
      {...imageProps}
      source={url ? { uri: url, cacheKey: path } : null}
      cachePolicy="memory-disk"
      recyclingKey={recyclingKey ?? path}
    />
  );
}
