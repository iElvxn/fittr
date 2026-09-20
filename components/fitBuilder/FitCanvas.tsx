import { Pressable, View, useColorScheme, type LayoutChangeEvent } from 'react-native';
import { forwardRef, useState } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

import { CanvasItem } from '@/components/fitBuilder/CanvasItem';
import { GhostSlot } from '@/components/fitBuilder/GhostSlot';
import { TrashIcon } from '@/components/ui/icons/TrashIcon';
import { useFitBuilderStore } from '@/stores/fitBuilder';
import type { WardrobeItemCategory } from '@/lib/wardrobe/addItem';
import { FIT_TEMPLATES, isPointWithinSlotRange, type TemplateSlot } from '@/lib/fitBuilder/templates';
import type { ThumbnailUrlMap } from '@/lib/wardrobe/thumbnailUrls';
import { colors } from '@/lib/theme/colors';

/** Cutout render size on the canvas -- independent of the tray's smaller chip thumbnails. */
const CANVAS_ITEM_SIZE = 190;
const DELETE_BUTTON_SIZE = 44;
/**
 * Backstop for Android, where non-zero `elevation` on a sibling (e.g. a
 * selected item's own selection shadow) can visually rise above sibling
 * *view groups* regardless of add order -- comfortably above anything an
 * item ever sets so the button can't lose that comparison either.
 */
const DELETE_BUTTON_ELEVATION = 1000;
const CANVAS_SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.08,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};

type Props = {
  cutoutUrls: ThumbnailUrlMap;
  wardrobeItemCutoutPaths: Record<string, string>;
  /** Opens the catalog sheet pre-filtered to the tapped ghost slot's own index and category. */
  onSlotPress: (templateSlotIndex: number, category: WardrobeItemCategory) => void;
  /**
   * True for the brief window `app/new-fit.tsx`'s Save flow spends
   * capturing the collage -- suppresses `CanvasItem`'s own selection
   * outline/shadow (the one piece of capture-time chrome that can't be
   * moved to a sibling overlay like the delete button and ghosts below,
   * since it has to hug that exact item's own animated bounds) so it never
   * ends up baked into a saved Fit's cover image just because something
   * happened to be selected at the moment Save was tapped.
   */
  capturing?: boolean;
};

/**
 * The canvas renders as an inset, rounded, shadowed card floating on the
 * screen's own background -- distinguishes the working surface from the
 * chrome around it. Items are bare cutouts with no card/shadow of their own
 * -- the only selection cue is `CanvasItem`'s 2px outline, applied here based
 * on the store's `selectedId`. Any template category-slot with no placed
 * item yet shows a ghost-silhouette "+" placeholder -- tapping its badge
 * calls `onSlotPress` to open the catalog sheet pre-filtered to that
 * category; the actual placement still goes through the caller's own
 * `addItem` call once something is picked. The card's own backdrop reflects
 * the store's `canvasBackgroundColor` -- one of a curated set of pastel
 * colors, or `null` for the theme default -- which the caller lets the user
 * change via `CanvasBackgroundSheet` (see `app/new-fit.tsx`).
 *
 * Forwards `ref` to the canvas card itself (not this wrapper) so
 * `app/new-fit.tsx` can pass it straight to `react-native-view-shot`'s
 * `captureRef` when the user taps Save -- capturing just the card, not the
 * surrounding screen padding/footer.
 */
