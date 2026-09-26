import { PixelRatio, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';

const ITALIC_SERIF = 'Newsreader_400Regular_Italic';
const HEADLINE_FONT_SIZE = 28;
const HEADLINE_LINE_HEIGHT = 34;
const MIN_HEIGHT = 300;

type Props = {
  /** With no Fits saved there is nothing to plan yet, so the card points to the builder instead. */
  hasFits: boolean;
  onPlan: () => void;
  onBuild: () => void;
};

/** Home with no live Fit planned for today. */
export function NothingPlannedCard({ hasFits, onPlan, onBuild }: Props) {
  const fontScale = PixelRatio.getFontScale();

  return (
    <View
      style={{ minHeight: MIN_HEIGHT }}
      className="items-start justify-end gap-3 rounded-lg bg-surface-tile px-6 py-8 dark:bg-surface-tileDark"
    >
      <Text
        variant="title"
        style={{
          fontFamily: ITALIC_SERIF,
          fontSize: HEADLINE_FONT_SIZE * fontScale,
          lineHeight: HEADLINE_LINE_HEIGHT * fontScale,
        }}
        className="text-ink-primary dark:text-ink-primaryDark"
      >
        Nothing planned for today.
      </Text>
      <Text variant="body" className="text-ink-secondary dark:text-ink-secondaryDark">
        {hasFits ? "Pick one of your Fits and it'll be waiting here each morning." : 'Save a Fit first, then plan it here.'}
      </Text>
      <View className="mt-2">
        {hasFits ? (
          <Button title="Plan today's Fit" variant="primary" onPress={onPlan} />
        ) : (
          <Button title="Build a Fit" variant="primary" onPress={onBuild} />
        )}
      </View>
    </View>
  );
}
