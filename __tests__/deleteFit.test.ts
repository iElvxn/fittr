import { AuthRetryableFetchError } from '@supabase/supabase-js';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));
jest.mock('@/lib/fits/wearPhoto', () => ({ deleteWearPhotoFiles: jest.fn() }));
jest.mock('@/lib/observability/sentry', () => ({ Sentry: { captureException: jest.fn() } }));

import { countFitWearPhotos, deleteFit } from '@/lib/fits/deleteFit';
import { deleteWearPhotoFiles } from '@/lib/fits/wearPhoto';
import { supabase } from '@/lib/supabase';
import { Sentry } from '@/lib/observability/sentry';

const PHOTO_ROWS = [
  { photo_path: 'user-1/wear-1/a.webp', photo_thumb_path: 'user-1/wear-1/a_thumb.webp' },
  { photo_path: 'user-1/wear-2/b.webp', photo_thumb_path: 'user-1/wear-2/b_thumb.webp' },
];

type Result = { data?: unknown; error: unknown; count?: number | null };

/**
 * `deleteFit` makes three calls: read the Fit's wear photos, soft-delete the
 * Fit, then clear the wears' photo columns. Each gets its own chain, and
 * `steps` records the order they ran in.
 */
function mockDeleteFlow({
  photos = { data: PHOTO_ROWS, error: null } as Result,
  softDelete = { error: null } as Result,
  clear = { error: null } as Result,
} = {}) {
  const steps: string[] = [];
  const photosNot = jest.fn(async () => {
    steps.push('read photos');
    return photos;
  });
  const photosEq = jest.fn().mockReturnValue({ not: photosNot });
  const photosSelect = jest.fn().mockReturnValue({ eq: photosEq });

  const fitsEq = jest.fn(async () => {
    steps.push('soft delete');
    return softDelete;
  });
  const fitsUpdate = jest.fn().mockReturnValue({ eq: fitsEq });

  const clearIn = jest.fn(async () => {
    steps.push('clear photos');
    return clear;
  });
  const clearUpdate = jest.fn().mockReturnValue({ in: clearIn });

  (supabase.from as jest.Mock).mockImplementation((table: string) =>
    table === 'fits' ? { update: fitsUpdate } : { select: photosSelect, update: clearUpdate },
  );
  (deleteWearPhotoFiles as jest.Mock).mockImplementation(async () => {
    steps.push('delete files');
  });
  return { steps, photosSelect, photosEq, photosNot, fitsUpdate, fitsEq, clearUpdate, clearIn };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('deleteFit', () => {
  it('soft-deletes by writing a deleted_at timestamp', async () => {
    const { fitsUpdate, fitsEq } = mockDeleteFlow();

    await deleteFit('fit-1');

    expect(supabase.from).toHaveBeenCalledWith('fits');
    expect(fitsUpdate).toHaveBeenCalledWith({ deleted_at: expect.any(String) });
    const [{ deleted_at: deletedAt }] = fitsUpdate.mock.calls[0];
    expect(Number.isNaN(new Date(deletedAt).getTime())).toBe(false);
    expect(fitsEq).toHaveBeenCalledWith('id', 'fit-1');
  });

  it("reads the Fit's wear photos first, then clears their columns and deletes their files", async () => {
    const { steps, photosSelect, photosEq, photosNot, clearUpdate, clearIn } = mockDeleteFlow();

    await deleteFit('fit-1');

    expect(steps).toEqual(['read photos', 'soft delete', 'clear photos', 'delete files']);
    expect(photosSelect).toHaveBeenCalledWith('photo_path, photo_thumb_path');
    expect(photosEq).toHaveBeenCalledWith('fit_id', 'fit-1');
    expect(photosNot).toHaveBeenCalledWith('photo_path', 'is', null);
    // The wear rows stay for the streak and history; only their photo is cleared.
    expect(clearUpdate).toHaveBeenCalledWith({ photo_path: null, photo_thumb_path: null, photo_thumbhash: null });
    // Only the photos read before the delete, so one saved since keeps its row and files.
    expect(clearIn).toHaveBeenCalledWith('photo_path', ['user-1/wear-1/a.webp', 'user-1/wear-2/b.webp']);
    expect(deleteWearPhotoFiles).toHaveBeenCalledWith([
      'user-1/wear-1/a.webp',
      'user-1/wear-1/a_thumb.webp',
      'user-1/wear-2/b.webp',
      'user-1/wear-2/b_thumb.webp',
    ]);
  });

  it('touches no wears or files when the Fit has no wear photos', async () => {
    const { steps } = mockDeleteFlow({ photos: { data: [], error: null } });

    await deleteFit('fit-1');

    expect(steps).toEqual(['read photos', 'soft delete']);
    expect(deleteWearPhotoFiles).not.toHaveBeenCalled();
  });

  it('does not delete the Fit when its wear photos cannot be read', async () => {
    const { steps } = mockDeleteFlow({ photos: { data: null, error: new AuthRetryableFetchError('offline', 0) } });

    await expect(deleteFit('fit-1')).rejects.toMatchObject({ name: 'FitError', kind: 'no_connection' });
    expect(steps).toEqual(['read photos']);
  });

  it('keeps the photos when the soft delete fails', async () => {
    const { steps } = mockDeleteFlow({ softDelete: { error: new Error('boom') } });

    await expect(deleteFit('fit-1')).rejects.toThrow('boom');
    expect(steps).toEqual(['read photos', 'soft delete']);
    expect(deleteWearPhotoFiles).not.toHaveBeenCalled();
  });

  it('still succeeds, reporting to Sentry, when clearing the photo columns fails after the delete', async () => {
    const { steps } = mockDeleteFlow({ clear: { error: new Error('boom') } });

    await expect(deleteFit('fit-1')).resolves.toBeUndefined();
    expect(Sentry.captureException).toHaveBeenCalled();
    // The row still points at the files, so they're kept rather than orphaning the row.
    expect(steps).toEqual(['read photos', 'soft delete', 'clear photos']);
  });

  it('classifies a no-connection failure', async () => {
    mockDeleteFlow({ softDelete: { error: new AuthRetryableFetchError('network request failed', 0) } });

    await expect(deleteFit('fit-1')).rejects.toMatchObject({ name: 'FitError', kind: 'no_connection' });
  });

  it('rethrows other errors', async () => {
    mockDeleteFlow({ softDelete: { error: new Error('boom') } });

    await expect(deleteFit('fit-1')).rejects.toThrow('boom');
  });
});

describe('countFitWearPhotos', () => {
  function mockCount(result: Result) {
    const not = jest.fn().mockResolvedValue(result);
    const eq = jest.fn().mockReturnValue({ not });
    const select = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ select });
    return { select, eq, not };
  }

  it("counts the Fit's wears that have a photo, without fetching the rows", async () => {
    const { select, eq, not } = mockCount({ count: 3, error: null });

    await expect(countFitWearPhotos('fit-1')).resolves.toBe(3);
    expect(supabase.from).toHaveBeenCalledWith('fit_wears');
    expect(select).toHaveBeenCalledWith('id', { count: 'exact', head: true });
    expect(eq).toHaveBeenCalledWith('fit_id', 'fit-1');
    expect(not).toHaveBeenCalledWith('photo_path', 'is', null);
  });

  it('treats a null count as none', async () => {
    mockCount({ count: null, error: null });

    await expect(countFitWearPhotos('fit-1')).resolves.toBe(0);
  });

  it('classifies a no-connection failure', async () => {
    mockCount({ count: null, error: new AuthRetryableFetchError('offline', 0) });

    await expect(countFitWearPhotos('fit-1')).rejects.toMatchObject({ kind: 'no_connection' });
  });
});
