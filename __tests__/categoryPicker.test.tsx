import { render, screen } from '@testing-library/react-native';

import { CategoryPicker } from '@/components/wardrobe/CategoryPicker';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

describe('CategoryPicker', () => {
  it('renders the selected label in inverse ink (surface-base) so it reads on the ink fill', async () => {
    await render(<CategoryPicker value="shoes" onChange={jest.fn()} />);

    const selectedLabel = screen.getByText('Shoes').props.className;
    expect(selectedLabel).toContain('text-surface-base');
    expect(selectedLabel).toContain('dark:text-surface-baseDark');
  });
});
