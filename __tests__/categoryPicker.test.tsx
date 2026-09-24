import { PixelRatio } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { CategoryPicker } from '@/components/wardrobe/CategoryPicker';
import { ColorSwatchPicker } from '@/components/wardrobe/ColorSwatchPicker';
import { typeScale } from '@/lib/theme/fonts';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

describe('CategoryPicker', () => {
  it('renders the selected label in inverse ink (surface-base) so it reads on the ink fill', async () => {
    await render(<CategoryPicker value="shoes" onChange={jest.fn()} />);

    const selectedLabel = screen.getByText('Shoes').props.className;
    expect(selectedLabel).toContain('text-surface-base');
    expect(selectedLabel).toContain('dark:text-surface-baseDark');
  });

  it('renders square caption chips: ink fill when selected, hairline outline with ink-secondary text otherwise', async () => {
    await render(<CategoryPicker value="shoes" onChange={jest.fn()} />);

    const selected = screen.getByRole('button', { name: 'Shoes' });
    const unselected = screen.getByRole('button', { name: 'Top' });
    expect(selected.props.accessibilityState.selected).toBe(true);
    expect(unselected.props.accessibilityState.selected).toBe(false);

    // Caption role: tracked uppercase.
    const label = screen.getByText('Top');
    const labelStyle = Object.assign({}, ...[label.props.style].flat(Infinity).filter(Boolean));
    expect(labelStyle.textTransform).toBe('uppercase');
    expect(labelStyle.fontSize).toBe(typeScale.caption.fontSize * PixelRatio.getFontScale());
    expect(label.props.className).toContain('text-ink-secondary');
  });
});

describe('ColorSwatchPicker', () => {
  it('rings only the selected swatch, inside a 44pt touch target', async () => {
    await render(<ColorSwatchPicker value="#0C0A09" onChange={jest.fn()} />);

    expect(screen.getAllByTestId('color-swatch-ring')).toHaveLength(1);
    expect(screen.getByLabelText('Black').props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText('White').props.accessibilityState.selected).toBe(false);
    const targetStyle = Object.assign({}, ...[screen.getByLabelText('Black').props.style].flat(Infinity).filter(Boolean));
    expect(targetStyle.width).toBe(44);
    expect(targetStyle.height).toBe(44);
  });
});
