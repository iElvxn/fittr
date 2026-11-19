import { Share } from 'react-native';

const mockDelete = jest.fn();
const mockDownloadFileAsync = jest.fn();

jest.mock('expo-file-system', () => {
  const File = jest.fn().mockImplementation((dir: string, name: string) => ({ uri: `${dir}/${name}` }));
  (File as unknown as { downloadFileAsync: (...args: unknown[]) => unknown }).downloadFileAsync = (...args: unknown[]) =>
    mockDownloadFileAsync(...args);
  return { File, Paths: { cache: 'file:///cache' } };
});

const COVER_BYTES = new Uint8Array([1, 2, 3]);
const FILLED_BYTES = new Uint8Array([9, 9, 9]);
const mockCoverImage = { width: () => 4, height: () => 3 };
const mockDrawColor = jest.fn();
const mockDrawImage = jest.fn();
const mockMakeImageFromEncoded = jest.fn();
const mockMakeSurface = jest.fn();
jest.mock('@shopify/react-native-skia', () => ({
  ImageFormat: { PNG: 'png' },
  Skia: {
    Color: (color: string) => `color(${color})`,
    Data: { fromBytes: (bytes: Uint8Array) => bytes },
    Image: { MakeImageFromEncoded: (data: unknown) => mockMakeImageFromEncoded(data) },
    Surface: { Make: (width: number, height: number) => mockMakeSurface(width, height) },
  },
}));

import { shareFitCover } from '@/lib/fits/shareFit';

const COVER_URL = 'https://example.supabase.co/storage/v1/object/sign/wardrobe/user-1/fits/fit-1/cover.png?token=abc';
const LOCAL_URI = 'file:///cache/fit-fit-1.png';

