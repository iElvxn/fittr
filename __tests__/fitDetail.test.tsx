import { ActionSheetIOS } from 'react-native';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), setParams: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('@/lib/auth/useSession', () => ({ useSession: jest.fn() }));
jest.mock('@/lib/fits/listFits', () => ({ useFits: jest.fn() }));
jest.mock('@/lib/wardrobe/thumbnailUrls', () => ({ useThumbnailUrls: jest.fn() }));
jest.mock('@/lib/fits/deleteFit', () => ({ deleteFit: jest.fn() }));
jest.mock('@/lib/observability/sentry', () => ({ Sentry: { captureException: jest.fn() } }));

import FitDetail from '@/app/fit/[id]';
import { router, useLocalSearchParams } from 'expo-router';
import { useSession } from '@/lib/auth/useSession';
import { useFits } from '@/lib/fits/listFits';
import { useThumbnailUrls } from '@/lib/wardrobe/thumbnailUrls';
import { deleteFit } from '@/lib/fits/deleteFit';
import { Sentry } from '@/lib/observability/sentry';
import { FitError, NO_CONNECTION_MESSAGE, UNKNOWN_ERROR_MESSAGE } from '@/lib/fits/errors';
import type { FitRow } from '@/lib/fits/listFits';

let queryClient: QueryClient;

function makeFit(overrides: Partial<FitRow> = {}): FitRow {
  return {
    id: 'fit-1',
    name: 'Weekend Look',
    cover_path: 'user-1/fits/fit-1/cover.png',
    canvas_background_color: null,
    updated_at: '2026-09-18T00:00:00.000Z',
    ...overrides,
  };
}

function mockActionSheetChoice(buttonIndex: number) {
  jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation((_options, callback) => callback(buttonIndex));
}

function renderFitDetail() {
  return render(
    <QueryClientProvider client={queryClient}>
      <FitDetail />
    </QueryClientProvider>,
  );
}

describe('Fit detail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'fit-1' });
    (useSession as jest.Mock).mockReturnValue({ session: { user: { id: 'user-1' } }, loading: false });
    (useFits as jest.Mock).mockReturnValue({
      data: [makeFit()],
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
    (useThumbnailUrls as jest.Mock).mockReturnValue({
      data: { 'user-1/fits/fit-1/cover.png': 'https://signed.example/cover.png' },
    });
  });

  it('shows the cover image, name, and Edit/Delete controls', async () => {
    await renderFitDetail();

    expect(screen.getByTestId('fit-detail-cover')).toBeTruthy();
    expect(screen.getByText('Weekend Look')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete Fit' })).toBeTruthy();
  });

  it('navigates to the canvas builder with fitId when Edit is pressed', async () => {
    await renderFitDetail();

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Edit' }));

    expect(router.push).toHaveBeenCalledWith({ pathname: '/new-fit', params: { fitId: 'fit-1' } });
  });

  it('deletes the Fit and navigates back on confirm', async () => {
    (deleteFit as jest.Mock).mockResolvedValue(undefined);
    mockActionSheetChoice(0);
    await renderFitDetail();

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Delete Fit' }));

    await waitFor(() => {
      expect(deleteFit).toHaveBeenCalledWith('fit-1');
    });
    expect(router.back).toHaveBeenCalled();
  });

  it('does nothing when delete is cancelled in the action sheet', async () => {
    mockActionSheetChoice(1);
    await renderFitDetail();

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Delete Fit' }));

    expect(deleteFit).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('shows a connection error and stays on screen when delete fails offline', async () => {
    (deleteFit as jest.Mock).mockRejectedValue(new FitError('no_connection', NO_CONNECTION_MESSAGE));
    mockActionSheetChoice(0);
    await renderFitDetail();

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Delete Fit' }));

    expect(await screen.findByText(NO_CONNECTION_MESSAGE)).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('reports and shows a generic message for an unknown delete error', async () => {
    (deleteFit as jest.Mock).mockRejectedValue(new Error('boom'));
    mockActionSheetChoice(0);
    await renderFitDetail();

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Delete Fit' }));

    expect(await screen.findByText(UNKNOWN_ERROR_MESSAGE)).toBeTruthy();
    expect(Sentry.captureException).toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('shows a loading indicator while the Fits list is loading', async () => {
    (useFits as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
    await renderFitDetail();

    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  it('shows a connection error with retry when the Fits list fails to load', async () => {
    const refetch = jest.fn();
    (useFits as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new TypeError('Network request failed'),
      refetch,
    });
    await renderFitDetail();

    expect(screen.getByText(NO_CONNECTION_MESSAGE)).toBeTruthy();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('shows a generic message and reports an unexpected list-load failure', async () => {
    (useFits as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('boom'),
      refetch: jest.fn(),
    });

    await renderFitDetail();

    expect(screen.getByText(UNKNOWN_ERROR_MESSAGE)).toBeTruthy();
    expect(Sentry.captureException).toHaveBeenCalled();
  });

  it('shows a fallback when the cover has no resolved thumbnail yet', async () => {
    (useThumbnailUrls as jest.Mock).mockReturnValue({ data: {} });

    await renderFitDetail();

    expect(screen.getByTestId('fit-detail-cover-fallback')).toBeTruthy();
    expect(screen.queryByTestId('fit-detail-cover')).toBeNull();
  });

  it('shows a not-found message when the Fit is missing from the list', async () => {
    (useFits as jest.Mock).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
    await renderFitDetail();

    expect(screen.getByText('This Fit is no longer available.')).toBeTruthy();
  });

  it('shows "Fit updated." when returning with fitUpdated=1', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'fit-1', fitUpdated: '1' });

    await renderFitDetail();

    expect(screen.getByText('Fit updated.')).toBeTruthy();
  });

  it('shows no acknowledgement without the fitUpdated param', async () => {
    await renderFitDetail();

    expect(screen.queryByText('Fit updated.')).toBeNull();
  });
});
