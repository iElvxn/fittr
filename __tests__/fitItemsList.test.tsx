import { render, screen } from '@testing-library/react-native';

// `CATEGORY_LABELS` (from `@/lib/wardrobe/addItem`) transitively imports
// `@/lib/supabase`, which loads the real `@react-native-async-storage`
// native module outside app context -- same reasoning as
// `categoryFilterChips.test.tsx`'s identical mock.
jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('@/lib/wardrobe/thumbnailUrls', () => ({ useThumbnailUrls: jest.fn() }));

import { FitItemsList } from '@/components/fits/FitItemsList';
import { useThumbnailUrls } from '@/lib/wardrobe/thumbnailUrls';
import type { FitItemPlacementWithSource } from '@/lib/fits/getFitItems';

function placement(overrides: Partial<FitItemPlacementWithSource> = {}): FitItemPlacementWithSource {
  return {
    id: 'placement-1',
    wardrobeItemId: 'wardrobe-item-1',
    x: 0.5,
    y: 0.5,
    scale: 1,
    rotation: 0,
    zIndex: 1,
    category: 'top',
    wardrobeItemDeleted: false,
    name: 'White Tee',
    thumbPath: 'user-1/items/a/thumb.webp',
    ...overrides,
  };
}

describe('FitItemsList', () => {
  beforeEach(() => {
    (useThumbnailUrls as jest.Mock).mockReturnValue({ data: {} });
  });

  it('renders one row per placement, by name when present', async () => {
    await render(
      <FitItemsList
        items={[
          placement({ id: 'p1', name: 'White Tee', category: 'top' }),
          placement({ id: 'p2', name: null, category: 'shoes' }),
        ]}
      />,
    );

    expect(screen.getByText('White Tee')).toBeTruthy();
    // Falls back to the category label when the source item has no name.
    expect(screen.getByText('Shoes')).toBeTruthy();
  });

  it('marks a deleted-source item as Removed, distinct from a live one', async () => {
    await render(
      <FitItemsList
        items={[
          placement({ id: 'p1', name: 'White Tee', wardrobeItemDeleted: false }),
          placement({ id: 'p2', name: 'Old Jacket', wardrobeItemDeleted: true }),
        ]}
      />,
    );

    expect(screen.getByText('Old Jacket')).toBeTruthy();
    expect(screen.getByText('Removed')).toBeTruthy();
    expect(screen.queryAllByText('Removed')).toHaveLength(1);
  });

  it('renders the thumbnail resolved for the placement\'s own thumbPath', async () => {
    (useThumbnailUrls as jest.Mock).mockReturnValue({
      data: { 'user-1/items/a/thumb.webp': 'https://signed.example/a.webp' },
    });

    await render(<FitItemsList items={[placement({ id: 'p1', thumbPath: 'user-1/items/a/thumb.webp' })]} />);

    // `expo-image` normalizes `source` into an array, same as `profileEdit.test.tsx`'s `avatar-preview` assertion.
    expect(screen.getByTestId('fit-items-list-thumbnail').props.source).toEqual(
      expect.arrayContaining([{ uri: 'https://signed.example/a.webp' }]),
    );
  });

  it('renders nothing for an empty item list', async () => {
    const { toJSON } = await render(<FitItemsList items={[]} />);

    expect(toJSON()).toBeNull();
  });
});
