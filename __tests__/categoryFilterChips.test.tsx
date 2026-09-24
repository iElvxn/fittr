import { StyleSheet } from 'react-native';
import { render, screen, userEvent } from '@testing-library/react-native';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

import { CategoryFilterChips } from '@/components/wardrobe/CategoryFilterChips';
import { typeScale } from '@/lib/theme/fonts';

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
