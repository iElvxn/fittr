import { render, screen, userEvent } from '@testing-library/react-native';

import { CanvasBackgroundSheet } from '@/components/fitBuilder/CanvasBackgroundSheet';

describe('CanvasBackgroundSheet', () => {
  it('renders nothing when not visible', async () => {
    await render(
      <CanvasBackgroundSheet visible={false} selectedColor={null} onSelect={jest.fn()} onClose={jest.fn()} />,
    );

    expect(screen.queryByText('Canvas background')).toBeNull();
  });

  it("calls onSelect with a swatch's hex when it is tapped", async () => {
    const onSelect = jest.fn();
    const user = userEvent.setup();
    await render(<CanvasBackgroundSheet visible selectedColor={null} onSelect={onSelect} onClose={jest.fn()} />);

    await user.press(screen.getByRole('button', { name: 'Blush' }));

    expect(onSelect).toHaveBeenCalledWith('#F6DADA');
  });

  it('calls onSelect with null when "Default" is tapped', async () => {
    const onSelect = jest.fn();
    const user = userEvent.setup();
    await render(<CanvasBackgroundSheet visible selectedColor="#F6DADA" onSelect={onSelect} onClose={jest.fn()} />);

    await user.press(screen.getByRole('button', { name: 'Default' }));

    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('marks the currently selected swatch for accessibility', async () => {
    await render(<CanvasBackgroundSheet visible selectedColor="#F6DADA" onSelect={jest.fn()} onClose={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Blush' }).props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByRole('button', { name: 'Peach' }).props.accessibilityState).toMatchObject({
      selected: false,
    });
  });

  it('calls onClose when the scrim behind the sheet is tapped', async () => {
    const onClose = jest.fn();
    const user = userEvent.setup();
    await render(<CanvasBackgroundSheet visible selectedColor={null} onSelect={jest.fn()} onClose={onClose} />);

    await user.press(screen.getByRole('button', { name: 'Dismiss' }));

    expect(onClose).toHaveBeenCalled();
  });
});
