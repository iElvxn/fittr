import { AuthRetryableFetchError } from '@supabase/supabase-js';
import { ActionSheetIOS } from 'react-native';

type Size = { width: number; height: number };

// Source images the fake manipulator knows the size of, by uri.
const mockSourceSizes: Record<string, Size> = {};
// Every `saveAsync` call, in order: the encode options plus the size saved.
let mockSaved: ({ format?: string; compress?: number } & Size)[] = [];

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { WEBP: 'webp', JPEG: 'jpeg', PNG: 'png' },
  ImageManipulator: {
    manipulate: jest.fn((input: string | ({ uri?: string } & Partial<Size>)) => {
      let size: Size =
        typeof input === 'string'
          ? mockSourceSizes[input]
          : { width: input.width ?? mockSourceSizes[input.uri ?? ''].width, height: input.height ?? mockSourceSizes[input.uri ?? ''].height };
      const context: { resize: jest.Mock; renderAsync: jest.Mock } = {
        resize: jest.fn((target: Partial<Size>) => {
          const ratio = size.width / size.height;
          size =
            target.width !== undefined
              ? { width: target.width, height: Math.round(target.width / ratio) }
              : { width: Math.round((target.height as number) * ratio), height: target.height as number };
          return context;
        }),
        renderAsync: jest.fn(async () => {
          const rendered = { ...size };
          return {
            ...rendered,
            saveAsync: jest.fn(async (options: { format?: string; compress?: number }) => {
              mockSaved.push({ ...options, ...rendered });
              const uri = `file://saved-${mockSaved.length}.webp`;
              mockSourceSizes[uri] = rendered;
              return { uri, ...rendered };
            }),
          };
        }),
      };
      return context;
    }),
  },
}));
jest.mock('expo-image', () => ({ Image: { generateThumbhashAsync: jest.fn() } }));
jest.mock('expo-image-picker', () => ({
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
}));
const mockDeletedFiles: string[] = [];
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((uri: string) => ({
    uri,
    arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
    delete: jest.fn(() => mockDeletedFiles.push(uri)),
  })),
}));
let mockUuidCounter = 0;
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => `uuid-${++mockUuidCounter}`) }));
jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(), storage: { from: jest.fn() } } }));
jest.mock('@/lib/observability/sentry', () => ({ Sentry: { captureException: jest.fn() } }));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';

import {
  chooseWearPhotoSource,
  deleteWearPhotoFiles,
  pickWearPhoto,
  processWearPhoto,
  removeWearPhoto,
  saveWearPhoto,
  useWearPhotoUrls,
  WEAR_PHOTO_BUCKET,
} from '@/lib/fits/wearPhoto';
import { supabase } from '@/lib/supabase';
import { Sentry } from '@/lib/observability/sentry';

const SOURCE = 'file://picked.heic';
const OLD_PHOTO = {
  path: 'user-1/wear-1/old.webp',
  thumbPath: 'user-1/wear-1/old_thumb.webp',
  thumbhash: 'old-hash',
};
const offline = () => new AuthRetryableFetchError('network request failed', 0);

/** Everything the save touches, in the order it happened. */
let calls: string[];

function mockStorage({
  upload = () => ({ error: null }),
  remove = () => ({ data: [], error: null }),
}: {
  upload?: (path: string) => { error: unknown };
  remove?: () => { data: unknown; error: unknown };
} = {}) {
  const uploadFn = jest.fn(async (path: string) => {
    calls.push(`upload ${path}`);
    return upload(path);
  });
  const removeFn = jest.fn(async (paths: string[]) => {
    calls.push(`remove ${paths.join(',')}`);
    return remove();
  });
  const createSignedUrls = jest.fn();
  (supabase.storage.from as jest.Mock).mockReturnValue({ upload: uploadFn, remove: removeFn, createSignedUrls });
  return { upload: uploadFn, remove: removeFn, createSignedUrls };
}

function mockRowUpdate(result: { data: unknown; error: unknown } = { data: [{ id: 'wear-1' }], error: null }) {
  const select = jest.fn(async () => {
    calls.push('update row');
    return result;
  });
  const eq = jest.fn().mockReturnValue({ select });
  const update = jest.fn().mockReturnValue({ eq });
  (supabase.from as jest.Mock).mockReturnValue({ update });
  return { update, eq, select };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUuidCounter = 0;
  mockSaved = [];
  mockDeletedFiles.length = 0;
  calls = [];
  mockSourceSizes[SOURCE] = { width: 3024, height: 4032 };
  (Image.generateThumbhashAsync as jest.Mock).mockResolvedValue('new-hash');
});

