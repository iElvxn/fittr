import { render, screen, userEvent } from '@testing-library/react-native';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

import { GhostSlot } from '@/components/fitBuilder/GhostSlot';

describe('GhostSlot', () => {
  it('renders as an accessible button labeled with its category', async () => {
    await render(
      <GhostSlot category="top" containerWidth={300} containerHeight={400} x={0.5} y={0.3} onPress={jest.fn()} />,
    );

    expect(screen.getByRole('button', { name: 'Add Top' })).toBeTruthy();
  });

  it('calls onPress when tapped', async () => {
    const onPress = jest.fn();
    const user = userEvent.setup();
    await render(
      <GhostSlot category="shoes" containerWidth={300} containerHeight={400} x={0.5} y={0.3} onPress={onPress} />,
    );

    await user.press(screen.getByRole('button', { name: 'Add Shoes' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('still renders the category label text beneath the badge', async () => {
    await render(
      <GhostSlot category="outerwear" containerWidth={300} containerHeight={400} x={0.5} y={0.3} onPress={jest.fn()} />,
    );

    expect(screen.getByText('Outerwear')).toBeTruthy();
  });

  it('renders as a plain, non-interactive badge when onPress is omitted (template-preview usage)', async () => {
    await render(<GhostSlot category="top" containerWidth={300} containerHeight={400} x={0.5} y={0.3} />);

    expect(screen.getByText('Top')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
