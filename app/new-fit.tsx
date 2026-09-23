import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { captureRef } from 'react-native-view-shot';
import { useQueryClient } from '@tanstack/react-query';

import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { CloseIcon } from '@/components/ui/icons/CloseIcon';
import { PlusIcon } from '@/components/ui/icons/PlusIcon';
import { PaletteIcon } from '@/components/ui/icons/PaletteIcon';
import { CheckIcon } from '@/components/ui/icons/CheckIcon';
import { TemplatePicker } from '@/components/fitBuilder/TemplatePicker';
import { FitCanvas } from '@/components/fitBuilder/FitCanvas';
import { CatalogSheet } from '@/components/fitBuilder/CatalogSheet';
import { CanvasBackgroundSheet } from '@/components/fitBuilder/CanvasBackgroundSheet';
import { SaveFitSheet } from '@/components/fitBuilder/SaveFitSheet';
import { ConnectionErrorNotice } from '@/components/ConnectionErrorNotice';
import { useSession } from '@/lib/auth/useSession';
import { useWardrobeItems, type WardrobeItemRow } from '@/lib/wardrobe/listItems';
import { useThumbnailUrls } from '@/lib/wardrobe/thumbnailUrls';
import { useFitBuilderStore, type PlacedItem } from '@/stores/fitBuilder';
import { colors } from '@/lib/theme/colors';
import { getNextFitName } from '@/lib/fits/nextFitName';
import { getFitItems } from '@/lib/fits/getFitItems';
import { useFits } from '@/lib/fits/listFits';
import { uploadCover, insertFit, type FitItemPlacement } from '@/lib/fits/saveFit';
import { FitError, NO_CONNECTION_MESSAGE, UNKNOWN_ERROR_MESSAGE } from '@/lib/fits/errors';
import { Sentry } from '@/lib/observability/sentry';
import type { TemplateId } from '@/lib/fitBuilder/templates';
import type { WardrobeItemCategory } from '@/lib/wardrobe/addItem';

const CLOSE_BUTTON_SIZE = 36;

type ScreenMode = 'template' | 'canvas';

/** Pending state between tapping Save and confirming the sheet -- `fitId` stays fixed across a retry so a failed save's upload/insert stay idempotent. */
type PendingSave = {
  fitId: string;
  collageUri: string;
  defaultName: string;
};

/**
 * Entry flow for building a Fit: template carousel, freeform canvas, then
 * preview/name/save. An optional `fitId` param (Story 3.3) switches this
 * same screen into edit mode: skip the template picker, seed the canvas
 * from that Fit's saved placements, and re-save updates it in place instead
 * of creating a new one.
 */
