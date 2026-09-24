import { StyleSheet } from 'react-native';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/lib/fits/toggleFavorite', () => ({ toggleFitFavorite: jest.fn() }));
jest.mock('@/lib/observability/sentry', () => ({ Sentry: { captureException: jest.fn() } }));

import { FitsGridCell } from '@/components/fits/FitsGridCell';
import { toggleFitFavorite } from '@/lib/fits/toggleFavorite';
import { FitError, NO_CONNECTION_MESSAGE } from '@/lib/fits/errors';
import { Sentry } from '@/lib/observability/sentry';

let queryClient: QueryClient;

function renderCell(overrides: Partial<React.ComponentProps<typeof FitsGridCell>> = {}) {
  return render(
    <QueryClientProvider client={queryClient}>
      <FitsGridCell
        name="Weekend Look"
        thumbnailUrl="https://signed.example/cover.png"
        columnWidth={160}
        onPress={jest.fn()}
        fitId="fit-1"
        isFavorite={false}
        userId="user-1"
        backgroundColor={null}
        meta="Worn 3×"
        {...overrides}
      />
    </QueryClientProvider>,
  );
}

describe('FitsGridCell tile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  });

  it('renders a fixed 3:4 well, whatever the cover size', async () => {
    await renderCell({ columnWidth: 150 });

    const style = StyleSheet.flatten(screen.getByTestId('fits-grid-tile').props.style);
    expect(style.width).toBe(150);
    expect(style.height).toBe(200);
  });

  it("fills the well with the Fit's canvas background color", async () => {
    await renderCell({ backgroundColor: '#DCE8DC' });

    const tile = screen.getByTestId('fits-grid-tile');
    expect(StyleSheet.flatten(tile.props.style).backgroundColor).toBe('#DCE8DC');
    expect(tile.props.className ?? '').not.toContain('bg-surface-raised');
  });

  it('falls back to surface-raised when the Fit has no background color', async () => {
    await renderCell({ backgroundColor: null });

    const tile = screen.getByTestId('fits-grid-tile');
    expect(StyleSheet.flatten(tile.props.style).backgroundColor).toBeUndefined();
    expect(tile.props.className).toContain('bg-surface-raised');
    expect(tile.props.className).toContain('dark:bg-surface-raisedDark');
  });

  it('contains the cover instead of cropping it', async () => {
    await renderCell();

    expect(screen.getByTestId('fits-grid-thumbnail-image').props.contentFit).toBe('contain');
  });

  it('shows no image when there is no cover URL, keeping the 3:4 well', async () => {
    await renderCell({ thumbnailUrl: null, columnWidth: 150 });

    expect(screen.queryByTestId('fits-grid-thumbnail-image')).toBeNull();
    expect(StyleSheet.flatten(screen.getByTestId('fits-grid-tile').props.style).height).toBe(200);
  });

  it('renders the name in the serif on one line and the meta line as a secondary caption', async () => {
    await renderCell({ name: 'Weekend Look', meta: 'Saved Sep 21' });

    const name = screen.getByText('Weekend Look');
    expect(StyleSheet.flatten(name.props.style).fontFamily).toBe('Newsreader_400Regular');
    expect(name.props.numberOfLines).toBe(1);

    const meta = screen.getByText('Saved Sep 21');
    expect(StyleSheet.flatten(meta.props.style).textTransform).toBe('uppercase');
    expect(meta.props.className).toContain('text-ink-secondary');
  });
});

