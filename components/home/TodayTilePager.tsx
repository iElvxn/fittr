import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { WearPhotoImage } from '@/components/fits/WearPhotoImage';
import type { WearPhoto } from '@/lib/fits/wearRef';

const TILE_ASPECT_RATIO = 3 / 4;
const MARKER_SIZE = 5;
const MARKER_GAP = 6;
const MARKER_TOP = 10;
/** Home's horizontal gutter on each side, for the width guess before the first layout. */
const GUTTERS = 32;
const PAGE_COUNT = 2;

type Props = {
  /** Today's wear photo and the signed URL of its full-size file, once signed. */
  photo: WearPhoto & { url: string | null };
  /** Opens today's day sheet, where the photo is replaced or removed. */
  onOpenPhoto?: () => void;
  /** The Fit's collage page, sized to fill its page (`TodayFitCard`'s tile). */
  collage: ReactNode;
  /** Any change sends the pager back to the photo, e.g. each focus of Home or a new photo. */
  resetKey: string | number;
};

/**
 * Story 5.7: Home's big 3:4 tile when today's wear has a photo -- a plain
 * two-page paging swipe, the photo first and then the Fit's collage, with
 * two small round markers beneath (the current page filled in ink, the
 * other outlined). No labels, overlays, parallax or autoplay: the one
 * approved exception to "no carousels".
 */
export function TodayTilePager({ photo, onOpenPhoto, collage, resetKey }: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const [pageWidth, setPageWidth] = useState(Math.max(windowWidth - GUTTERS, 1));
  // The page is remembered against the reset key it was reached under, so a
  // new key reads as page 0 on the same render, with no state reset to wait on.
  const [position, setPosition] = useState({ resetKey, page: 0 });
  const page = position.resetKey === resetKey ? position.page : 0;
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ x: 0, y: 0, animated: false });
  }, [resetKey]);

  function onLayout(event: LayoutChangeEvent) {
    const { width } = event.nativeEvent.layout;
    if (width > 0 && width !== pageWidth) {
      setPageWidth(width);
    }
  }

  function onMomentumScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, layoutMeasurement } = event.nativeEvent;
    const width = layoutMeasurement?.width || pageWidth;
    const next = Math.round(contentOffset.x / width);
    setPosition({ resetKey, page: Math.min(Math.max(next, 0), PAGE_COUNT - 1) });
  }

  return (
    <View>
      <View style={{ width: '100%', aspectRatio: TILE_ASPECT_RATIO }} className="overflow-hidden rounded-lg">
        <ScrollView
          ref={scrollRef}
          testID="home-tile-pager"
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          onLayout={onLayout}
          onMomentumScrollEnd={onMomentumScrollEnd}
        >
          <Pressable
            testID="home-tile-page-photo"
            accessibilityRole="button"
            accessibilityLabel="Your photo from today, 1 of 2. Open to replace or remove"
            onPress={onOpenPhoto}
            style={{ width: pageWidth, height: pageWidth / TILE_ASPECT_RATIO }}
            className="overflow-hidden rounded-lg bg-surface-tile active:opacity-90 dark:bg-surface-tileDark"
          >
            <WearPhotoImage testID="home-wear-photo" path={photo.path} url={photo.url} thumbhash={photo.thumbhash} />
          </Pressable>
          <View testID="home-tile-collage-frame" style={{ width: pageWidth }}>
            {collage}
          </View>
        </ScrollView>
      </View>

      {/* Decorative: each page already reads its position ("1 of 2"). */}
      <View style={{ marginTop: MARKER_TOP, columnGap: MARKER_GAP }} className="flex-row justify-center">
        {Array.from({ length: PAGE_COUNT }, (_, index) => (
          <View
            key={index}
            testID={`home-tile-marker-${index}`}
            style={{ width: MARKER_SIZE, height: MARKER_SIZE }}
            className={
              index === page
                ? 'rounded-full bg-ink-primary dark:bg-ink-primaryDark'
                : 'rounded-full border border-ink-secondary dark:border-ink-secondaryDark'
            }
          />
        ))}
      </View>
    </View>
  );
}
