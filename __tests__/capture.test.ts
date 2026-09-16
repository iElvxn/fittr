jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
}));

import * as ImagePicker from 'expo-image-picker';
import { pickFromLibrary } from '@/lib/wardrobe/capture';

const launchImageLibraryAsync = ImagePicker.launchImageLibraryAsync as jest.Mock;

describe('pickFromLibrary', () => {
  it('requests multi-select, no aspect lock', async () => {
    launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [{ uri: 'file://one.jpg' }] });

    await pickFromLibrary();

    expect(launchImageLibraryAsync).toHaveBeenCalledWith(
      expect.objectContaining({ allowsMultipleSelection: true, allowsEditing: false }),
    );
  });

  it('returns every picked uri, in order, for a multi-photo pick', async () => {
    launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://one.jpg' }, { uri: 'file://two.jpg' }, { uri: 'file://three.jpg' }],
    });

    await expect(pickFromLibrary()).resolves.toEqual({
      uris: ['file://one.jpg', 'file://two.jpg', 'file://three.jpg'],
    });
  });

  it('returns a single uri array when exactly one photo is picked', async () => {
    launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [{ uri: 'file://one.jpg' }] });

    await expect(pickFromLibrary()).resolves.toEqual({ uris: ['file://one.jpg'] });
  });

  it('returns cancelled when the user backs out', async () => {
    launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null });

    await expect(pickFromLibrary()).resolves.toEqual({ cancelled: true });
  });

  it('requests single-select when allowsMultipleSelection is passed as false', async () => {
    launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [{ uri: 'file://one.jpg' }] });

    await pickFromLibrary({ allowsMultipleSelection: false });

    expect(launchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({ allowsMultipleSelection: false }));
  });
});
