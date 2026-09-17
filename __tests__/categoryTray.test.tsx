import { render, screen, userEvent } from '@testing-library/react-native';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

import { CategoryTray } from '@/components/fitBuilder/CategoryTray';
import type { WardrobeItemRow } from '@/lib/wardrobe/listItems';

function item(overrides: Partial<WardrobeItemRow>): WardrobeItemRow {
  return {
    id: 'item-1',
    category: 'top',
    name: 'Item',
    brand: null,
    notes: null,
    color_hex: null,
    cutout_path: 'user-1/items/item-1/cutout.png',
    thumb_path: 'user-1/items/item-1/thumb.webp',
    created_at: '2026-09-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('CategoryTray', () => {
  it('defaults to the first category and shows its items', async () => {
    const items = [item({ id: 'top-1', category: 'top' }), item({ id: 'shoes-1', category: 'shoes' })];
    await render(<CategoryTray items={items} thumbnailUrls={{}} onAddItem={jest.fn()} />);

    expect(screen.getByLabelText('Item')).toBeTruthy();
  });

  it("shows that category's empty state when it has zero items", async () => {
    await render(<CategoryTray items={[]} thumbnailUrls={{}} onAddItem={jest.fn()} />);

    expect(screen.getByText('No items in this category.')).toBeTruthy();
  });

  it('switches the visible items when a different category chip is tapped', async () => {
    const items = [item({ id: 'top-1', category: 'top', name: 'A top' }), item({ id: 'shoes-1', category: 'shoes', name: 'A shoe' })];
    const user = userEvent.setup();
    await render(<CategoryTray items={items} thumbnailUrls={{}} onAddItem={jest.fn()} />);

    expect(screen.queryByLabelText('A shoe')).toBeNull();

    await user.press(screen.getByText('Shoes'));

    expect(screen.getByLabelText('A shoe')).toBeTruthy();
    expect(screen.queryByLabelText('A top')).toBeNull();
  });

  it('gives unnamed items in the same category distinguishable accessibility labels', async () => {
    const items = [
      item({ id: 'top-1', category: 'top', name: null }),
      item({ id: 'top-2', category: 'top', name: null }),
    ];
    await render(<CategoryTray items={items} thumbnailUrls={{}} onAddItem={jest.fn()} />);

    expect(screen.getByLabelText('Top 1')).toBeTruthy();
    expect(screen.getByLabelText('Top 2')).toBeTruthy();
  });

  it('calls onAddItem with the tapped item', async () => {
    const items = [item({ id: 'top-1', category: 'top', name: 'A top' })];
    const onAddItem = jest.fn();
    const user = userEvent.setup();
    await render(<CategoryTray items={items} thumbnailUrls={{}} onAddItem={onAddItem} />);

    await user.press(screen.getByLabelText('A top'));

    expect(onAddItem).toHaveBeenCalledWith(items[0]);
  });
});
