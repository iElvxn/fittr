import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), dismissTo: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => `uuid-${Math.random()}`) }));
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }));
jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(), storage: { from: jest.fn() } } }));
jest.mock('@/lib/auth/useSession', () => ({
  useSession: jest.fn(() => ({ session: { user: { id: 'user-1' } } })),
}));
jest.mock('@/lib/wardrobe/listItems', () => ({
  useWardrobeItems: jest.fn(() => ({ data: [], isLoading: false })),
}));
jest.mock('@/lib/wardrobe/thumbnailUrls', () => ({
  useThumbnailUrls: jest.fn(() => ({ data: {} })),
}));
jest.mock('@/lib/fits/nextFitName', () => ({ getNextFitName: jest.fn() }));
jest.mock('@/lib/fits/saveFit', () => ({ uploadCover: jest.fn(), insertFit: jest.fn() }));
jest.mock('@/lib/fits/getFitItems', () => ({ getFitItems: jest.fn() }));
jest.mock('@/lib/fits/listFits', () => ({ useFits: jest.fn(() => ({ data: [] })) }));
jest.mock('@/lib/observability/sentry', () => ({ Sentry: { captureException: jest.fn() } }));
// `CanvasItem` pulls in Reanimated for its drag/pinch/rotate gesture, which has
// no working jest mock under Reanimated v4's worklets split -- same stand-in
// `fitCanvas.test.tsx` uses, needed here since a placed item renders one.
jest.mock('@/components/fitBuilder/CanvasItem', () => ({ CanvasItem: () => null }));
jest.mock('react-native-reanimated', () => ({ runOnJS: (fn: (...args: unknown[]) => unknown) => fn }));

import NewFit from '@/app/new-fit';
import { router, useLocalSearchParams } from 'expo-router';
import { captureRef } from 'react-native-view-shot';
import { getNextFitName } from '@/lib/fits/nextFitName';
import { uploadCover, insertFit } from '@/lib/fits/saveFit';
import { getFitItems } from '@/lib/fits/getFitItems';
import { useFits } from '@/lib/fits/listFits';
import { useWardrobeItems } from '@/lib/wardrobe/listItems';
import { FitError, NO_CONNECTION_MESSAGE, UNKNOWN_ERROR_MESSAGE } from '@/lib/fits/errors';
import { useFitBuilderStore } from '@/stores/fitBuilder';

let queryClient: QueryClient;

function renderNewFit() {
  return render(
    <QueryClientProvider client={queryClient}>
      <NewFit />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  useFitBuilderStore.setState({ templateId: null, items: [], selectedId: null, canvasBackgroundColor: null });
  (captureRef as jest.Mock).mockResolvedValue('file://collage.png');
  (getNextFitName as jest.Mock).mockResolvedValue('Fit 12');
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  (useFits as jest.Mock).mockReturnValue({ data: [] });
  (useWardrobeItems as jest.Mock).mockReturnValue({ data: [], isLoading: false });
});

describe('New Fit -- Save flow', () => {
  it('disables Save when the canvas has no items', async () => {
    const user = userEvent.setup();
    await renderNewFit();
    await user.press(screen.getByText('Skip for now'));

    expect(screen.getByRole('button', { name: 'Save Fit' }).props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });

  it('shows an error notice and stays on the canvas when the collage capture fails', async () => {
    (captureRef as jest.Mock).mockRejectedValue(new Error('capture boom'));

    await renderNewFit();
    const user = userEvent.setup();
    await user.press(screen.getByText('Skip for now'));
    await act(async () => {
      useFitBuilderStore.getState().addItem('wardrobe-item-1', 'top');
    });

    await user.press(screen.getByRole('button', { name: 'Save Fit' }));

    await waitFor(() => expect(screen.getByText(UNKNOWN_ERROR_MESSAGE)).toBeTruthy());
    expect(screen.queryByDisplayValue('Fit 12')).toBeNull();
  });

  it('captures the canvas and opens the Save sheet with the generated default name', async () => {
    await renderNewFit();
    const user = userEvent.setup();
    await user.press(screen.getByText('Skip for now'));
    await act(async () => {
      useFitBuilderStore.getState().addItem('wardrobe-item-1', 'top');
    });

    await user.press(screen.getByRole('button', { name: 'Save Fit' }));

    await waitFor(() => expect(captureRef).toHaveBeenCalled());
    await waitFor(() => expect(getNextFitName).toHaveBeenCalledWith('user-1'));
    await waitFor(() => expect(screen.getByDisplayValue('Fit 12')).toBeTruthy());
  });

  it('resets the canvas and dismisses to the Fits tab on a successful save', async () => {
    (uploadCover as jest.Mock).mockResolvedValue('user-1/fits/fit-1/cover.png');
    (insertFit as jest.Mock).mockResolvedValue(undefined);

    await renderNewFit();
    const user = userEvent.setup();
    await user.press(screen.getByText('Skip for now'));
    await act(async () => {
      useFitBuilderStore.getState().addItem('wardrobe-item-1', 'top');
    });

    await user.press(screen.getByRole('button', { name: 'Save Fit' }));
    await screen.findByDisplayValue('Fit 12');
    await user.press(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(router.dismissTo).toHaveBeenCalledWith({ pathname: '/(tabs)/fits', params: { fitSaved: '1' } }),
    );
    expect(useFitBuilderStore.getState().items).toEqual([]);
  });

  it('shows the block-and-keep message and keeps the sheet open when the save fails with no connection', async () => {
    (uploadCover as jest.Mock).mockRejectedValue(new FitError('no_connection', NO_CONNECTION_MESSAGE));

    await renderNewFit();
    const user = userEvent.setup();
    await user.press(screen.getByText('Skip for now'));
    await act(async () => {
      useFitBuilderStore.getState().addItem('wardrobe-item-1', 'top');
    });

    await user.press(screen.getByRole('button', { name: 'Save Fit' }));
    await screen.findByDisplayValue('Fit 12');
    await user.press(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText(NO_CONNECTION_MESSAGE)).toBeTruthy());
    expect(screen.getByDisplayValue('Fit 12')).toBeTruthy();
    expect(router.dismissTo).not.toHaveBeenCalled();
  });
});