describe('processWearPhoto', () => {
  it('re-encodes the photo to 1080px WebP at 75% and a 240px WebP thumbnail, with a thumbhash', async () => {
    const processed = await processWearPhoto(SOURCE);

    expect(mockSaved).toEqual([
      { format: 'webp', compress: 0.75, width: 810, height: 1080 },
      expect.objectContaining({ format: 'webp', width: 180, height: 240 }),
    ]);
    expect(processed).toEqual({ uri: 'file://saved-1.webp', thumbUri: 'file://saved-2.webp', thumbhash: 'new-hash' });
    expect(Image.generateThumbhashAsync).toHaveBeenCalledWith('file://saved-2.webp');
  });

  it('sizes a landscape photo by its long edge too', async () => {
    mockSourceSizes[SOURCE] = { width: 4032, height: 3024 };

    await processWearPhoto(SOURCE);

    expect(mockSaved[0]).toMatchObject({ width: 1080, height: 810 });
    expect(mockSaved[1]).toMatchObject({ width: 240, height: 180 });
  });

  it('never upscales a small photo, but still re-encodes it (which drops its EXIF)', async () => {
    mockSourceSizes[SOURCE] = { width: 600, height: 800 };

    await processWearPhoto(SOURCE);

    expect(mockSaved[0]).toEqual({ format: 'webp', compress: 0.75, width: 600, height: 800 });
  });

  it('keeps going without a placeholder when the thumbhash fails', async () => {
    (Image.generateThumbhashAsync as jest.Mock).mockRejectedValue(new Error('no hash'));

    await expect(processWearPhoto(SOURCE)).resolves.toMatchObject({ thumbhash: null });
  });
});

describe('chooseWearPhotoSource', () => {
  function choose(buttonIndex: number) {
    jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation((_options, callback) => callback(buttonIndex));
    return chooseWearPhotoSource();
  }

  it('offers the camera or the library in a native action sheet', async () => {
    await expect(choose(0)).resolves.toBe('camera');

    expect(ActionSheetIOS.showActionSheetWithOptions).toHaveBeenCalledWith(
      {
        title: 'Add a photo of what you wore',
        options: ['Take Photo', 'Choose from Library', 'Cancel'],
        cancelButtonIndex: 2,
      },
      expect.any(Function),
    );
  });

  it('resolves library, or null on Cancel', async () => {
    await expect(choose(1)).resolves.toBe('library');
    await expect(choose(2)).resolves.toBeNull();
  });
});

describe('pickWearPhoto', () => {
  const launchCamera = ImagePicker.launchCameraAsync as jest.Mock;
  const launchLibrary = ImagePicker.launchImageLibraryAsync as jest.Mock;
  const requestCamera = ImagePicker.requestCameraPermissionsAsync as jest.Mock;

  it('takes a full-quality, unedited photo from the library', async () => {
    launchLibrary.mockResolvedValue({ canceled: false, assets: [{ uri: SOURCE }] });

    await expect(pickWearPhoto('library')).resolves.toEqual({ uri: SOURCE });
    expect(launchLibrary).toHaveBeenCalledWith(
      expect.objectContaining({ mediaTypes: 'images', quality: 1, allowsEditing: false, exif: false }),
    );
  });

  it('asks for camera access before taking a photo', async () => {
    requestCamera.mockResolvedValue({ granted: true });
    launchCamera.mockResolvedValue({ canceled: false, assets: [{ uri: SOURCE }] });

    await expect(pickWearPhoto('camera')).resolves.toEqual({ uri: SOURCE });
    expect(launchCamera).toHaveBeenCalledWith(expect.objectContaining({ quality: 1, allowsEditing: false, exif: false }));
  });

  it('reports a denied camera without opening it', async () => {
    requestCamera.mockResolvedValue({ granted: false });

    await expect(pickWearPhoto('camera')).resolves.toEqual({ denied: true });
    expect(launchCamera).not.toHaveBeenCalled();
  });

  it('reports a cancelled pick', async () => {
    launchLibrary.mockResolvedValue({ canceled: true, assets: null });

    await expect(pickWearPhoto('library')).resolves.toEqual({ cancelled: true });
  });
});

