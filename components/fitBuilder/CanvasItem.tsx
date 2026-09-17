import { useEffect } from 'react';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, runOnJS } from 'react-native-reanimated';

import type { PlacedItem } from '@/stores/fitBuilder';

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
    width: itemSize,
    height: itemSize,
    transform: [
      { translateX: translateX.value - itemSize / 2 },
      { translateY: translateY.value - itemSize / 2 },
      { scale: scale.value },
      { rotateZ: `${rotationDeg.value}deg` },
    ],
    zIndex: item.zIndex,
  }));

  const hitSlop = Math.max(0, (MIN_TOUCH_TARGET - itemSize) / 2);

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View
        style={[animatedStyle, isSelected ? SELECTED_SHADOW : undefined]}
        hitSlop={hitSlop}
        className={
          isSelected ? 'rounded-sm border-2 border-ink-primary dark:border-ink-primaryDark' : undefined
        }
      >
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}
