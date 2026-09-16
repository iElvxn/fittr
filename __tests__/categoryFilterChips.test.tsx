import { render, screen, userEvent } from '@testing-library/react-native';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

import { CategoryFilterChips } from '@/components/wardrobe/CategoryFilterChips';

describe('CategoryFilterChips', () => {
  it('renders an "All" chip plus one chip per fixed category', async () => {
    await render(<CategoryFilterChips selected="all" onSelect={jest.fn()} />);

    expect(screen.getByText('All')).toBeTruthy();
    expect(screen.getByText('Top')).toBeTruthy();
    expect(screen.getByText('Bottom')).toBeTruthy();
    expect(screen.getByText('Shoes')).toBeTruthy();
    expect(screen.getByText('Outerwear')).toBeTruthy();
    expect(screen.getByText('Accessory')).toBeTruthy();
  });

  it('calls onSelect with the tapped category', async () => {
    const onSelect = jest.fn();
    const user = userEvent.setup();
    await render(<CategoryFilterChips selected="all" onSelect={onSelect} />);

    await user.press(screen.getByText('Shoes'));

    expect(onSelect).toHaveBeenCalledWith('shoes');
  });

  it('marks only the selected chip as accessibility-selected', async () => {
    await render(<CategoryFilterChips selected="shoes" onSelect={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Shoes' }).props.accessibilityState.selected).toBe(true);
    expect(screen.getByRole('button', { name: 'All' }).props.accessibilityState.selected).toBe(false);
  });
});