describe('saveWearPhoto', () => {
  it('uploads both files under a new name, then updates the row, and returns the photo', async () => {
    const { upload } = mockStorage();
    const { update, eq } = mockRowUpdate();

    const photo = await saveWearPhoto('user-1', { id: 'wear-1', photo: null }, SOURCE);

    expect(supabase.storage.from).toHaveBeenCalledWith(WEAR_PHOTO_BUCKET);
    expect(WEAR_PHOTO_BUCKET).toBe('wear-photos');
    expect(calls).toEqual([
      'upload user-1/wear-1/uuid-1.webp',
      'upload user-1/wear-1/uuid-1_thumb.webp',
      'update row',
    ]);
    for (const [, body, options] of upload.mock.calls as unknown as [string, unknown, Record<string, unknown>][]) {
      expect(body).toBeInstanceOf(ArrayBuffer);
      expect(options).toEqual({ contentType: 'image/webp' });
    }
    expect(supabase.from).toHaveBeenCalledWith('fit_wears');
    expect(update).toHaveBeenCalledWith({
      photo_path: 'user-1/wear-1/uuid-1.webp',
      photo_thumb_path: 'user-1/wear-1/uuid-1_thumb.webp',
      photo_thumbhash: 'new-hash',
    });
    expect(eq).toHaveBeenCalledWith('id', 'wear-1');
    expect(photo).toEqual({
      path: 'user-1/wear-1/uuid-1.webp',
      thumbPath: 'user-1/wear-1/uuid-1_thumb.webp',
      thumbhash: 'new-hash',
    });
  });

  it('replaces: deletes the old files only after the row points at the new ones', async () => {
    mockStorage();
    mockRowUpdate();

    await saveWearPhoto('user-1', { id: 'wear-1', photo: OLD_PHOTO }, SOURCE);

    expect(calls).toEqual([
      'upload user-1/wear-1/uuid-1.webp',
      'upload user-1/wear-1/uuid-1_thumb.webp',
      'update row',
      `remove ${OLD_PHOTO.path},${OLD_PHOTO.thumbPath}`,
    ]);
  });

  it('deletes its local re-encoded files once uploaded, and when the save fails', async () => {
    mockStorage();
    mockRowUpdate();

    await saveWearPhoto('user-1', { id: 'wear-1', photo: null }, SOURCE);
    expect(mockDeletedFiles).toEqual(['file://saved-1.webp', 'file://saved-2.webp']);

    mockDeletedFiles.length = 0;
    mockRowUpdate({ data: null, error: new Error('boom') });
    await expect(saveWearPhoto('user-1', { id: 'wear-1', photo: null }, SOURCE)).rejects.toThrow('boom');
    expect(mockDeletedFiles).toHaveLength(2);
    // The picked original isn't ours to delete.
    expect(mockDeletedFiles).not.toContain(SOURCE);
  });

  it('never gets the same file name twice', async () => {
    mockStorage();
    mockRowUpdate();

    const first = await saveWearPhoto('user-1', { id: 'wear-1', photo: null }, SOURCE);
    const second = await saveWearPhoto('user-1', { id: 'wear-1', photo: first }, SOURCE);

    expect(second.path).not.toBe(first.path);
    expect(second.thumbPath).not.toBe(first.thumbPath);
  });

  it('reports a failed old-file delete to Sentry but still succeeds', async () => {
    mockStorage({ remove: () => ({ data: null, error: new Error('storage down') }) });
    mockRowUpdate();

    await expect(saveWearPhoto('user-1', { id: 'wear-1', photo: OLD_PHOTO }, SOURCE)).resolves.toMatchObject({
      path: 'user-1/wear-1/uuid-1.webp',
    });
    expect(Sentry.captureException).toHaveBeenCalled();
  });

  it('rolls back the uploaded files when the row update fails, leaving the old photo alone', async () => {
    const { remove } = mockStorage();
    mockRowUpdate({ data: null, error: new Error('boom') });

    await expect(saveWearPhoto('user-1', { id: 'wear-1', photo: OLD_PHOTO }, SOURCE)).rejects.toThrow('boom');

    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(['user-1/wear-1/uuid-1.webp', 'user-1/wear-1/uuid-1_thumb.webp']);
  });

  it('rolls back when the wear is gone and the update matches no row', async () => {
    const { remove } = mockStorage();
    mockRowUpdate({ data: [], error: null });

    await expect(saveWearPhoto('user-1', { id: 'wear-1', photo: null }, SOURCE)).rejects.toThrow();

    expect(remove).toHaveBeenCalledWith(['user-1/wear-1/uuid-1.webp', 'user-1/wear-1/uuid-1_thumb.webp']);
  });

  it('removes the full photo when the thumbnail upload fails, and never touches the row', async () => {
    const { remove } = mockStorage({
      upload: (path) => ({ error: path.endsWith('_thumb.webp') ? new Error('boom') : null }),
    });
    const { update } = mockRowUpdate();

    await expect(saveWearPhoto('user-1', { id: 'wear-1', photo: null }, SOURCE)).rejects.toThrow('boom');

    expect(remove).toHaveBeenCalledWith(['user-1/wear-1/uuid-1.webp']);
    expect(update).not.toHaveBeenCalled();
  });

  it('classifies an offline upload as no connection, with nothing uploaded or changed', async () => {
    const { remove } = mockStorage({ upload: () => ({ error: offline() }) });
    const { update } = mockRowUpdate();

    await expect(saveWearPhoto('user-1', { id: 'wear-1', photo: OLD_PHOTO }, SOURCE)).rejects.toMatchObject({
      name: 'FitError',
      kind: 'no_connection',
    });
    expect(update).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalledWith([OLD_PHOTO.path, OLD_PHOTO.thumbPath]);
  });

  it('classifies an offline row update as no connection', async () => {
    mockStorage();
    mockRowUpdate({ data: null, error: offline() });

    await expect(saveWearPhoto('user-1', { id: 'wear-1', photo: null }, SOURCE)).rejects.toMatchObject({
      kind: 'no_connection',
    });
  });
});

