import { StyleSheet } from 'react-native';
import { render, screen, userEvent, fireEvent } from '@testing-library/react-native';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(), storage: { from: jest.fn() } } }));
jest.mock('@/lib/auth/useSession', () => ({ useSession: jest.fn() }));
jest.mock('@/lib/wardrobe/listItems', () => ({
  ...jest.requireActual('@/lib/wardrobe/listItems'),
  useWardrobeItems: jest.fn(),
}));
jest.mock('@/lib/wardrobe/thumbnailUrls', () => ({ useThumbnailUrls: jest.fn() }));
const mockNavigation = { setParams: jest.fn() };

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), setParams: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
  // A no-op mock (rather than one that runs the effect immediately) keeps
  // this focus-triggered refetch decoupled from the button/pull-to-refresh
  // tests below; its own behavior gets one dedicated test that invokes the
  // captured callback directly.
  useFocusEffect: jest.fn(),
  useNavigation: jest.fn(() => mockNavigation),
}));
jest.mock('@/lib/observability/sentry', () => ({ Sentry: { captureException: jest.fn() } }));

import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import Wardrobe from '@/app/(tabs)/wardrobe';
import { useSession } from '@/lib/auth/useSession';
import { useWardrobeItems, type WardrobeItemRow } from '@/lib/wardrobe/listItems';
import { useThumbnailUrls } from '@/lib/wardrobe/thumbnailUrls';
import { Sentry } from '@/lib/observability/sentry';
import { typeScale } from '@/lib/theme/fonts';

function item(overrides: Partial<WardrobeItemRow> = {}): WardrobeItemRow {
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

function mockWardrobeItems(overrides: Record<string, unknown> = {}) {
  (useWardrobeItems as jest.Mock).mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
    isRefetching: false,
    ...overrides,
  });
}

