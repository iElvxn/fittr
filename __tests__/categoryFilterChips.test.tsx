import { StyleSheet } from 'react-native';
import { render, screen, userEvent } from '@testing-library/react-native';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

import { CategoryFilterChips } from '@/components/wardrobe/CategoryFilterChips';
import { typeScale } from '@/lib/theme/fonts';

describe('CategoryFilterChips', () => {
  it('renders an "All" chip plus one plural-labelled chip per fixed category, in order', async () => {
    await render(<CategoryFilterChips selected="all" onSelect={jest.fn()} />);

    expect(screen.getAllByRole('button')).toHaveLength(6);
    for (const label of ['All', 'Tops', 'Bottoms', 'Shoes', 'Outerwear', 'Accessories']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.queryByText('Top')).toBeNull();
    expect(screen.queryByText('Accessory')).toBeNull();
  });

  it('keeps the singular category value when a plural chip is tapped', async () => {
    const onSelect = jest.fn();
    const user = userEvent.setup();
    await render(<CategoryFilterChips selected="all" onSelect={onSelect} />);

    await user.press(screen.getByText('Accessories'));

    expect(onSelect).toHaveBeenCalledWith('accessory');
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

  it('renders the selected label in inverse ink (surface-base) so it reads on the ink fill', async () => {
    await render(<CategoryFilterChips selected="shoes" onSelect={jest.fn()} />);

    const selectedLabel = screen.getByText('Shoes').props.className;
    expect(selectedLabel).toContain('text-surface-base');
    expect(selectedLabel).toContain('dark:text-surface-baseDark');
    expect(screen.getByText('All').props.className).toContain('text-ink-secondary');
  });

  it('labels chips with the caption type role', async () => {
    await render(<CategoryFilterChips selected="shoes" onSelect={jest.fn()} />);

    for (const label of ['All', 'Shoes']) {
      const style = StyleSheet.flatten(screen.getByText(label).props.style);
      expect(style.fontFamily).toBe(typeScale.caption.fontFamily);
      expect(style.textTransform).toBe('uppercase');
    }
  });
});
