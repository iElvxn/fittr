import { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { Image, type ImageLoadEventData } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, runOnJS } from 'react-native-reanimated';
import Svg, { Rect } from 'react-native-svg';

import type { PlacedItem } from '@/stores/fitBuilder';
import { containSize } from '@/lib/fitBuilder/aspectFit';
import { colors } from '@/lib/theme/colors';

/** Touch targets must reach 44x44pt (EXPERIENCE.md Accessibility Floor) even when the cutout itself renders smaller. */
const MIN_TOUCH_TARGET = 44;
const RADIANS_TO_DEGREES = 180 / Math.PI;
/** Keeps a dragged item's center on the visible canvas -- past this, it'd be recoverable only via a full reset. */
const MIN_SCALE = 0.3;
const MAX_SCALE = 3;
const SELECTED_SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.15,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
  elevation: 4,
};

function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(max, Math.max(min, value));
}

type Props = {
  item: PlacedItem;
  imageUrl: string | null;
  canvasWidth: number;
  canvasHeight: number;
  itemSize: number;
  isSelected: boolean;
  onSelect: () => void;
  onTransformEnd: (transform: { x: number; y: number; scale: number; rotation: number }) => void;
};

export function CanvasItem({
  item,
  imageUrl,
  canvasWidth,
  canvasHeight,
  itemSize,
  isSelected,
  onSelect,
  onTransformEnd,
}: Props) {
  // The cutout's own pixel dimensions, once the image reports them -- lets
  // the box (and therefore the touch/gesture region) hug the garment's real
  // shape instead of sitting inside a full `itemSize` square of empty
  // padding, which is especially visible for a tall item like pants or a
  // wide one like shoes. `null` (not yet loaded) falls back to a square.
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const { width: boxWidth, height: boxHeight } = naturalSize
    ? containSize(naturalSize.width, naturalSize.height, itemSize)
    : { width: itemSize, height: itemSize };
  const scheme = useColorScheme();
  const selectionColor = scheme === 'dark' ? colors.dark.inkPrimary : colors.light.inkPrimary;

  function handleLoad(event: ImageLoadEventData) {
    setNaturalSize({ width: event.source.width, height: event.source.height });
  }

  // Position/scale/rotation always track the gesture 1:1 with no spring or
  // easing curve, so there's no motion here for the OS Reduce Motion setting
  // to strip -- the boundary is satisfied by never adding easing, not by
  // branching on the setting.
  const translateX = useSharedValue(item.x * canvasWidth);
  const translateY = useSharedValue(item.y * canvasHeight);
  const scale = useSharedValue(item.scale);
  const rotationDeg = useSharedValue(item.rotation);

  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startScale = useSharedValue(1);
  const startRotationDeg = useSharedValue(0);

  // Re-syncs from the store whenever it changes this item's transform from
  // outside a gesture (e.g. another item's z-index bump doesn't touch this
  // one, but a future undo/reset would) -- gestures themselves never read
  // from here, only write to `onTransformEnd`, so there's no feedback loop.
  useEffect(() => {
    translateX.value = item.x * canvasWidth;
    translateY.value = item.y * canvasHeight;
    scale.value = item.scale;
    rotationDeg.value = item.rotation;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable refs; only the store's own numbers should re-trigger this.
  }, [item.x, item.y, item.scale, item.rotation, canvasWidth, canvasHeight]);

  function commitTransform() {
    onTransformEnd({
      x: translateX.value / canvasWidth,
      y: translateY.value / canvasHeight,
      scale: scale.value,
      rotation: rotationDeg.value,
    });
  }

  // Gesture.Pan requires crossing a movement threshold before it activates,
  // so a stationary tap alone never fires its onStart -- a separate Tap
  // gesture, raced against the drag/pinch/rotate group, is what makes
  // "tap an item to bring it to front" (the matrix's Reorder row) actually
  // work when the user doesn't also move the item.
  const tapGesture = Gesture.Tap().onStart(() => runOnJS(onSelect)());

  const panGesture = Gesture.Pan()
    .onStart(() => {
      startX.value = translateX.value;
      startY.value = translateY.value;
      runOnJS(onSelect)();
    })
    .onUpdate((event) => {
      // eslint-disable-next-line react-hooks/immutability -- Reanimated shared values are designed to be mutated via `.value`; the React Compiler's static analysis flags this as an illegal effect-adjacent mutation, but it's the documented API, not a bug.
      translateX.value = clamp(startX.value + event.translationX, 0, canvasWidth);
      // eslint-disable-next-line react-hooks/immutability -- see translateX above.
      translateY.value = clamp(startY.value + event.translationY, 0, canvasHeight);
    })
    .onEnd(() => runOnJS(commitTransform)());

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      startScale.value = scale.value;
    })
    .onUpdate((event) => {
      // eslint-disable-next-line react-hooks/immutability -- see translateX above.
      scale.value = clamp(startScale.value * event.scale, MIN_SCALE, MAX_SCALE);
    })
    .onEnd(() => runOnJS(commitTransform)());

  const rotationGesture = Gesture.Rotation()
    .onStart(() => {
      startRotationDeg.value = rotationDeg.value;
    })
    .onUpdate((event) => {
      // eslint-disable-next-line react-hooks/immutability -- see translateX above.
      rotationDeg.value = startRotationDeg.value + event.rotation * RADIANS_TO_DEGREES;
    })
    .onEnd(() => runOnJS(commitTransform)());

  const composedGesture = Gesture.Race(
    tapGesture,
    Gesture.Simultaneous(panGesture, pinchGesture, rotationGesture),
  );

  const animatedStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    width: boxWidth,
    height: boxHeight,
    transform: [
      { translateX: translateX.value - boxWidth / 2 },
      { translateY: translateY.value - boxHeight / 2 },
      { scale: scale.value },
      { rotateZ: `${rotationDeg.value}deg` },
    ],
    zIndex: item.zIndex,
  }));

  // Per-axis, since a hugging box is rarely square -- a thin belt still gets
  // boosted to the accessibility floor on its short axis without inflating
  // the long one past what the garment itself needs.
  const hitSlop = {
    top: Math.max(0, (MIN_TOUCH_TARGET - boxHeight) / 2),
    bottom: Math.max(0, (MIN_TOUCH_TARGET - boxHeight) / 2),
    left: Math.max(0, (MIN_TOUCH_TARGET - boxWidth) / 2),
    right: Math.max(0, (MIN_TOUCH_TARGET - boxWidth) / 2),
  };

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View style={[animatedStyle, isSelected ? SELECTED_SHADOW : undefined]} hitSlop={hitSlop}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={{ width: '100%', height: '100%' }}
            contentFit="contain"
            onLoad={handleLoad}
          />
        ) : null}
        {isSelected ? (
          // A real `border-dashed` View border doesn't render on Android
          // once `borderRadius` is involved (a long-standing RN/Android
          // limitation) -- an SVG stroke with `strokeDasharray` draws the
          // dash pattern itself, so it's correct on both platforms.
          <Svg
            width={boxWidth}
            height={boxHeight}
            style={{ position: 'absolute', top: 0, left: 0 }}
            pointerEvents="none"
          >
            <Rect
              x={1}
              y={1}
              width={Math.max(0, boxWidth - 2)}
              height={Math.max(0, boxHeight - 2)}
              rx={2}
              fill="none"
              stroke={selectionColor}
              strokeWidth={2}
              strokeDasharray="6,4"
            />
          </Svg>
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}
