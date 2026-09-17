import { useState } from 'react';
import {
  View,
  Pressable,
  useWindowDimensions,
  ScrollView,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';

import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { GhostSlot } from '@/components/fitBuilder/GhostSlot';
import { FIT_TEMPLATES, TEMPLATE_OPTIONS, type TemplateId } from '@/lib/fitBuilder/templates';

const CARD_HEIGHT = 420;
const GUTTER = 16;

type Props = {
  onSelectTemplate: (templateId: TemplateId) => void;
  onSkip: () => void;
};

/**
 * iOS rubber-bands past both scroll edges by default, so `contentOffset.x`
 * routinely goes negative (left overscroll) or past the last page's offset
 * (right overscroll) during an entirely ordinary swipe -- clamping keeps the
 * derived page index inside the valid array range so `TEMPLATE_OPTIONS[index]`
 * is never `undefined`.
 */
export function clampPageIndex(rawIndex: number, pageCount: number): number {
  return Math.min(pageCount - 1, Math.max(0, rawIndex));
}

/**
 * Swipeable carousel, one page per template. "Skip for now" always starts a
 * blank canvas regardless of which page is showing -- a template is a
 * starting hint, never a requirement, so it doesn't need its own page.
 */
export function TemplatePicker({ onSelectTemplate, onSkip }: Props) {
  const { width } = useWindowDimensions();
  const cardWidth = width - GUTTER * 2;
  const [pageIndex, setPageIndex] = useState(0);

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const rawIndex = Math.round(event.nativeEvent.contentOffset.x / cardWidth);
    setPageIndex(clampPageIndex(rawIndex, TEMPLATE_OPTIONS.length));
  }

  const activeTemplate = TEMPLATE_OPTIONS[pageIndex];

  return (
    <View className="flex-1 justify-between">
      <View>
        <Text variant="title" className="mb-4 px-gutter text-center text-ink-primary dark:text-ink-primaryDark">
          {activeTemplate.label}
        </Text>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          snapToInterval={cardWidth}
          decelerationRate="fast"
          contentContainerStyle={{ paddingHorizontal: GUTTER }}
        >
          {TEMPLATE_OPTIONS.map((template) => {
            // Rendered in ascending z-index so a higher-z slot (e.g. Tops
            // over Coats & Jackets) visually overlaps a lower one behind it,
            // matching the reference layout's overlap.
            const slots = [...FIT_TEMPLATES[template.id]].sort((a, b) => a.zIndex - b.zIndex);
            const previewWidth = cardWidth - GUTTER;
            return (
              <View
                key={template.id}
                style={{ width: previewWidth, height: CARD_HEIGHT, marginRight: GUTTER }}
                className="overflow-hidden rounded-md border border-border-hairline bg-surface-raised dark:border-border-hairlineDark dark:bg-surface-raisedDark"
              >
                {slots.map((slot, index) => (
                  <GhostSlot
                    key={`${slot.category}-${index}`}
                    category={slot.category}
                    containerWidth={previewWidth}
                    containerHeight={CARD_HEIGHT}
                    x={slot.x}
                    y={slot.y}
                    width={slot.width}
                    height={slot.height}
                  />
                ))}
              </View>
            );
          })}
        </ScrollView>
        <View className="mt-4 flex-row justify-center gap-2">
          {TEMPLATE_OPTIONS.map((template, index) => (
            <View
              key={template.id}
              className={
                index === pageIndex
                  ? 'h-2 w-2 rounded-full bg-ink-primary dark:bg-ink-primaryDark'
                  : 'h-2 w-2 rounded-full bg-border-hairline dark:bg-border-hairlineDark'
              }
            />
          ))}
        </View>
      </View>

      <View className="px-gutter pb-10">
        <Button title="Use this template" variant="primary" onPress={() => onSelectTemplate(activeTemplate.id)} />
        <View className="mt-4 items-center">
          <Pressable accessibilityRole="button" onPress={onSkip} hitSlop={12}>
            <Text variant="label" className="text-ink-secondary underline dark:text-ink-secondaryDark">
              Skip for now
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