export const FitCanvas = forwardRef<View, Props>(function FitCanvas(
  { cutoutUrls, wardrobeItemCutoutPaths, onSlotPress, capturing = false },
  ref,
) {
  const templateId = useFitBuilderStore((state) => state.templateId);
  const items = useFitBuilderStore((state) => state.items);
  const selectedId = useFitBuilderStore((state) => state.selectedId);
  const selectItem = useFitBuilderStore((state) => state.selectItem);
  const bringToFront = useFitBuilderStore((state) => state.bringToFront);
  const updateItemTransform = useFitBuilderStore((state) => state.updateItemTransform);
  const removeItem = useFitBuilderStore((state) => state.removeItem);
  const canvasBackgroundColor = useFitBuilderStore((state) => state.canvasBackgroundColor);
  const scheme = useColorScheme();

  const [size, setSize] = useState({ width: 0, height: 0 });

  function handleLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  }

  function handleSelect(id: string) {
    selectItem(id);
    bringToFront(id);
  }

  // A template slot is unfilled exactly when no placed item's own
  // `templateSlotIndex` claims it -- identity, not a per-category count, so
  // whichever specific ghost was tapped (and filled) is the one that
  // disappears, even out of template order (e.g. the second of two
  // Accessories slots, filled before the first).
  const claimedSlotIndexes = new Set(
    items.map((item) => item.templateSlotIndex).filter((index): index is number => index !== null),
  );
  // On top of that identity-based claim, a slot also drops out the moment
  // any item's own center currently sits within its range -- covers both a
  // freeform/spiral placement that happens to land on an unrelated slot,
  // and a claimed item that's since been dragged elsewhere: dragging it back
  // off makes that slot's ghost reappear, since this is a render-time check
  // against current position, not a stored claim.
  const unfilledSlots: { slot: TemplateSlot; index: number }[] = templateId
    ? FIT_TEMPLATES[templateId]
        .map((slot, index) => ({ slot, index }))
        .filter(({ index }) => !claimedSlotIndexes.has(index))
        .filter(({ slot }) => !items.some((item) => isPointWithinSlotRange(slot, item.x, item.y, size.width, size.height)))
        .sort((a, b) => a.slot.zIndex - b.slot.zIndex)
    : [];

  const selectedItem = items.find((item) => item.id === selectedId) ?? null;
  const deleteButtonColor = scheme === 'dark' ? colors.dark.inkSecondary : colors.light.inkSecondary;

  // A plain RN `Pressable` here (an ancestor of each `CanvasItem`'s own
  // `GestureDetector`) doesn't reliably get its touch claim blocked by a
  // descendant's gesture -- the item's Pan gesture selects on touch-*start*,
  // but the ancestor Pressable's `onPress` still fires independently on
  // release, immediately deselecting whatever was just selected. Using the
  // same gesture-handler system for both lets native hit-testing correctly
  // give the descendant priority, so this only ever fires for a tap that no
  // item actually claimed.
  const deselectGesture = Gesture.Tap().onStart(() => {
    runOnJS(selectItem)(null);
  });

  return (
    <View className="flex-1 bg-surface-base px-gutter pt-4 pb-3 dark:bg-surface-baseDark">
      <View
        ref={ref}
        testID="fit-canvas"
        className={`flex-1 overflow-hidden rounded-lg ${
          canvasBackgroundColor ? '' : 'bg-surface-raised dark:bg-surface-raisedDark'
        }`}
        style={[CANVAS_SHADOW, canvasBackgroundColor ? { backgroundColor: canvasBackgroundColor } : null]}
        onLayout={handleLayout}
      >
        {/*
         * Placed items live in their own layer, separate from the delete
         * button below -- items carry their own Reanimated-driven `zIndex`
         * (for reordering among themselves), and relying on a bigger zIndex
         * number for the button to "win" against that turned out unreliable
         * in practice. A later sibling *view group* painting over an earlier
         * one needs no zIndex arithmetic at all.
         *
         * This layer clears the selection on an empty-space tap (see
         * `deselectGesture` above) -- an item's own `GestureDetector` still
         * wins the touch first wherever it actually sits, so this only ever
         * fires for genuinely empty area.
         */}
        <GestureDetector gesture={deselectGesture}>
          <View testID="fit-canvas-background" style={{ flex: 1 }}>
            {size.width > 0 &&
              items.map((item) => {
                const cutoutPath = wardrobeItemCutoutPaths[item.wardrobeItemId];
                const imageUrl = cutoutPath ? (cutoutUrls[cutoutPath] ?? null) : null;
                return (
                  <CanvasItem
                    key={item.id}
                    item={item}
                    imageUrl={imageUrl}
                    canvasWidth={size.width}
                    canvasHeight={size.height}
                    itemSize={CANVAS_ITEM_SIZE}
                    isSelected={!capturing && item.id === selectedId}
                    onSelect={() => handleSelect(item.id)}
                    onTransformEnd={(transform) => updateItemTransform(item.id, transform)}
                  />
                );
              })}
          </View>
        </GestureDetector>
      </View>
      {/*
       * Ghosts and the delete button both render as a sibling overlay, not
       * inside the `ref`'d card above -- `captureRef` (see
       * `app/new-fit.tsx`'s Save flow) only ever captures that card's own
       * subtree, so neither an unfilled template slot nor a leftover
       * "delete this item" button can end up baked into a saved Fit's cover
       * image, regardless of render timing. `position: 'absolute', inset 0`
       * on a sibling within this same padded parent lands on the identical
       * box the card fills (React Native positions an absolute child
       * against its containing block's padding box, same edges a `flex-1`
       * sibling already starts from), so both still line up exactly where
       * they always have. `pointerEvents="box-none"` keeps the overlay
       * itself transparent to touches outside its own children, so tapping
       * empty canvas still reaches the card's deselect gesture underneath.
       */}
      {size.width > 0 && (unfilledSlots.length > 0 || selectedItem) ? (
        <View
          pointerEvents="box-none"
          className="overflow-hidden rounded-lg"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        >
          {unfilledSlots.map(({ slot, index }) => (
            <GhostSlot
              key={index}
              category={slot.category}
              containerWidth={size.width}
              containerHeight={size.height}
              x={slot.x}
              y={slot.y}
              width={slot.width}
              height={slot.height}
              onPress={() => onSlotPress(index, slot.category)}
              canvasBackgroundColor={canvasBackgroundColor}
            />
          ))}
          {selectedItem ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete item"
              onPress={() => removeItem(selectedItem.id)}
              hitSlop={8}
              style={{
                position: 'absolute',
                bottom: 12,
                alignSelf: 'center',
                width: DELETE_BUTTON_SIZE,
                height: DELETE_BUTTON_SIZE,
                borderRadius: DELETE_BUTTON_SIZE / 2,
                shadowColor: '#000',
                shadowOpacity: 0.1,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 3 },
                elevation: DELETE_BUTTON_ELEVATION,
              }}
              className="items-center justify-center border border-border-hairline bg-surface-raised dark:border-border-hairlineDark dark:bg-surface-raisedDark"
            >
              <TrashIcon size={18} color={deleteButtonColor} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});
