import { render, screen, userEvent } from '@testing-library/react-native';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

import { CatalogSheet } from '@/components/fitBuilder/CatalogSheet';
import type { WardrobeItemRow } from '@/lib/wardrobe/listItems';

function item(overrides: Partial<WardrobeItemRow> = {}): WardrobeItemRow {
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

describe('CatalogSheet', () => {
  it('renders nothing when not visible', async () => {
    await render(
      <CatalogSheet
        visible={false}
        category="top"
        items={[item()]}
        thumbnailUrls={{}}
        onSelectItem={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    expect(screen.queryByText('Add Top')).toBeNull();
  });

  it("pre-selects the tapped slot's category as the active filter", async () => {
    const items = [
      item({ id: 'top-1', category: 'top', name: 'A top' }),
      item({ id: 'shoe-1', category: 'shoes', name: 'A shoe' }),
    ];
    await render(
      <CatalogSheet visible category="shoes" items={items} thumbnailUrls={{}} onSelectItem={jest.fn()} onClose={jest.fn()} />,
    );

    expect(screen.getByLabelText('A shoe, Shoes')).toBeTruthy();
    expect(screen.queryByLabelText('A top, Top')).toBeNull();
    expect(screen.getByRole('button', { name: 'Shoes' }).props.accessibilityState.selected).toBe(true);
  });

  it('can open unfiltered (the bottom "Add item" entry point) rather than pre-selecting a category', async () => {
    const items = [
      item({ id: 'top-1', category: 'top', name: 'A top' }),
      item({ id: 'shoe-1', category: 'shoes', name: 'A shoe' }),
    ];
    await render(
      <CatalogSheet visible category="all" items={items} thumbnailUrls={{}} onSelectItem={jest.fn()} onClose={jest.fn()} />,
    );

    expect(screen.getByText('Add to Fit')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'All' }).props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText('A top, Top')).toBeTruthy();
    expect(screen.getByLabelText('A shoe, Shoes')).toBeTruthy();
  });

  it('shows a category-specific title that tracks the active filter', async () => {
    const user = userEvent.setup();
    await render(
      <CatalogSheet visible category="top" items={[]} thumbnailUrls={{}} onSelectItem={jest.fn()} onClose={jest.fn()} />,
    );

    expect(screen.getByText('Add Top')).toBeTruthy();

    await user.press(screen.getByText('All'));

    expect(screen.getByText('Add to Fit')).toBeTruthy();
  });

  it('switches visible items when a different filter chip is tapped', async () => {
    const items = [
      item({ id: 'top-1', category: 'top', name: 'A top' }),
      item({ id: 'shoe-1', category: 'shoes', name: 'A shoe' }),
    ];
    const user = userEvent.setup();
    await render(
      <CatalogSheet visible category="top" items={items} thumbnailUrls={{}} onSelectItem={jest.fn()} onClose={jest.fn()} />,
    );

    expect(screen.queryByLabelText('A shoe, Shoes')).toBeNull();

    await user.press(screen.getByText('Shoes'));

    expect(screen.getByLabelText('A shoe, Shoes')).toBeTruthy();
    expect(screen.queryByLabelText('A top, Top')).toBeNull();
  });

  it('calls onSelectItem with the tapped item', async () => {
    const items = [item({ id: 'top-1', category: 'top', name: 'A top' })];
    const onSelectItem = jest.fn();
    const user = userEvent.setup();
    await render(
      <CatalogSheet visible category="top" items={items} thumbnailUrls={{}} onSelectItem={onSelectItem} onClose={jest.fn()} />,
    );

    await user.press(screen.getByLabelText('A top, Top'));

    expect(onSelectItem).toHaveBeenCalledWith(items[0]);
  });

  it('shows the empty-category message when the active filter matches nothing', async () => {
    await render(
      <CatalogSheet visible category="shoes" items={[]} thumbnailUrls={{}} onSelectItem={jest.fn()} onClose={jest.fn()} />,
    );

    expect(screen.getByText('No items in this category.')).toBeTruthy();
  });

  it('calls onClose when the close button is tapped', async () => {
    const onClose = jest.fn();
    const user = userEvent.setup();
    await render(
      <CatalogSheet visible category="top" items={[]} thumbnailUrls={{}} onSelectItem={jest.fn()} onClose={onClose} />,
    );

    await user.press(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the backdrop is tapped', async () => {
    const onClose = jest.fn();
    const user = userEvent.setup();
    await render(
      <CatalogSheet visible category="top" items={[]} thumbnailUrls={{}} onSelectItem={jest.fn()} onClose={onClose} />,
    );

    await user.press(screen.getByLabelText('Dismiss'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
