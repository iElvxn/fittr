import { Share } from 'react-native';

const mockDelete = jest.fn();
const mockDownloadFileAsync = jest.fn();

jest.mock('expo-file-system', () => {
  const File = jest.fn().mockImplementation((dir: string, name: string) => ({ uri: `${dir}/${name}` }));
  (File as unknown as { downloadFileAsync: (...args: unknown[]) => unknown }).downloadFileAsync = (...args: unknown[]) =>
    mockDownloadFileAsync(...args);
  return { File, Paths: { cache: 'file:///cache' } };
});

import { shareFitCover } from '@/lib/fits/shareFit';

const COVER_URL = 'https://example.supabase.co/storage/v1/object/sign/wardrobe/user-1/fits/fit-1/cover.png?token=abc';
const LOCAL_URI = 'file:///cache/fit-fit-1.png';

describe('shareFitCover', () => {
  let shareSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDelete.mockReset();
    mockDownloadFileAsync.mockResolvedValue({ uri: LOCAL_URI, delete: mockDelete });
    shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
  });

  it('downloads the cover to a .png in the cache directory, overwriting any previous copy', async () => {
    await shareFitCover('fit-1', COVER_URL);

    expect(mockDownloadFileAsync).toHaveBeenCalledWith(
      COVER_URL,
      expect.objectContaining({ uri: 'file:///cache/fit-fit-1.png' }),
      { idempotent: true },
    );
  });

  it('hands the local file -- never the signed URL -- to the native share sheet', async () => {
    await shareFitCover('fit-1', COVER_URL);

    expect(shareSpy).toHaveBeenCalledWith({ url: LOCAL_URI });
    expect(shareSpy).not.toHaveBeenCalledWith(expect.objectContaining({ url: COVER_URL }));
  });

  it('only opens the share sheet after the download has finished', async () => {
    let finishDownload: (value: unknown) => void = () => {};
    mockDownloadFileAsync.mockReturnValue(new Promise((resolve) => (finishDownload = resolve)));

    const pending = shareFitCover('fit-1', COVER_URL);
    await Promise.resolve();
    expect(shareSpy).not.toHaveBeenCalled();

    finishDownload({ uri: LOCAL_URI, delete: mockDelete });
    await pending;
    expect(shareSpy).toHaveBeenCalledTimes(1);
  });

  it('deletes the temp file once the sheet closes after sharing', async () => {
    await shareFitCover('fit-1', COVER_URL);

    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it('treats a dismissed sheet as a normal outcome and still cleans up', async () => {
    shareSpy.mockResolvedValue({ action: Share.dismissedAction });

    await expect(shareFitCover('fit-1', COVER_URL)).resolves.toBeUndefined();
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it('does not fail the share if temp-file cleanup throws', async () => {
    mockDelete.mockImplementation(() => {
      throw new Error('already gone');
    });

    await expect(shareFitCover('fit-1', COVER_URL)).resolves.toBeUndefined();
  });

  it('classifies a network failure during download as no_connection and never opens the sheet', async () => {
    mockDownloadFileAsync.mockRejectedValue(new TypeError('Network request failed'));

    await expect(shareFitCover('fit-1', COVER_URL)).rejects.toMatchObject({ name: 'FitError', kind: 'no_connection' });
    expect(shareSpy).not.toHaveBeenCalled();
  });

  it.each([
    'Unable to download a file: The Internet connection appears to be offline.',
    'Unable to download a file: The network connection was lost.',
    'Unable to download a file: A server with the specified hostname could not be found.',
    'Unable to download a file: The request timed out.',
  ])('classifies expo-file-system\'s native offline failure (%p) as no_connection', async (message) => {
    mockDownloadFileAsync.mockRejectedValue(new Error(message));

    await expect(shareFitCover('fit-1', COVER_URL)).rejects.toMatchObject({ name: 'FitError', kind: 'no_connection' });
    expect(shareSpy).not.toHaveBeenCalled();
  });

  it('rethrows any other download failure unchanged and never opens the sheet', async () => {
    const failure = new Error('Unable to download a file: response has status 403');
    mockDownloadFileAsync.mockRejectedValue(failure);

    await expect(shareFitCover('fit-1', COVER_URL)).rejects.toBe(failure);
    expect(shareSpy).not.toHaveBeenCalled();
  });

  it('propagates a share-sheet failure but still cleans up the temp file', async () => {
    const failure = new Error('share failed');
    shareSpy.mockRejectedValue(failure);

    await expect(shareFitCover('fit-1', COVER_URL)).rejects.toBe(failure);
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it.each(['../../secrets', 'fit/1', 'fit 1', ''])('refuses an unsafe fitId (%p) before touching the file system', async (badId) => {
    await expect(shareFitCover(badId, COVER_URL)).rejects.toThrow();
    expect(mockDownloadFileAsync).not.toHaveBeenCalled();
    expect(shareSpy).not.toHaveBeenCalled();
  });
});
