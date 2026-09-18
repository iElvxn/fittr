import { useEffect, useMemo, useState } from 'react';
import { Pressable, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { Text } from '@/components/ui/Text';
import { CloseIcon } from '@/components/ui/icons/CloseIcon';
import { PlusIcon } from '@/components/ui/icons/PlusIcon';
import { TemplatePicker } from '@/components/fitBuilder/TemplatePicker';
import { FitCanvas } from '@/components/fitBuilder/FitCanvas';
import { CatalogSheet } from '@/components/fitBuilder/CatalogSheet';
import type { CategoryFilter } from '@/components/wardrobe/CategoryFilterChips';
import { useSession } from '@/lib/auth/useSession';
import { useWardrobeItems, type WardrobeItemRow } from '@/lib/wardrobe/listItems';
import { useThumbnailUrls } from '@/lib/wardrobe/thumbnailUrls';
import { useFitBuilderStore } from '@/stores/fitBuilder';
import { colors } from '@/lib/theme/colors';
import type { TemplateId } from '@/lib/fitBuilder/templates';
import { resolvePlacementCategory } from '@/lib/fitBuilder/placement';

const CLOSE_BUTTON_SIZE = 36;

type ScreenMode = 'template' | 'canvas';

/**
 * Entry flow for building a Fit: template carousel, then the freeform
 * canvas. No Save button here -- preview/save/persistence is Story 3.2's
 * scope, and a non-functional Save would be a half-finished UI element.
 */
export default function NewFit() {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const { session } = useSession();
  const userId = session?.user.id;

  const [mode, setMode] = useState<ScreenMode>('template');
  // `null` means the catalog sheet is closed. A real category means a ghost
  // slot's "+" was tapped (sheet opens pre-filtered to it); 'all' means the
  // bottom "Add item" bar was tapped (sheet opens unfiltered).
  const [activeSlotCategory, setActiveSlotCategory] = useState<CategoryFilter | null>(null);

  const selectTemplate = useFitBuilderStore((state) => state.selectTemplate);
  const addItem = useFitBuilderStore((state) => state.addItem);
  const reset = useFitBuilderStore((state) => state.reset);

  const { data: wardrobeItems } = useWardrobeItems(userId);
  const items = useMemo(() => wardrobeItems ?? [], [wardrobeItems]);

  const thumbPaths = useMemo(() => items.map((item) => item.thumb_path), [items]);
  const { data: thumbnailUrls } = useThumbnailUrls(thumbPaths);

  const cutoutPaths = useMemo(() => items.map((item) => item.cutout_path), [items]);
  const { data: cutoutUrls } = useThumbnailUrls(cutoutPaths);

  const wardrobeItemCutoutPaths = useMemo(
    () => Object.fromEntries(items.map((item) => [item.id, item.cutout_path])),
    [items],
  );

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

  function handleSelectItem(item: WardrobeItemRow) {
    addItem(item.id, resolvePlacementCategory(activeSlotCategory ?? 'all', item.category));
    setActiveSlotCategory(null);
  }

  const closeButtonColor = scheme === 'dark' ? colors.dark.inkSecondary : colors.light.inkSecondary;

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
        // No header bar here -- the canvas is the working surface, and a
        // titled bar above it just eats vertical space. A bare close button
        // still floats over the top-left corner (unlike the page-sheet
        // 'modal' presentation this screen used before, `fullScreenModal`
        // has no swipe-to-dismiss gesture, so this is the only way out).
        <View className="flex-1" style={{ paddingTop: insets.top + 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            onPress={() => router.back()}
            hitSlop={8}
            style={{
              position: 'absolute',
              top: insets.top + 8,
              left: 16,
              width: CLOSE_BUTTON_SIZE,
              height: CLOSE_BUTTON_SIZE,
              borderRadius: CLOSE_BUTTON_SIZE / 2,
              zIndex: 10,
            }}
            className="items-center justify-center border border-border-hairline bg-surface-base dark:border-border-hairlineDark dark:bg-surface-baseDark"
          >
            <CloseIcon size={16} color={closeButtonColor} />
          </Pressable>
          <FitCanvas
            cutoutUrls={cutoutUrls ?? {}}
            wardrobeItemCutoutPaths={wardrobeItemCutoutPaths}
            onSlotPress={setActiveSlotCategory}
          />
          <View
            style={{ paddingBottom: insets.bottom + 8 }}
            className="items-center border-t border-border-hairline pt-3 dark:border-border-hairlineDark"
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add item"
              onPress={() => setActiveSlotCategory('all')}
              hitSlop={8}
              className="flex-row items-center gap-2 px-4 py-2 active:opacity-60"
            >
              <PlusIcon size={18} color={closeButtonColor} />
              <Text variant="label" className="text-ink-secondary dark:text-ink-secondaryDark">
                Add item
              </Text>
            </Pressable>
          </View>
          {activeSlotCategory ? (
            <CatalogSheet
              key={activeSlotCategory}
              visible
              category={activeSlotCategory}
              items={items}
              thumbnailUrls={thumbnailUrls ?? {}}
              onSelectItem={handleSelectItem}
              onClose={() => setActiveSlotCategory(null)}
            />
          ) : null}
        </View>
      )}
    </View>
  );
}
