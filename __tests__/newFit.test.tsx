import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), dismissTo: jest.fn() },
}));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => `uuid-${Math.random()}`) }));
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }));
jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(), storage: { from: jest.fn() } } }));
jest.mock('@/lib/auth/useSession', () => ({
  useSession: jest.fn(() => ({ session: { user: { id: 'user-1' } } })),
}));
jest.mock('@/lib/wardrobe/listItems', () => ({
  useWardrobeItems: jest.fn(() => ({ data: [] })),
}));
jest.mock('@/lib/wardrobe/thumbnailUrls', () => ({
  useThumbnailUrls: jest.fn(() => ({ data: {} })),
}));
jest.mock('@/lib/fits/nextFitName', () => ({ getNextFitName: jest.fn() }));
jest.mock('@/lib/fits/saveFit', () => ({ uploadCover: jest.fn(), insertFit: jest.fn() }));
jest.mock('@/lib/observability/sentry', () => ({ Sentry: { captureException: jest.fn() } }));
// `CanvasItem` pulls in Reanimated for its drag/pinch/rotate gesture, which has
// no working jest mock under Reanimated v4's worklets split -- same stand-in
// `fitCanvas.test.tsx` uses, needed here since a placed item renders one.
jest.mock('@/components/fitBuilder/CanvasItem', () => ({ CanvasItem: () => null }));
jest.mock('react-native-reanimated', () => ({ runOnJS: (fn: (...args: unknown[]) => unknown) => fn }));

import NewFit from '@/app/new-fit';
import { router } from 'expo-router';
import { captureRef } from 'react-native-view-shot';
import { getNextFitName } from '@/lib/fits/nextFitName';
import { uploadCover, insertFit } from '@/lib/fits/saveFit';
import { FitError, NO_CONNECTION_MESSAGE, UNKNOWN_ERROR_MESSAGE } from '@/lib/fits/errors';
import { useFitBuilderStore } from '@/stores/fitBuilder';

beforeEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
  useFitBuilderStore.setState({ templateId: null, items: [], selectedId: null, canvasBackgroundColor: null });
  (captureRef as jest.Mock).mockResolvedValue('file://collage.png');
  (getNextFitName as jest.Mock).mockResolvedValue('Fit 12');
});

describe('New Fit -- Save flow', () => {
  it('disables Save when the canvas has no items', async () => {
    const user = userEvent.setup();
    await render(<NewFit />);
    await user.press(screen.getByText('Skip for now'));

    expect(screen.getByRole('button', { name: 'Save Fit' }).props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });

  it('shows an error notice and stays on the canvas when the collage capture fails', async () => {
    (captureRef as jest.Mock).mockRejectedValue(new Error('capture boom'));

    await render(<NewFit />);
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
    await render(<NewFit />);
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

    await render(<NewFit />);
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

    await render(<NewFit />);
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