describe('shareFitCover', () => {
  let shareSpy: jest.SpyInstance;
  const mockWrite = jest.fn();
  const mockEncode = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockDelete.mockReset();
    mockDownloadFileAsync.mockResolvedValue({
      uri: LOCAL_URI,
      delete: mockDelete,
      bytes: () => Promise.resolve(COVER_BYTES),
      write: mockWrite,
    });
    shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
    mockMakeImageFromEncoded.mockReturnValue(mockCoverImage);
    mockEncode.mockReturnValue(FILLED_BYTES);
    mockMakeSurface.mockReturnValue({
      getCanvas: () => ({ drawColor: mockDrawColor, drawImage: mockDrawImage }),
      makeImageSnapshot: () => ({ encodeToBytes: mockEncode }),
    });
  });

  // A default-background cover is transparent; shared as-is, an app with a
  // dark background would hide dark clothing.
  it('paints the fill color behind the cover, then shares the filled file', async () => {
    await shareFitCover('fit-1', COVER_URL, '#24211E');

    expect(mockMakeImageFromEncoded).toHaveBeenCalledWith(COVER_BYTES);
    expect(mockMakeSurface).toHaveBeenCalledWith(4, 3);
    expect(mockDrawColor).toHaveBeenCalledWith('color(#24211E)');
    expect(mockDrawImage).toHaveBeenCalledWith(mockCoverImage, 0, 0);
    expect(mockDrawColor.mock.invocationCallOrder[0]).toBeLessThan(mockDrawImage.mock.invocationCallOrder[0]);
    expect(mockEncode).toHaveBeenCalledWith('png');
    expect(mockWrite).toHaveBeenCalledWith(FILLED_BYTES);
    expect(mockWrite.mock.invocationCallOrder[0]).toBeLessThan(shareSpy.mock.invocationCallOrder[0]);
    expect(shareSpy).toHaveBeenCalledWith({ url: LOCAL_URI });
  });

  it('shares the download as-is when there is no fill color', async () => {
    await shareFitCover('fit-1', COVER_URL, null);

    expect(mockMakeImageFromEncoded).not.toHaveBeenCalled();
    expect(mockWrite).not.toHaveBeenCalled();
    expect(shareSpy).toHaveBeenCalledWith({ url: LOCAL_URI });
  });

  it('fails without sharing, and still deletes the temp file, when the cover cannot be decoded', async () => {
    mockMakeImageFromEncoded.mockReturnValue(null);

    await expect(shareFitCover('fit-1', COVER_URL, '#FFFDF8')).rejects.toThrow();
    expect(shareSpy).not.toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it('fails without sharing when the fill surface cannot be made', async () => {
    mockMakeSurface.mockReturnValue(null);

    await expect(shareFitCover('fit-1', COVER_URL, '#FFFDF8')).rejects.toThrow();
    expect(shareSpy).not.toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it('downloads the cover to a .png in the cache directory, overwriting any previous copy', async () => {
    await shareFitCover('fit-1', COVER_URL, null);

    expect(mockDownloadFileAsync).toHaveBeenCalledWith(
      COVER_URL,
      expect.objectContaining({ uri: 'file:///cache/fit-fit-1.png' }),
      { idempotent: true },
    );
  });

  it('hands the local file -- never the signed URL -- to the native share sheet', async () => {
    await shareFitCover('fit-1', COVER_URL, null);

    expect(shareSpy).toHaveBeenCalledWith({ url: LOCAL_URI });
    expect(shareSpy).not.toHaveBeenCalledWith(expect.objectContaining({ url: COVER_URL }));
  });

  it('only opens the share sheet after the download has finished', async () => {
    let finishDownload: (value: unknown) => void = () => {};
    mockDownloadFileAsync.mockReturnValue(new Promise((resolve) => (finishDownload = resolve)));

    const pending = shareFitCover('fit-1', COVER_URL, null);
    await Promise.resolve();
    expect(shareSpy).not.toHaveBeenCalled();

    finishDownload({ uri: LOCAL_URI, delete: mockDelete });
    await pending;
    expect(shareSpy).toHaveBeenCalledTimes(1);
  });

  it('deletes the temp file once the sheet closes after sharing', async () => {
    await shareFitCover('fit-1', COVER_URL, null);

    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it('treats a dismissed sheet as a normal outcome and still cleans up', async () => {
    shareSpy.mockResolvedValue({ action: Share.dismissedAction });

    await expect(shareFitCover('fit-1', COVER_URL, null)).resolves.toBeUndefined();
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it('does not fail the share if temp-file cleanup throws', async () => {
    mockDelete.mockImplementation(() => {
      throw new Error('already gone');
    });

    await expect(shareFitCover('fit-1', COVER_URL, null)).resolves.toBeUndefined();
  });

  it('classifies a network failure during download as no_connection and never opens the sheet', async () => {
    mockDownloadFileAsync.mockRejectedValue(new TypeError('Network request failed'));

    await expect(shareFitCover('fit-1', COVER_URL, null)).rejects.toMatchObject({ name: 'FitError', kind: 'no_connection' });
    expect(shareSpy).not.toHaveBeenCalled();
  });

  it.each([
    'Unable to download a file: The Internet connection appears to be offline.',
    'Unable to download a file: The network connection was lost.',
    'Unable to download a file: A server with the specified hostname could not be found.',
    'Unable to download a file: The request timed out.',
  ])('classifies expo-file-system\'s native offline failure (%p) as no_connection', async (message) => {
    mockDownloadFileAsync.mockRejectedValue(new Error(message));

    await expect(shareFitCover('fit-1', COVER_URL, null)).rejects.toMatchObject({ name: 'FitError', kind: 'no_connection' });
    expect(shareSpy).not.toHaveBeenCalled();
  });

  it('rethrows any other download failure unchanged and never opens the sheet', async () => {
    const failure = new Error('Unable to download a file: response has status 403');
    mockDownloadFileAsync.mockRejectedValue(failure);

    await expect(shareFitCover('fit-1', COVER_URL, null)).rejects.toBe(failure);
    expect(shareSpy).not.toHaveBeenCalled();
  });

  it('propagates a share-sheet failure but still cleans up the temp file', async () => {
    const failure = new Error('share failed');
    shareSpy.mockRejectedValue(failure);

    await expect(shareFitCover('fit-1', COVER_URL, null)).rejects.toBe(failure);
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it.each(['../../secrets', 'fit/1', 'fit 1', ''])('refuses an unsafe fitId (%p) before touching the file system', async (badId) => {
    await expect(shareFitCover(badId, COVER_URL, null)).rejects.toThrow();
    expect(mockDownloadFileAsync).not.toHaveBeenCalled();
    expect(shareSpy).not.toHaveBeenCalled();
  });
});