describe('New Fit -- edit mode (Story 3.3)', () => {
  const EDITING_FIT = {
    id: 'fit-1',
    name: 'Weekend Look',
    cover_path: 'user-1/fits/fit-1/cover.png',
    canvas_background_color: '#F6DADA',
    updated_at: '2026-09-18T00:00:00.000Z',
  };
  const SAVED_PLACEMENT = {
    id: 'placement-1',
    wardrobeItemId: 'wardrobe-item-1',
    x: 0.42,
    y: 0.18,
    scale: 1.3,
    rotation: 12,
    zIndex: 2,
  };

  beforeEach(() => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ fitId: 'fit-1' });
    (useFits as jest.Mock).mockReturnValue({ data: [EDITING_FIT] });
    (useWardrobeItems as jest.Mock).mockReturnValue({
      data: [{ id: 'wardrobe-item-1', category: 'top', thumb_path: 't.webp', cutout_path: 'c.png' }],
      isLoading: false,
    });
  });

  it('shows a loading indicator while the saved placements are being fetched', async () => {
    (getFitItems as jest.Mock).mockReturnValue(new Promise(() => {}));

    await renderNewFit();

    expect(screen.getByTestId('new-fit-edit-loading')).toBeTruthy();
  });

  it("seeds the canvas with every item at its saved position, scale, rotation, and stacking order", async () => {
    (getFitItems as jest.Mock).mockResolvedValue([SAVED_PLACEMENT]);

    await renderNewFit();

    await waitFor(() => {
      expect(useFitBuilderStore.getState().items).toEqual([
        {
          id: 'placement-1',
          wardrobeItemId: 'wardrobe-item-1',
          category: 'top',
          templateSlotIndex: null,
          x: 0.42,
          y: 0.18,
          scale: 1.3,
          rotation: 12,
          zIndex: 2,
        },
      ]);
    });
    expect(getFitItems).toHaveBeenCalledWith('fit-1');
  });

  it("restores the Fit's own saved canvas background color", async () => {
    (getFitItems as jest.Mock).mockResolvedValue([SAVED_PLACEMENT]);

    await renderNewFit();

    await waitFor(() => expect(useFitBuilderStore.getState().canvasBackgroundColor).toBe('#F6DADA'));
  });

  it("shows a not-found message and never seeds or fetches when fitId doesn't resolve to a visible Fit (deleted, or another user's)", async () => {
    (useFits as jest.Mock).mockReturnValue({ data: [], isLoading: false });

    await renderNewFit();

    expect(await screen.findByText('This Fit is no longer available.')).toBeTruthy();
    expect(getFitItems).not.toHaveBeenCalled();
  });

  it('shows a connection error with retry when seeding fails offline, and seeds on retry', async () => {
    (getFitItems as jest.Mock)
      .mockRejectedValueOnce(new FitError('no_connection', NO_CONNECTION_MESSAGE))
      .mockResolvedValueOnce([SAVED_PLACEMENT]);

    await renderNewFit();

    expect(await screen.findByText(NO_CONNECTION_MESSAGE)).toBeTruthy();

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(useFitBuilderStore.getState().items).toHaveLength(1));
  });

  it('re-saving reuses the same fitId and the Fit\'s current name, and dismisses to its detail screen', async () => {
    (getFitItems as jest.Mock).mockResolvedValue([SAVED_PLACEMENT]);
    (uploadCover as jest.Mock).mockResolvedValue('user-1/fits/fit-1/cover.png');
    (insertFit as jest.Mock).mockResolvedValue(undefined);
    // Pins the contract `app/fit/[id].tsx` relies on: it has no focus-refetch
    // of its own, so a stale `useFits` cache after this dismiss would show
    // the pre-edit name/cover with nothing else to refresh it.
    const invalidateQueriesSpy = jest.spyOn(queryClient, 'invalidateQueries');

    await renderNewFit();
    await waitFor(() => expect(useFitBuilderStore.getState().items).toHaveLength(1));

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Save Fit' }));
    await screen.findByDisplayValue('Weekend Look');
    expect(getNextFitName).not.toHaveBeenCalled();

    await user.press(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(insertFit).toHaveBeenCalledWith('user-1', 'fit-1', 'Weekend Look', expect.any(String), '#F6DADA', expect.any(Array)),
    );
    expect(router.dismissTo).toHaveBeenCalledWith({
      pathname: '/fit/[id]',
      params: { id: 'fit-1', fitUpdated: '1' },
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['fits', 'user-1'] });
  });

  it('shows the block-and-keep message when an edit re-save fails with no connection', async () => {
    (getFitItems as jest.Mock).mockResolvedValue([SAVED_PLACEMENT]);
    (uploadCover as jest.Mock).mockRejectedValue(new FitError('no_connection', NO_CONNECTION_MESSAGE));

    await renderNewFit();
    await waitFor(() => expect(useFitBuilderStore.getState().items).toHaveLength(1));

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Save Fit' }));
    await screen.findByDisplayValue('Weekend Look');
    await user.press(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText(NO_CONNECTION_MESSAGE)).toBeTruthy());
    expect(router.dismissTo).not.toHaveBeenCalled();
  });
});
