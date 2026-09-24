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

/** Inset from the screen edge to each card's edge -- keeping this equal on both sides is what centers the active card. */
const SIDE_INSET = 40;
/** Invisible gap between adjacent cards. The difference between this and SIDE_INSET is how much of the next card peeks in. */
const CARD_GAP = 16;
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
  const { width, height } = useWindowDimensions();
  // Card is centered by construction: equal SIDE_INSET on both sides of the
  // viewport leaves a matching gap, and CARD_GAP eats into that gap so only
  // a slight sliver of the next card peeks past the active one.
  const previewWidth = width - SIDE_INSET * 2;
  const pageInterval = previewWidth + CARD_GAP;
  // Tall and slim rather than a fixed square-ish height -- scales with the
  // screen now that this picker renders full-screen, capped so it doesn't
  // dwarf the button on very tall devices.
  const cardHeight = Math.min(600, height * 0.6);
  const [pageIndex, setPageIndex] = useState(0);

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const rawIndex = Math.round(event.nativeEvent.contentOffset.x / pageInterval);
    setPageIndex(clampPageIndex(rawIndex, TEMPLATE_OPTIONS.length));
  }

  const activeTemplate = TEMPLATE_OPTIONS[pageIndex];

  return (
    <View className="flex-1">
      <View className="flex-1 justify-center mb-6">
        <Text variant="meta" className="mt-2 mb-1 px-gutter text-center uppercase text-ink-secondary dark:text-ink-secondaryDark">
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
          snapToInterval={pageInterval}
          decelerationRate="fast"
          contentContainerStyle={{ paddingHorizontal: SIDE_INSET }}
        >
          {TEMPLATE_OPTIONS.map((template) => {
            // Rendered in ascending z-index so a higher-z slot (e.g. Tops
            // over Coats & Jackets) visually overlaps a lower one behind it,
            // matching the reference layout's overlap.
            const slots = [...FIT_TEMPLATES[template.id]].sort((a, b) => a.zIndex - b.zIndex);
            return (
              <View
                key={template.id}
                // Shadow lives on this outer view -- `overflow-hidden` (needed
                // below to clip ghost-slot silhouettes to the rounded corner)
                // would clip the shadow too if applied on the same node.
                style={[{ width: previewWidth, height: cardHeight, marginRight: CARD_GAP }, CARD_SHADOW]}
              >
                <View className="flex-1 overflow-hidden rounded-lg border border-border-hairline bg-surface-raised dark:border-border-hairlineDark dark:bg-surface-raisedDark">
                  {slots.map((slot, index) => (
                    <GhostSlot
                      key={`${slot.category}-${index}`}
                      category={slot.category}
                      containerWidth={previewWidth}
                      containerHeight={cardHeight}
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
            <Text variant="label" className="text-ink-secondary dark:text-ink-secondaryDark">
              Skip for now
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