export default function NewFit() {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const { session } = useSession();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  const { fitId } = useLocalSearchParams<{ fitId?: string }>();
  const isEditMode = Boolean(fitId);

  const [mode, setMode] = useState<ScreenMode>(fitId ? 'canvas' : 'template');
  const [seeded, setSeeded] = useState(!isEditMode);
  const [seedError, setSeedError] = useState<string | null>(null);
  // `null` means the catalog sheet is closed. An exact { index, category }
  // means a specific ghost slot's "+" was tapped -- the sheet opens
  // pre-filtered to that category, and a pick commits to that exact slot
  // index regardless of the picked item's own category. 'all' means the
  // bottom "Add item" bar was tapped instead (sheet opens unfiltered, and a
  // pick falls back to the item's own category with no slot to target).
  const [activeSlot, setActiveSlot] = useState<{ index: number; category: WardrobeItemCategory } | 'all' | null>(
    null,
  );

  const selectTemplate = useFitBuilderStore((state) => state.selectTemplate);
  const addItem = useFitBuilderStore((state) => state.addItem);
  const loadItems = useFitBuilderStore((state) => state.loadItems);
  const reset = useFitBuilderStore((state) => state.reset);
  const canvasBackgroundColor = useFitBuilderStore((state) => state.canvasBackgroundColor);
  const setCanvasBackgroundColor = useFitBuilderStore((state) => state.setCanvasBackgroundColor);
  // Named apart from the wardrobe catalog's own `items` below -- these are the
  // canvas's placed items (position/scale/rotation), not the tray's source list.
  const placedItems = useFitBuilderStore((state) => state.items);
  const [backgroundPickerOpen, setBackgroundPickerOpen] = useState(false);

  const canvasRef = useRef<View>(null);
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);
  const [opening, setOpening] = useState(false);
  const [saving, setSaving] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [captureError, setCaptureError] = useState(false);
  const [capturingCollage, setCapturingCollage] = useState(false);

  const { data: wardrobeItems, isLoading: wardrobeItemsLoading } = useWardrobeItems(userId);
  const items = useMemo(() => wardrobeItems ?? [], [wardrobeItems]);

  const thumbPaths = useMemo(() => items.map((item) => item.thumb_path), [items]);
  const { data: thumbnailUrls } = useThumbnailUrls(thumbPaths);

  const cutoutPaths = useMemo(() => items.map((item) => item.cutout_path), [items]);
  const { data: cutoutUrls } = useThumbnailUrls(cutoutPaths);

  const wardrobeItemCutoutPaths = useMemo(
    () => Object.fromEntries(items.map((item) => [item.id, item.cutout_path])),
    [items],
  );

  // Edit mode's own name/cover-path source -- same cached-list convention as
  // `app/item/[id].tsx`, not a second single-Fit fetch.
  const { data: fits, isLoading: fitsLoading } = useFits(userId);
  const editingFit = isEditMode ? fits?.find((candidate) => candidate.id === fitId) : undefined;
  // Only meaningful once `fits` has actually settled -- `fits?.find` misses
  // during the brief window before that list loads too, which must not be
  // mistaken for "this Fit doesn't exist." `fits` filters `deleted_at is
  // null`, so this is also `true` for a `fitId` the current user already
  // soft-deleted -- without this check, `getFitItems` would still seed from
  // its (undeleted) `fit_items` rows, since that table's own RLS policy
  // checks only `fits.user_id`, not `fits.deleted_at`, and a re-save would
  // silently resurrect it via `insertFit`'s `deleted_at: null` upsert.
  const fitNotFound = isEditMode && !fitsLoading && !editingFit;

  /**
   * Fetches the Fit's saved placements and seeds the canvas directly via
   * `loadItems` -- never through `addItem`, since these already carry their
   * final position/scale/rotation/z-index. Callable both from the
   * mount-time effect below and from the loading screen's Retry action.
   */
  async function loadFit(targetFitId: string) {
    setSeedError(null);
    try {
      const placements = await getFitItems(targetFitId);
      const seededItems: PlacedItem[] = placements.map((placement) => ({
        id: placement.id,
        wardrobeItemId: placement.wardrobeItemId,
        // `getFitItems` now joins `wardrobe_items` itself, so `category`
        // (and whether the source item was deleted) comes straight from
        // that row -- correct even once the item's gone, instead of
        // guessing from the live (non-deleted-only) wardrobe list.
        category: placement.category,
        wardrobeItemDeleted: placement.wardrobeItemDeleted,
        templateSlotIndex: null,
        x: placement.x,
        y: placement.y,
        scale: placement.scale,
        rotation: placement.rotation,
        zIndex: placement.zIndex,
      }));
      loadItems(seededItems, editingFit?.canvas_background_color ?? null);
      setSeeded(true);
    } catch (error) {
      if (error instanceof FitError && error.kind === 'no_connection') {
        setSeedError(NO_CONNECTION_MESSAGE);
      } else {
        Sentry.captureException(error);
        setSeedError(UNKNOWN_ERROR_MESSAGE);
      }
    }
  }

  useEffect(() => {
    if (!fitId || seeded || !userId || wardrobeItemsLoading || fitsLoading || !editingFit) {
      return;
    }
    // Wrapped in its own async callback (not a bare call to the hoisted
    // `loadFit`) so its `setState` calls happen inside a callback rather
    // than synchronously in the effect body -- see
    // https://react.dev/learn/you-might-not-need-an-effect.
    void (async () => {
      await loadFit(fitId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once wardrobe items/the Fit list are ready; a failure is retried by the Retry button, not by re-running this effect.
  }, [fitId, seeded, userId, wardrobeItemsLoading, fitsLoading, editingFit]);

  // Discards any in-progress arrangement on the way out -- Story 3.1 has no
  // persistence, so backing out (or a future re-entry) must never carry
  // stale placements from a previous session.
  useEffect(() => {
    return () => reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on unmount by design; reset is stable.
  }, []);

  function handleSelectTemplate(templateId: TemplateId) {
    selectTemplate(templateId);
    setMode('canvas');
  }

  function handleSkip() {
    selectTemplate(null);
    setMode('canvas');
  }

  function handleSlotPress(index: number, category: WardrobeItemCategory) {
    setActiveSlot({ index, category });
  }

  function handleSelectItem(item: WardrobeItemRow) {
    if (activeSlot && activeSlot !== 'all') {
      addItem(item.id, activeSlot.category, activeSlot.index);
    } else {
      addItem(item.id, item.category);
    }
    setActiveSlot(null);
  }

  /**
   * Captures the canvas and opens the Save sheet. `fitId` is minted here (not
   * inside the sheet) so it stays fixed across a retry -- `saveFit`'s upsert
   * calls key off it for idempotency. The default-name fetch is best-effort:
   * a failure there shouldn't block the sheet from opening, since the user
   * can still type their own name -- the real no-connection retry UX is the
   * actual save below.
   */
  async function handleSavePress() {
    if (opening || saving || placedItems.length === 0 || !userId) {
      return;
    }
    setOpening(true);
    setCaptureError(false);
    try {
      // Suppresses the selected item's outline/shadow and the delete
      // button for the capture -- neither belongs in a saved Fit's cover.
      // A state change alone isn't enough: `captureRef` reads whatever the
      // native tree has actually painted, so this waits a couple of frames
      // (the standard RN pattern for "wait for a just-triggered re-render
      // to land before screenshotting") before capturing.
      setCapturingCollage(true);
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const collageUri = await captureRef(canvasRef, { format: 'png', quality: 1 });
      // Editing reuses the Fit's own current name as the sheet's starting
      // point (still editable) and skips the generated-default fetch
      // entirely -- that fetch only makes sense for a brand-new Fit.
      let defaultName = editingFit?.name ?? 'Fit';
      if (!isEditMode) {
        try {
          defaultName = await getNextFitName(userId);
        } catch (error) {
          Sentry.captureException(error);
        }
      }
      setConnectionError(false);
      setPendingSave({ fitId: isEditMode && fitId ? fitId : Crypto.randomUUID(), collageUri, defaultName });
    } catch (error) {
      console.error('[new-fit] collage capture failed:', error);
      Sentry.captureException(error);
      setCaptureError(true);
    } finally {
      setCapturingCollage(false);
      setOpening(false);
    }
  }

  async function handleConfirmSave(name: string) {
    if (!pendingSave || !userId) {
      return;
    }
    setSaving(true);
    setConnectionError(false);
    try {
      const coverPath = await uploadCover(userId, pendingSave.fitId, pendingSave.collageUri);
      const placements: FitItemPlacement[] = placedItems.map((item) => ({
        id: item.id,
        wardrobeItemId: item.wardrobeItemId,
        x: item.x,
        y: item.y,
        scale: item.scale,
        rotation: item.rotation,
        zIndex: item.zIndex,
      }));
      await insertFit(
        userId,
        pendingSave.fitId,
        name,
        coverPath,
        editingFit?.cover_path ?? null,
        canvasBackgroundColor,
        placements,
      );
      // Both the Fits tab list and (in edit mode) the Fit detail screen read
      // through `useFits`'s cache -- without this, a just-created or
      // just-edited Fit wouldn't show up until some unrelated refetch.
      await queryClient.invalidateQueries({ queryKey: ['fits', userId] });
      // `app/fit/[id].tsx`'s zero-item empty state (Story 3.4) reads a
      // separate `['fitItems', fitId]` cache -- that screen has no
      // focus-refetch of its own either, so without this an edit that empties
      // (or re-fills) a Fit wouldn't be reflected there until some unrelated
      // refetch. Always the current `pendingSave.fitId`, valid for both a
      // fresh save and an edit re-save.
      await queryClient.invalidateQueries({ queryKey: ['fitItems', pendingSave.fitId] });
      const savedFitId = pendingSave.fitId;
      setPendingSave(null);
      reset();
      if (isEditMode) {
        router.dismissTo({ pathname: '/fit/[id]', params: { id: savedFitId, fitUpdated: '1' } });
      } else {
        router.dismissTo({ pathname: '/(tabs)/fits', params: { fitSaved: '1' } });
      }
    } catch (error) {
      if (!(error instanceof FitError && error.kind === 'no_connection')) {
        console.error('[new-fit] save failed:', error);
        Sentry.captureException(error);
      }
      // Block-and-keep for every failure here, not only classified
      // no-connection ones: the sheet's collage/name stay intact and the
      // same retry action applies regardless of cause.
      setConnectionError(true);
    } finally {
      setSaving(false);
    }
  }

  const closeButtonColor = scheme === 'dark' ? colors.dark.inkSecondary : colors.light.inkSecondary;

  if (fitNotFound) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-base px-gutter dark:bg-surface-baseDark">
        <Text variant="body" className="mb-6 text-center text-ink-secondary dark:text-ink-secondaryDark">
          This Fit is no longer available.
        </Text>
        <Button title="Back" variant="primary" onPress={() => router.back()} />
      </View>
    );
  }

  if (isEditMode && !seeded) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-base px-gutter dark:bg-surface-baseDark">
        {seedError ? (
          <>
            <View className="mb-6 w-full">
              <ConnectionErrorNotice message={seedError} />
            </View>
            <Button title="Retry" variant="primary" onPress={() => fitId && void loadFit(fitId)} />
          </>
        ) : (
          <ActivityIndicator testID="new-fit-edit-loading" />
        )}
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface-base dark:bg-surface-baseDark">
      {mode === 'template' ? (
        <>
          <View
            style={{ paddingTop: insets.top + 6 }}
            className="flex-row items-center justify-between border-b border-border-hairline px-gutter pb-2 dark:border-border-hairlineDark"
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              onPress={() => router.back()}
              hitSlop={8}
              style={{ width: CLOSE_BUTTON_SIZE, height: CLOSE_BUTTON_SIZE, borderRadius: CLOSE_BUTTON_SIZE / 2 }}
              className="items-center justify-center border border-border-hairline dark:border-border-hairlineDark"
            >
              <CloseIcon size={16} color={closeButtonColor} />
            </Pressable>
            <Text variant="title" className="text-ink-primary dark:text-ink-primaryDark">
              New Fit
            </Text>
            <View style={{ width: CLOSE_BUTTON_SIZE }} />
          </View>
          <TemplatePicker onSelectTemplate={handleSelectTemplate} onSkip={handleSkip} />
        </>
      ) : (
        // A proper header row (not floating over the canvas) holds Cancel
        // and Save, mirroring the template-picker header's own bordered
        // section above -- the canvas is still the working surface, but it
        // sits in the space actually left over beneath this row rather than
        // underneath buttons overlaid on top of it.
        <View className="flex-1">
          <View
            style={{ paddingTop: insets.top + 8 }}
            className="flex-row items-center justify-between border-b border-border-hairline px-gutter pb-2 dark:border-border-hairlineDark"
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              onPress={() => router.back()}
              hitSlop={8}
              style={{ width: CLOSE_BUTTON_SIZE, height: CLOSE_BUTTON_SIZE, borderRadius: CLOSE_BUTTON_SIZE / 2 }}
              className="items-center justify-center border border-border-hairline dark:border-border-hairlineDark"
            >
              <CloseIcon size={16} color={closeButtonColor} />
            </Pressable>
            <Button
              title="Save"
              variant="primary"
              loading={opening}
              disabled={placedItems.length === 0}
              onPress={handleSavePress}
              leftIcon={<CheckIcon size={14} color={scheme === 'dark' ? colors.dark.surfaceBase : colors.light.surfaceBase} />}
              accessibilityLabel="Save Fit"
            />
          </View>
          {captureError ? (
            <View className="px-gutter pt-3">
              <ConnectionErrorNotice message={UNKNOWN_ERROR_MESSAGE} />
            </View>
          ) : null}
          <FitCanvas
            ref={canvasRef}
            cutoutUrls={cutoutUrls ?? {}}
            wardrobeItemCutoutPaths={wardrobeItemCutoutPaths}
            onSlotPress={handleSlotPress}
            capturing={capturingCollage}
          />
          <View
            style={{ paddingBottom: insets.bottom + 8 }}
            className="flex-row items-center justify-center border-t border-border-hairline pt-3 dark:border-border-hairlineDark"
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Canvas background"
              onPress={() => setBackgroundPickerOpen(true)}
              hitSlop={8}
              className="flex-row items-center gap-2 px-4 py-2 active:opacity-60"
            >
              <PaletteIcon size={18} color={closeButtonColor} />
              <Text variant="label" className="text-ink-secondary dark:text-ink-secondaryDark">
                Background
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add item"
              onPress={() => setActiveSlot('all')}
              hitSlop={8}
              className="flex-row items-center gap-2 px-4 py-2 active:opacity-60"
            >
              <PlusIcon size={18} color={closeButtonColor} />
              <Text variant="label" className="text-ink-secondary dark:text-ink-secondaryDark">
                Add item
              </Text>
            </Pressable>
          </View>
          {activeSlot ? (
            <CatalogSheet
              key={activeSlot === 'all' ? 'all' : `slot-${activeSlot.index}`}
              visible
              category={activeSlot === 'all' ? 'all' : activeSlot.category}
              items={items}
              thumbnailUrls={thumbnailUrls ?? {}}
              onSelectItem={handleSelectItem}
              onClose={() => setActiveSlot(null)}
            />
          ) : null}
          <CanvasBackgroundSheet
            visible={backgroundPickerOpen}
            selectedColor={canvasBackgroundColor}
            onSelect={(hex) => {
              setCanvasBackgroundColor(hex);
              setBackgroundPickerOpen(false);
            }}
            onClose={() => setBackgroundPickerOpen(false)}
          />
          {pendingSave ? (
            <SaveFitSheet
              visible
              collageUri={pendingSave.collageUri}
              defaultName={pendingSave.defaultName}
              saving={saving}
              connectionError={connectionError}
              onSave={handleConfirmSave}
              onClose={() => setPendingSave(null)}
            />
          ) : null}
        </View>
      )}
    </View>
  );
}
