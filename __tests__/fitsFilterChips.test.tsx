import { render, screen, userEvent } from '@testing-library/react-native';

import { FitsFilterChips } from '@/components/fits/FitsFilterChips';

describe('FitsFilterChips', () => {
  it('renders All, Favorites, and Worn chips', async () => {
    await render(<FitsFilterChips selected="all" onSelect={jest.fn()} />);

    expect(screen.getByText('All')).toBeTruthy();
    expect(screen.getByText('Favorites')).toBeTruthy();
    expect(screen.getByText('Worn')).toBeTruthy();
  });

  it('calls onSelect with the tapped filter', async () => {
    const onSelect = jest.fn();
    const user = userEvent.setup();
    await render(<FitsFilterChips selected="all" onSelect={onSelect} />);

    await user.press(screen.getByText('Favorites'));

    expect(onSelect).toHaveBeenCalledWith('favorites');
  });

  it('marks only the selected chip as accessibility-selected', async () => {
    await render(<FitsFilterChips selected="worn" onSelect={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Worn' }).props.accessibilityState.selected).toBe(true);
    expect(screen.getByRole('button', { name: 'All' }).props.accessibilityState.selected).toBe(false);
    expect(screen.getByRole('button', { name: 'Favorites' }).props.accessibilityState.selected).toBe(false);
  });
});
