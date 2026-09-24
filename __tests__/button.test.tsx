import * as ReactNative from 'react-native';
import { StyleSheet } from 'react-native';
import { render, screen, userEvent } from '@testing-library/react-native';

import { Button } from '@/components/ui/Button';
import { colors } from '@/lib/theme/colors';
import { typeScale } from '@/lib/theme/fonts';

function labelStyle(text: string) {
  return StyleSheet.flatten(screen.getByText(text).props.style);
}

describe('Button', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each(['light', 'dark'] as const)('colors the loading spinner for the %s scheme', async (scheme) => {
    jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue(scheme);

    await render(<Button title="Save" variant="primary" loading />);
    expect(screen.getByTestId('button-spinner').props.color).toBe(colors[scheme].surfaceBase);

    await render(<Button title="Cancel" loading />);
    expect(screen.getByTestId('button-spinner').props.color).toBe(colors[scheme].inkPrimary);
  });

  it('primary is an ink fill with inverse (surface-base) text in both modes', async () => {
    await render(<Button title="Save" variant="primary" />);

    const button = screen.getByRole('button', { name: 'Save' });
    expect(button.props.className).toContain('bg-ink-primary');
    expect(button.props.className).toContain('dark:bg-ink-primaryDark');
    expect(button.props.className).not.toMatch(/accent/);

    const label = screen.getByText('Save');
    expect(label.props.className).toContain('text-surface-base');
    expect(label.props.className).toContain('dark:text-surface-baseDark');
  });

  it('secondary is an ink outline with a transparent fill', async () => {
    await render(<Button title="Cancel" />);

    const button = screen.getByRole('button', { name: 'Cancel' });
    expect(button.props.className).toContain('border');
    expect(button.props.className).toContain('border-ink-primary');
    expect(button.props.className).toContain('bg-transparent');
    expect(screen.getByText('Cancel').props.className).toContain('text-ink-primary');
  });

  it('is square-cornered with a 48pt minimum height', async () => {
    await render(<Button title="Save" variant="primary" />);

    const className = screen.getByRole('button', { name: 'Save' }).props.className;
    expect(className).toContain('rounded-sm');
    expect(className).toContain('min-h-12');
  });

  it('uses the caption type role for its label', async () => {
    await render(<Button title="Save" variant="primary" />);

    const style = labelStyle('Save');
    expect(style.fontFamily).toBe(typeScale.caption.fontFamily);
    expect(style.textTransform).toBe('uppercase');
  });

  it('shows a spinner instead of the label and blocks presses while loading', async () => {
    const onPress = jest.fn();
    const user = userEvent.setup();
    await render(<Button title="Save" variant="primary" loading onPress={onPress} />);

    expect(screen.queryByText('Save')).toBeNull();
    expect(screen.getByTestId('button-spinner')).toBeTruthy();
    const button = screen.getByRole('button');
    expect(button.props.className).toContain('opacity-50');

    await user.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('is dimmed and does not fire when disabled', async () => {
    const onPress = jest.fn();
    const user = userEvent.setup();
    await render(<Button title="Save" disabled onPress={onPress} />);

    const button = screen.getByRole('button', { name: 'Save' });
    expect(button.props.className).toContain('opacity-50');
    await user.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('fires onPress when enabled', async () => {
    const onPress = jest.fn();
    const user = userEvent.setup();
    await render(<Button title="Save" onPress={onPress} />);

    await user.press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
