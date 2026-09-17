import { useEffect, useMemo, useState } from 'react';
import { Pressable, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { Text } from '@/components/ui/Text';
import { CloseIcon } from '@/components/ui/icons/CloseIcon';
import { TemplatePicker } from '@/components/fitBuilder/TemplatePicker';
import { FitCanvas } from '@/components/fitBuilder/FitCanvas';
import { CategoryTray } from '@/components/fitBuilder/CategoryTray';
import { useSession } from '@/lib/auth/useSession';
import { useWardrobeItems, type WardrobeItemRow } from '@/lib/wardrobe/listItems';
import { useThumbnailUrls } from '@/lib/wardrobe/thumbnailUrls';
import { useFitBuilderStore } from '@/stores/fitBuilder';
import { colors } from '@/lib/theme/colors';
import type { TemplateId } from '@/lib/fitBuilder/templates';

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

  function handleAddItem(item: WardrobeItemRow) {
    addItem(item.id, item.category);
  }

  return (
    <View className="flex-1 bg-surface-base dark:bg-surface-baseDark">
      <View
        style={{ paddingTop: insets.top + 12 }}
        className="flex-row items-center justify-between border-b border-border-hairline px-gutter pb-3 dark:border-border-hairlineDark"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          onPress={() => router.back()}
          hitSlop={8}
          style={{ width: CLOSE_BUTTON_SIZE, height: CLOSE_BUTTON_SIZE, borderRadius: CLOSE_BUTTON_SIZE / 2 }}
          className="items-center justify-center border border-border-hairline dark:border-border-hairlineDark"
        >
          <CloseIcon size={16} color={scheme === 'dark' ? colors.dark.inkSecondary : colors.light.inkSecondary} />
        </Pressable>
        <Text variant="title" className="text-ink-primary dark:text-ink-primaryDark">
          New Fit
        </Text>
        <View style={{ width: CLOSE_BUTTON_SIZE }} />
      </View>

      {mode === 'template' ? (
        <TemplatePicker onSelectTemplate={handleSelectTemplate} onSkip={handleSkip} />
      ) : (
        <>
          <FitCanvas cutoutUrls={cutoutUrls ?? {}} wardrobeItemCutoutPaths={wardrobeItemCutoutPaths} />
          <CategoryTray items={items} thumbnailUrls={thumbnailUrls ?? {}} onAddItem={handleAddItem} />
        </>
      )}
    </View>
  );
}