describe('removeWearPhoto', () => {
  it('clears the row first, then deletes both files', async () => {
    mockStorage();
    const { update, eq } = mockRowUpdate();

    await removeWearPhoto({ id: 'wear-1', photo: OLD_PHOTO });

    expect(update).toHaveBeenCalledWith({ photo_path: null, photo_thumb_path: null, photo_thumbhash: null });
    expect(eq).toHaveBeenCalledWith('id', 'wear-1');
    expect(calls).toEqual(['update row', `remove ${OLD_PHOTO.path},${OLD_PHOTO.thumbPath}`]);
  });

  it('keeps the files when the row update fails offline', async () => {
    const { remove } = mockStorage();
    mockRowUpdate({ data: null, error: offline() });

    await expect(removeWearPhoto({ id: 'wear-1', photo: OLD_PHOTO })).rejects.toMatchObject({ kind: 'no_connection' });
    expect(remove).not.toHaveBeenCalled();
  });

  it('does nothing for a wear with no photo', async () => {
    mockStorage();
    const { update } = mockRowUpdate();

    await removeWearPhoto({ id: 'wear-1', photo: null });

    expect(update).not.toHaveBeenCalled();
  });
});

describe('deleteWearPhotoFiles', () => {
  it('deletes the given files', async () => {
    const { remove } = mockStorage();

    await deleteWearPhotoFiles(['a.webp', 'a_thumb.webp']);

    expect(remove).toHaveBeenCalledWith(['a.webp', 'a_thumb.webp']);
  });

  it('skips the call when there is nothing to delete', async () => {
    const { remove } = mockStorage();

    await deleteWearPhotoFiles([]);

    expect(remove).not.toHaveBeenCalled();
  });

  it('never throws, reporting a failure to Sentry instead', async () => {
    const { remove } = mockStorage();
    remove.mockRejectedValue(new Error('storage down'));

    await expect(deleteWearPhotoFiles(['a.webp'])).resolves.toBeUndefined();
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});

describe('useWearPhotoUrls', () => {
  let queryClient: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  });

  it('signs exactly the paths it is given, in one request to the wear-photos bucket', async () => {
    const { createSignedUrls } = mockStorage();
    createSignedUrls.mockResolvedValue({
      data: [
        { path: 'b_thumb.webp', signedUrl: 'https://signed/b', error: null },
        { path: 'a_thumb.webp', signedUrl: null, error: 'missing' },
      ],
      error: null,
    });

    const { result } = await renderHook(() => useWearPhotoUrls(['b_thumb.webp', 'a_thumb.webp']), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(supabase.storage.from).toHaveBeenCalledWith('wear-photos');
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
    expect(createSignedUrls).toHaveBeenCalledWith(['b_thumb.webp', 'a_thumb.webp'], expect.any(Number));
    expect(result.current.data).toEqual({ 'b_thumb.webp': 'https://signed/b', 'a_thumb.webp': null });
    // Keyed by the sorted set, so the same paths in another order share it.
    expect(queryClient.getQueryData(['wearPhotoUrls', ['a_thumb.webp', 'b_thumb.webp']])).toBeDefined();
  });

  it('makes no request with no paths', async () => {
    mockStorage();

    await renderHook(() => useWearPhotoUrls([]), { wrapper });

    expect(supabase.storage.from).not.toHaveBeenCalled();
  });
});