describe('FitsGridCell favorite badge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  });

  it('renders an outline heart when not favorited', async () => {
    await renderCell({ isFavorite: false });

    expect(screen.getByRole('button', { name: 'Add Weekend Look to favorites' })).toBeTruthy();
  });

  it('renders a filled heart when favorited', async () => {
    await renderCell({ isFavorite: true });

    expect(screen.getByRole('button', { name: 'Remove Weekend Look from favorites' })).toBeTruthy();
  });

  it('flips to filled immediately and calls toggleFitFavorite', async () => {
    let resolveToggle: () => void;
    (toggleFitFavorite as jest.Mock).mockReturnValue(new Promise<void>((resolve) => (resolveToggle = resolve)));
    await renderCell({ isFavorite: false });

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add Weekend Look to favorites' }));

    expect(toggleFitFavorite).toHaveBeenCalledWith('fit-1', true);
    expect(screen.getByRole('button', { name: 'Remove Weekend Look from favorites' })).toBeTruthy();

    resolveToggle!();
    await waitFor(() => {});
  });

  it('invalidates the fits query on success, the same key the My Fits grid and Favorites filter read from', async () => {
    // Same `jest.spyOn(queryClient, 'invalidateQueries')` pattern as
    // `newFit.test.tsx` -- this is the write path the Favorites-filter
    // acceptance criterion actually depends on.
    const invalidateQueriesSpy = jest.spyOn(queryClient, 'invalidateQueries');
    (toggleFitFavorite as jest.Mock).mockResolvedValue(undefined);
    await renderCell({ isFavorite: false, userId: 'user-1' });

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add Weekend Look to favorites' }));

    await waitFor(() => {
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['fits', 'user-1'] });
    });
  });

  it('flips to outline immediately when already favorited', async () => {
    // Asserts before the write resolves, same reasoning as `fitDetail.test.tsx`'s
    // history: once `invalidateQueries` resolves and the override clears, the
    // button falls back to this mock's static `isFavorite` prop (never updated
    // by a real refetch here), not the real post-toggle value.
    let resolveToggle: () => void;
    (toggleFitFavorite as jest.Mock).mockReturnValue(new Promise<void>((resolve) => (resolveToggle = resolve)));
    await renderCell({ isFavorite: true });

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Remove Weekend Look from favorites' }));

    expect(toggleFitFavorite).toHaveBeenCalledWith('fit-1', false);
    expect(screen.getByRole('button', { name: 'Add Weekend Look to favorites' })).toBeTruthy();

    resolveToggle!();
    await waitFor(() => {});
  });

  it('reverts the optimistic flip without reporting to Sentry when the write fails offline', async () => {
    (toggleFitFavorite as jest.Mock).mockRejectedValue(new FitError('no_connection', NO_CONNECTION_MESSAGE));
    await renderCell({ isFavorite: false });

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add Weekend Look to favorites' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add Weekend Look to favorites' })).toBeTruthy();
    });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('reverts the optimistic flip and reports an unknown error', async () => {
    (toggleFitFavorite as jest.Mock).mockRejectedValue(new Error('boom'));
    await renderCell({ isFavorite: false });

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add Weekend Look to favorites' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add Weekend Look to favorites' })).toBeTruthy();
    });
    expect(Sentry.captureException).toHaveBeenCalledWith(new Error('boom'));
  });

  it('ignores a second tap while the first write is still in flight', async () => {
    let resolveToggle: () => void;
    (toggleFitFavorite as jest.Mock).mockReturnValue(new Promise<void>((resolve) => (resolveToggle = resolve)));
    await renderCell({ isFavorite: false });

    const user = userEvent.setup();
    const button = screen.getByRole('button', { name: 'Add Weekend Look to favorites' });
    await user.press(button);
    await user.press(screen.getByRole('button', { name: 'Remove Weekend Look from favorites' }));

    expect(toggleFitFavorite).toHaveBeenCalledTimes(1);

    resolveToggle!();
    await waitFor(() => {});
  });

  it('does not navigate into the Fit when the heart badge is tapped', async () => {
    const onPress = jest.fn();
    (toggleFitFavorite as jest.Mock).mockResolvedValue(undefined);
    await renderCell({ isFavorite: false, onPress });

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add Weekend Look to favorites' }));

    expect(onPress).not.toHaveBeenCalled();
  });

  it('still navigates into the Fit when the cell itself is tapped', async () => {
    const onPress = jest.fn();
    await renderCell({ name: 'Weekend Look', onPress });

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Weekend Look, Worn 3×' }));

    expect(onPress).toHaveBeenCalled();
  });
});