describe('Wardrobe', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useSession as jest.Mock).mockReturnValue({ session: { user: { id: 'user-1' } }, loading: false });
    (useThumbnailUrls as jest.Mock).mockReturnValue({ data: {} });
    (useLocalSearchParams as jest.Mock).mockReturnValue({});
  });

  describe('save acknowledgement', () => {
    it('shows the "Added to your closet" banner when returning with itemAdded=1', async () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({ itemAdded: '1' });
      mockWardrobeItems({ data: [item({ id: 'a' })] });

      await render(<Wardrobe />);

      expect(screen.getByText('Added to your closet')).toBeTruthy();
      expect(screen.queryByText('Item added.')).toBeNull();
    });

    it('renders the banner as an ink fill with inverse text, floating above the tab bar', async () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({ itemAdded: '1' });
      mockWardrobeItems({ data: [item({ id: 'a' })] });

      await render(<Wardrobe />);

      const banner = screen.getByTestId('wardrobe-ack-banner');
      expect(banner.props.accessibilityRole).toBe('alert');
      expect(banner.props.className).toContain('bg-ink-primary');
      expect(banner.props.className).toContain('absolute');
      expect(StyleSheet.flatten(banner.props.style).bottom).toBeGreaterThan(0);
      expect(screen.getByText('Added to your closet').props.className).toContain('text-surface-base');
    });

    it('shows no acknowledgement without the itemAdded param', async () => {
      mockWardrobeItems({ data: [] });

      await render(<Wardrobe />);

      expect(screen.queryByText('Added to your closet')).toBeNull();
    });

    it('clears the search and resets the chip when the ack arrives, so the new piece is visible', async () => {
      mockWardrobeItems({ data: [item({ id: 'a', category: 'top', name: 'Blue tee' })] });
      const user = userEvent.setup();

      const view = await render(<Wardrobe />);
      await user.press(await screen.findByRole('button', { name: 'Accessories' }));
      await user.type(screen.getByPlaceholderText('Search by name or brand'), 'silk');
      expect(screen.queryByLabelText('Blue tee, Top')).toBeNull();

      (useLocalSearchParams as jest.Mock).mockReturnValue({ itemAdded: '1' });
      await view.rerender(<Wardrobe />);

      expect(screen.getByText('Added to your closet')).toBeTruthy();
      expect(screen.getByPlaceholderText('Search by name or brand').props.value).toBe('');
      expect(screen.getByRole('button', { name: 'All' }).props.accessibilityState.selected).toBe(true);
      expect(screen.getByLabelText('Blue tee, Top')).toBeTruthy();
    });

    it("clears the ack via this screen's own navigation, not the global router", async () => {
      jest.useFakeTimers();
      (useLocalSearchParams as jest.Mock).mockReturnValue({ itemAdded: '1' });
      mockWardrobeItems({ data: [] });

      await render(<Wardrobe />);
      jest.advanceTimersByTime(2500);

      // Regression test: a global `router.setParams` call here would clear
      // whatever screen currently has focus rather than this one -- e.g. if
      // the user tapped into an item's detail screen before the ack timed
      // out, leaving "Item added." stuck on this tab forever. Scoping the
      // clear to this route's own `navigation.setParams` avoids that.
      expect(mockNavigation.setParams).toHaveBeenCalledWith({ itemAdded: undefined });
      expect(router.setParams).not.toHaveBeenCalled();
      jest.useRealTimers();
    });
  });

  describe('empty closet', () => {
    it('shows the editorial empty state with no search or chips', async () => {
      mockWardrobeItems({ data: [] });

      await render(<Wardrobe />);

      expect(await screen.findByText('An empty closet.')).toBeTruthy();
      expect(
        screen.getByText('Photograph a piece and Fittr cuts it out for you. Start with what you wear most.'),
      ).toBeTruthy();
      expect(screen.queryByPlaceholderText('Search by name or brand')).toBeNull();
      expect(screen.queryByText('All')).toBeNull();
      expect(screen.getByText('No pieces yet')).toBeTruthy();
    });

    it('goes to add-item from "Add your first piece"', async () => {
      mockWardrobeItems({ data: [] });
      const user = userEvent.setup();

      await render(<Wardrobe />);
      await user.press(await screen.findByText('Add your first piece'));

      expect(router.push).toHaveBeenCalledWith('/add-item');
    });
  });

  it('shows the "My Closet" display title with the add button', async () => {
    mockWardrobeItems({ data: [item({ id: 'a' })] });
    const user = userEvent.setup();

    await render(<Wardrobe />);

    const title = await screen.findByText('My Closet');
    expect(StyleSheet.flatten(title.props.style).fontFamily).toBe(typeScale.display.fontFamily);
    await user.press(screen.getByRole('button', { name: 'Add item' }));
    expect(router.push).toHaveBeenCalledWith('/add-item');
  });

  it('renders the grid with a caption piece count', async () => {
    mockWardrobeItems({
      data: [item({ id: 'a', category: 'top' }), item({ id: 'b', category: 'shoes' })],
    });

    await render(<Wardrobe />);

    const count = await screen.findByText('2 pieces');
    expect(StyleSheet.flatten(count.props.style).textTransform).toBe('uppercase');
    expect(screen.getByTestId('wardrobe-grid')).toBeTruthy();
  });

  it('shows the name and brand under each tile', async () => {
    mockWardrobeItems({ data: [item({ id: 'a', category: 'outerwear', name: 'Camel coat', brand: 'Toteme' })] });

    await render(<Wardrobe />);

    expect(await screen.findByText('Camel coat')).toBeTruthy();
    expect(screen.getByText('Toteme')).toBeTruthy();
    expect(screen.getByLabelText('Camel coat, Toteme, Outerwear')).toBeTruthy();
  });

  describe('search', () => {
    const closet = [
      item({ id: 'coat', category: 'outerwear', name: 'Camel coat', brand: 'Toteme' }),
      item({ id: 'loafers', category: 'shoes', name: 'Leather loafers', brand: 'G.H. Bass' }),
      item({ id: 'boots', category: 'shoes', name: 'Chelsea boots', brand: 'Blundstone' }),
      item({ id: 'tee', category: 'top', name: 'Boxy tee', brand: 'COS' }),
    ];

    it('narrows the grid by name or brand, case-insensitively', async () => {
      mockWardrobeItems({ data: closet });
      const user = userEvent.setup();

      await render(<Wardrobe />);
      await user.type(await screen.findByPlaceholderText('Search by name or brand'), 'COAT');

      expect(screen.getByLabelText('Camel coat, Toteme, Outerwear')).toBeTruthy();
      expect(screen.queryByLabelText('Boxy tee, COS, Top')).toBeNull();
    });

    it('combines with the category chip', async () => {
      mockWardrobeItems({ data: closet });
      const user = userEvent.setup();

      await render(<Wardrobe />);
      await user.press(await screen.findByRole('button', { name: 'Shoes' }));
      await user.type(screen.getByPlaceholderText('Search by name or brand'), 'bass');

      expect(screen.getByLabelText('Leather loafers, G.H. Bass, Shoes')).toBeTruthy();
      expect(screen.queryByLabelText('Chelsea boots, Blundstone, Shoes')).toBeNull();
      expect(screen.queryByLabelText('Camel coat, Toteme, Outerwear')).toBeNull();
    });

    it('clears the query from the clear button', async () => {
      mockWardrobeItems({ data: closet });
      const user = userEvent.setup();

      await render(<Wardrobe />);
      await user.type(await screen.findByPlaceholderText('Search by name or brand'), 'coat');
      await user.press(screen.getByRole('button', { name: 'Clear search' }));

      expect(screen.getByLabelText('Boxy tee, COS, Top')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
    });

    it('shows "Nothing matches" and "Show everything" clears both search and chip', async () => {
      mockWardrobeItems({ data: closet });
      const user = userEvent.setup();

      await render(<Wardrobe />);
      await user.press(await screen.findByRole('button', { name: 'Shoes' }));
      await user.type(screen.getByPlaceholderText('Search by name or brand'), 'silk');

      expect(screen.getByText('Nothing matches "silk".')).toBeTruthy();
      expect(screen.queryByTestId('wardrobe-grid')).toBeNull();

      await user.press(screen.getByText('Show everything'));

      expect(screen.getByPlaceholderText('Search by name or brand').props.value).toBe('');
      expect(screen.getByRole('button', { name: 'All' }).props.accessibilityState.selected).toBe(true);
      expect(screen.getByLabelText('Camel coat, Toteme, Outerwear')).toBeTruthy();
      expect(screen.getByLabelText('Boxy tee, COS, Top')).toBeTruthy();
    });
  });

  it('narrows the grid to the selected category', async () => {
    mockWardrobeItems({
      data: [
        item({ id: 'a', category: 'top', name: 'Blue tee' }),
        item({ id: 'b', category: 'shoes', name: 'Sneakers' }),
      ],
    });
    const user = userEvent.setup();

    await render(<Wardrobe />);
    await user.press(await screen.findByRole('button', { name: 'Shoes' }));

    expect(screen.getByLabelText('Sneakers, Shoes')).toBeTruthy();
    expect(screen.queryByLabelText('Blue tee, Top')).toBeNull();
  });

  it('navigates to the item detail screen when a grid cell is tapped', async () => {
    mockWardrobeItems({
      data: [item({ id: 'a', category: 'top' }), item({ id: 'b', category: 'shoes', name: 'Sneakers' })],
    });
    const user = userEvent.setup();

    await render(<Wardrobe />);
    await user.press(await screen.findByLabelText('Sneakers, Shoes'));

    expect(router.push).toHaveBeenCalledWith('/item/b');
  });

  it('shows "No {chip} yet." with "Show everything" when the selected category is empty', async () => {
    mockWardrobeItems({ data: [item({ id: 'a', category: 'top', name: 'Blue tee' })] });
    const user = userEvent.setup();

    await render(<Wardrobe />);
    await user.press(await screen.findByText('Accessories'));

    expect(await screen.findByText('No accessories yet.')).toBeTruthy();

    await user.press(screen.getByText('Show everything'));

    expect(screen.getByLabelText('Blue tee, Top')).toBeTruthy();
  });

  it('shows the masonry skeleton while loading', async () => {
    mockWardrobeItems({ data: undefined, isLoading: true });

    await render(<Wardrobe />);

    expect(screen.getByTestId('wardrobe-grid-skeleton', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId('wardrobe-grid')).toBeNull();
    expect(screen.queryByText('No pieces yet')).toBeNull();
  });

  it('shows the connection error notice and retries on tap', async () => {
    const refetch = jest.fn();
    mockWardrobeItems({
      data: undefined,
      isError: true,
      error: new TypeError('Network request failed'),
      refetch,
    });
    const user = userEvent.setup();

    await render(<Wardrobe />);

    expect(await screen.findByText('No connection — nothing was lost. Try again.')).toBeTruthy();

    await user.press(screen.getByText('Retry'));
    expect(refetch).toHaveBeenCalled();
  });

  it('refetches when the user pulls to refresh', async () => {
    const refetch = jest.fn();
    mockWardrobeItems({ data: [item({ id: 'a' })], refetch });

    await render(<Wardrobe />);

    fireEvent(await screen.findByTestId('wardrobe-grid'), 'refresh');

    expect(refetch).toHaveBeenCalled();
  });

  it('refetches when the screen regains focus', async () => {
    const refetch = jest.fn();
    mockWardrobeItems({ data: [item({ id: 'a' })], refetch });

    await render(<Wardrobe />);

    const onFocus = (useFocusEffect as jest.Mock).mock.calls[0][0];
    onFocus();

    expect(refetch).toHaveBeenCalled();
  });

  it('shows the generic error message (not the connection banner) for a non-network error', async () => {
    mockWardrobeItems({
      data: undefined,
      isError: true,
      error: new Error('permission denied'),
    });

    await render(<Wardrobe />);

    expect(await screen.findByText('Something went wrong. Please try again.')).toBeTruthy();
    expect(screen.queryByText('No connection — nothing was lost. Try again.')).toBeNull();
    expect(screen.queryByText('No pieces yet')).toBeNull();
  });

  it('uses the singular "piece" for exactly one item', async () => {
    mockWardrobeItems({ data: [item({ id: 'a' })] });

    await render(<Wardrobe />);

    expect(await screen.findByText('1 piece')).toBeTruthy();
  });

  it('shows a placeholder cell when a thumbnail has no resolved URL', async () => {
    mockWardrobeItems({ data: [item({ id: 'a', thumb_path: 'user-1/items/a/thumb.webp' })] });
    (useThumbnailUrls as jest.Mock).mockReturnValue({
      data: { 'user-1/items/a/thumb.webp': null },
      isError: false,
      error: null,
    });

    await render(<Wardrobe />);

    expect(await screen.findByTestId('wardrobe-thumbnail-fallback')).toBeTruthy();
    expect(screen.queryByTestId('wardrobe-thumbnail-image')).toBeNull();
  });

  it('reports to Sentry when the bulk thumbnail-URL request fails', async () => {
    mockWardrobeItems({ data: [item({ id: 'a' })] });
    const thumbnailError = new Error('signed url request failed');
    (useThumbnailUrls as jest.Mock).mockReturnValue({ data: undefined, isError: true, error: thumbnailError });

    await render(<Wardrobe />);

    expect(Sentry.captureException).toHaveBeenCalledWith(thumbnailError);
  });
});
