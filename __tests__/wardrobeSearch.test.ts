jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

import { filterByCategory, searchItems, type WardrobeItemRow } from '@/lib/wardrobe/listItems';

function item(overrides: Partial<WardrobeItemRow> = {}): WardrobeItemRow {
  return {
    id: 'item-1',
    category: 'top',
    name: null,
    brand: null,
    notes: null,
    color_hex: null,
    cutout_path: 'cutout.png',
    thumb_path: 'thumb.webp',
    created_at: '2026-09-15T00:00:00.000Z',
    ...overrides,
  };
}

const coat = item({ id: 'coat', category: 'outerwear', name: 'Camel wool Coat', brand: 'Toteme' });
const denim = item({ id: 'denim', category: 'bottom', name: 'Wide-leg denim', brand: "Levi's" });
const loafers = item({ id: 'loafers', category: 'shoes', name: 'Leather loafers', brand: 'G.H. Bass' });
const sneakers = item({ id: 'sneakers', category: 'shoes', name: 'White sneakers', brand: 'Veja' });
const unnamed = item({ id: 'unnamed', category: 'bottom', name: null, brand: null, color_hex: '#C0A0A0' });
const brandOnly = item({ id: 'brand-only', category: 'top', name: null, brand: 'Coatsworth' });
const all = [coat, denim, loafers, sneakers, unnamed, brandOnly];

describe('searchItems', () => {
  it('matches on name, case-insensitively', () => {
    expect(searchItems(all, 'coat').map((i) => i.id)).toEqual(['coat', 'brand-only']);
    expect(searchItems(all, 'COAT').map((i) => i.id)).toEqual(['coat', 'brand-only']);
  });

  it('matches on brand', () => {
    expect(searchItems(all, 'veja').map((i) => i.id)).toEqual(['sneakers']);
  });

  it('treats an empty or whitespace-only query as no search', () => {
    expect(searchItems(all, '')).toEqual(all);
    expect(searchItems(all, '   ')).toEqual(all);
  });

  it('trims the query before matching', () => {
    expect(searchItems(all, '  veja  ').map((i) => i.id)).toEqual(['sneakers']);
  });

  it('skips items with neither name nor brand without throwing', () => {
    expect(searchItems([unnamed], 'bottom')).toEqual([]);
  });

  it('does not match on category or color', () => {
    expect(searchItems(all, 'outerwear')).toEqual([]);
    expect(searchItems(all, '#c0a0a0')).toEqual([]);
  });

  it('returns an empty list when nothing matches', () => {
    expect(searchItems(all, 'silk')).toEqual([]);
  });

  it('combines with the category filter', () => {
    const result = searchItems(filterByCategory(all, 'shoes'), 'a');
    expect(result.map((i) => i.id)).toEqual(['loafers', 'sneakers']);
  });
});
