import { Image, type ImageProps, type ImageStyle } from 'expo-image';
import type { StyleProp } from 'react-native';

import { StorageImage } from '@/components/ui/StorageImage';

type Props = {
  /** Storage path of the file shown -- the cache key, since the signed URL changes on every re-sign. */
  path: string;
  /** Signed URL for `path`, or null/undefined while it's being signed (the placeholder shows meanwhile). */
  url: string | null | undefined;
  thumbhash: string | null;
  /** A just-picked local file shown while it saves; takes the place of `url` and is never cached by path. */
  localUri?: string;
  /** The day, in grids, so a recycled cell never flashes another day's photo. */
  recyclingKey?: string;
  testID?: string;
  style?: StyleProp<ImageStyle>;
};

/**
 * Every wear photo renders through here so the cost controls hold
 * everywhere: cached by storage path (`StorageImage`) and a thumbhash
 * placeholder while it loads. Decorative to screen readers -- the
 * surrounding control carries the label.
 */
export function WearPhotoImage({ path, url, thumbhash, localUri, recyclingKey, testID, style }: Props) {
  const shared: Pick<ImageProps, 'testID' | 'accessible' | 'placeholder' | 'contentFit' | 'transition' | 'style'> = {
    testID,
    accessible: false,
    placeholder: thumbhash ? { thumbhash } : undefined,
    contentFit: 'cover',
    transition: 150,
    style: [{ width: '100%', height: '100%' }, style],
  };

  if (localUri) {
    return <Image {...shared} source={{ uri: localUri }} cachePolicy="memory-disk" recyclingKey={recyclingKey} />;
  }

  return <StorageImage {...shared} path={path} url={url} recyclingKey={recyclingKey} />;
}
