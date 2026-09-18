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
    it('shows "Item added." when returning with itemAdded=1', async () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({ itemAdded: '1' });
      mockWardrobeItems({ data: [] });

      await render(<Wardrobe />);

      expect(screen.getByText('Item added.')).toBeTruthy();
    });

    it('shows no acknowledgement without the itemAdded param', async () => {
      mockWardrobeItems({ data: [] });

      await render(<Wardrobe />);

      expect(screen.queryByText('Item added.')).toBeNull();
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

  it('shows the empty state when there are no items', async () => {
    mockWardrobeItems({ data: [] });

    await render(<Wardrobe />);

    expect(await screen.findByText('Add your first item.')).toBeTruthy();
  });

  it('renders the grid with a total item count', async () => {
    mockWardrobeItems({
      data: [item({ id: 'a', category: 'top' }), item({ id: 'b', category: 'shoes' })],
    });

    await render(<Wardrobe />);

    expect(await screen.findByText('2 items')).toBeTruthy();
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
    await user.press(await screen.findByText('Shoes'));

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

  it('shows a message when the selected category has no matching items', async () => {
    mockWardrobeItems({ data: [item({ id: 'a', category: 'top' })] });
    const user = userEvent.setup();

    await render(<Wardrobe />);
    await user.press(await screen.findByText('Shoes'));

    expect(await screen.findByText('No items in this category.')).toBeTruthy();
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
  });

  it('uses the singular "item" for exactly one item', async () => {
    mockWardrobeItems({ data: [item({ id: 'a' })] });

    await render(<Wardrobe />);

    expect(await screen.findByText('1 item')).toBeTruthy();
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
