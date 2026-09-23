import * as ReactNative from 'react-native';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { AddItemTabButton } from '@/components/navigation/AddItemTabButton';
import { PlusIcon } from '@/components/ui/icons/PlusIcon';
import { colors } from '@/lib/theme/colors';

// Stand-in glyph, so the test can read the `color` it was given without
// decoding react-native-svg's processed stroke value.
jest.mock('@/components/ui/icons/PlusIcon', () => ({ PlusIcon: jest.fn(() => null) }));

describe('AddItemTabButton', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.mocked(PlusIcon).mockClear();
  });

  it.each(['light', 'dark'] as const)('uses an inkPrimary fill and surfaceBase glyph in %s mode', async (scheme) => {
    jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue(scheme);
    await render(<AddItemTabButton />);

    const button = screen.getByRole('button', { name: 'Add item' });
    const circle = button.children.find((child) => typeof child !== 'string');
    if (!circle || typeof circle === 'string') throw new Error('expected the fill circle as the button child');
    const style = StyleSheet.flatten(circle.props.style) as { backgroundColor?: string };
    expect(style.backgroundColor).toBe(colors[scheme].inkPrimary);
    expect(jest.mocked(PlusIcon).mock.lastCall?.[0].color).toBe(colors[scheme].surfaceBase);
  });
});
