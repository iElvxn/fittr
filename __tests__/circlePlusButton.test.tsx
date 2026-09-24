import * as ReactNative from 'react-native';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { CirclePlusButton } from '@/components/ui/CirclePlusButton';
import { PlusIcon } from '@/components/ui/icons/PlusIcon';
import { colors } from '@/lib/theme/colors';

// Stand-in glyph, so the test can read the `color` it was given without
// decoding react-native-svg's processed stroke value.
jest.mock('@/components/ui/icons/PlusIcon', () => ({ PlusIcon: jest.fn(() => null) }));

describe('CirclePlusButton', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.mocked(PlusIcon).mockClear();
  });

  it.each(['light', 'dark'] as const)('uses an inkPrimary fill and surfaceBase glyph in %s mode', async (scheme) => {
    jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue(scheme);
    await render(<CirclePlusButton accessibilityLabel="New fit" />);

    const style = StyleSheet.flatten(screen.getByRole('button', { name: 'New fit' }).props.style) as {
      backgroundColor?: string;
    };
    expect(style.backgroundColor).toBe(colors[scheme].inkPrimary);
    expect(jest.mocked(PlusIcon).mock.lastCall?.[0].color).toBe(colors[scheme].surfaceBase);
  });
});
