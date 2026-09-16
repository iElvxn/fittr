jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

import { filterByCategory, type WardrobeItemRow } from '@/lib/wardrobe/listItems';

function item(overrides: Partial<WardrobeItemRow>): WardrobeItemRow {
  return {
    id: 'item-1',
    category: 'top',
    name: null,
    brand: null,
    notes: null,
    color_hex: null,
    cutout_path: 'user-1/items/item-1/cutout.png',
    thumb_path: 'user-1/items/item-1/thumb.webp',
    created_at: '2026-09-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('filterByCategory', () => {
  const items = [
    item({ id: 'a', category: 'top' }),
    item({ id: 'b', category: 'shoes' }),
    item({ id: 'c', category: 'shoes' }),
  ];

  it("returns every item unfiltered when the selection is 'all'", () => {
    expect(filterByCategory(items, 'all')).toEqual(items);
  });

  it('narrows to only items matching the selected category', () => {
    expect(filterByCategory(items, 'shoes')).toEqual([items[1], items[2]]);
  });

  it('returns an empty array when no item matches the selected category', () => {
    expect(filterByCategory(items, 'outerwear')).toEqual([]);
  });
});
