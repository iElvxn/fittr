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

const CARD_HEIGHT = 440;
const GUTTER = 16;
const CARD_SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.1,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 6 },
  elevation: 4,
};

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
        <Text variant="meta" className="mb-1 px-gutter text-center uppercase text-ink-secondary dark:text-ink-secondaryDark">
          Choose a template
        </Text>
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
                // Shadow lives on this outer view -- `overflow-hidden` (needed
                // below to clip ghost-slot silhouettes to the rounded corner)
                // would clip the shadow too if applied on the same node.
                style={[{ width: previewWidth, height: CARD_HEIGHT, marginRight: GUTTER }, CARD_SHADOW]}
              >
                <View className="flex-1 overflow-hidden rounded-lg border border-border-hairline bg-surface-raised dark:border-border-hairlineDark dark:bg-surface-raisedDark">
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
              </View>
            );
          })}
        </ScrollView>
        <View className="mt-5 flex-row justify-center gap-2">
          {TEMPLATE_OPTIONS.map((template, index) => (
            <View
              key={template.id}
              className={
                index === pageIndex
                  ? 'h-2 w-2 rounded-full bg-accent dark:bg-accentDark'
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
            <Text variant="label" className="text-ink-secondary dark:text-ink-secondaryDark">
              Skip for now
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
