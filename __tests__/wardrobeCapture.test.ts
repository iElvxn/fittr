let mockUuidCounter = 0;
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => `uuid-${++mockUuidCounter}`),
}));

import { useWardrobeCaptureStore } from '@/stores/wardrobeCapture';

function getState() {
  return useWardrobeCaptureStore.getState();
}

beforeEach(() => {
  mockUuidCounter = 0;
  getState().reset();
});

describe('addCaptured', () => {
  it('appends a new item in "processing" status and returns its id', () => {
    const id = getState().addCaptured('camera', 'file://photo-1.jpg');

    expect(id).toBe('uuid-1');
    expect(getState().items).toEqual([
      expect.objectContaining({
        id: 'uuid-1',
        source: 'camera',
        photoUri: 'file://photo-1.jpg',
        status: 'processing',
        cutoutUri: null,
        thumbUri: null,
        itemId: null,
        category: 'top',
        colorHex: null,
        name: '',
        brand: '',
        notes: '',
        expanded: false,
      }),
    ]);
  });

  it('appends subsequent items after existing ones, preserving order', () => {
    getState().addCaptured('library', 'file://photo-1.jpg');
    getState().addCaptured('library', 'file://photo-2.jpg');

    expect(getState().items.map((item) => item.photoUri)).toEqual(['file://photo-1.jpg', 'file://photo-2.jpg']);
  });
});

describe('setItemProcessed', () => {
  it('marks only the matching item ready, with a freshly generated itemId', () => {
    const id1 = getState().addCaptured('camera', 'file://photo-1.jpg');
    const id2 = getState().addCaptured('camera', 'file://photo-2.jpg');

    getState().setItemProcessed(id1, { cutoutUri: 'file://cutout-1.png', thumbUri: 'file://thumb-1.webp', colorHex: '#112233' });

    const [item1, item2] = getState().items;
    expect(item1).toMatchObject({
      id: id1,
      status: 'ready',
      cutoutUri: 'file://cutout-1.png',
      thumbUri: 'file://thumb-1.webp',
      colorHex: '#112233',
      itemId: 'uuid-3',
    });
    expect(item2).toMatchObject({ id: id2, status: 'processing' });
  });
});

describe('setItemProcessingFailed', () => {
  it('marks only the matching item errored, clearing any cutout/thumb', () => {
    const id = getState().addCaptured('camera', 'file://photo-1.jpg');

    getState().setItemProcessingFailed(id, "Couldn't find your item in that photo.");

    expect(getState().items[0]).toMatchObject({
      status: 'error',
      errorMessage: "Couldn't find your item in that photo.",
      cutoutUri: null,
      thumbUri: null,
    });
  });
});

describe('replaceItemPhoto', () => {
  it('resets a ready item back to processing with the new photo, discarding its old cutout/itemId', () => {
    const id = getState().addCaptured('camera', 'file://photo-1.jpg');
    getState().setItemProcessed(id, { cutoutUri: 'file://cutout-1.png', thumbUri: 'file://thumb-1.webp', colorHex: '#000000' });

    getState().replaceItemPhoto(id, 'file://photo-1-retake.jpg');

    expect(getState().items[0]).toMatchObject({
      photoUri: 'file://photo-1-retake.jpg',
      status: 'processing',
      cutoutUri: null,
      thumbUri: null,
      itemId: null,
      errorMessage: null,
    });
  });

  it('leaves other items untouched', () => {
    const id1 = getState().addCaptured('camera', 'file://photo-1.jpg');
    const id2 = getState().addCaptured('camera', 'file://photo-2.jpg');
    getState().setItemProcessed(id2, { cutoutUri: 'file://cutout-2.png', thumbUri: 'file://thumb-2.webp', colorHex: '#abcdef' });

    getState().replaceItemPhoto(id1, 'file://photo-1-retake.jpg');

    expect(getState().items[1]).toMatchObject({ id: id2, status: 'ready', cutoutUri: 'file://cutout-2.png' });
  });
});

describe('per-item field setters', () => {
  it('setItemCategory/setItemColorHex/setItemName/setItemBrand/setItemNotes update only the matching item', () => {
    const id1 = getState().addCaptured('camera', 'file://photo-1.jpg');
    const id2 = getState().addCaptured('camera', 'file://photo-2.jpg');

    getState().setItemCategory(id1, 'shoes');
    getState().setItemColorHex(id1, '#ffffff');
    getState().setItemName(id1, 'Sneakers');
    getState().setItemBrand(id1, 'Acme');
    getState().setItemNotes(id1, 'Worn once');

    expect(getState().items[0]).toMatchObject({
      category: 'shoes',
      colorHex: '#ffffff',
      name: 'Sneakers',
      brand: 'Acme',
      notes: 'Worn once',
    });
    expect(getState().items[1]).toMatchObject({ category: 'top', colorHex: null, name: '', brand: '', notes: '' });
  });
});

describe('toggleExpanded', () => {
  it('flips only the matching item\'s expanded flag', () => {
    const id1 = getState().addCaptured('camera', 'file://photo-1.jpg');
    const id2 = getState().addCaptured('camera', 'file://photo-2.jpg');

    getState().toggleExpanded(id1);

    expect(getState().items[0].expanded).toBe(true);
    expect(getState().items[1].expanded).toBe(false);

    getState().toggleExpanded(id1);
    expect(getState().items[0].expanded).toBe(false);
  });
});

describe('removeItem', () => {
  it('drops only the matching item, leaving the rest in order', () => {
    const id1 = getState().addCaptured('camera', 'file://photo-1.jpg');
    const id2 = getState().addCaptured('camera', 'file://photo-2.jpg');
    const id3 = getState().addCaptured('camera', 'file://photo-3.jpg');

    getState().removeItem(id2);

    expect(getState().items.map((item) => item.id)).toEqual([id1, id3]);
  });

  it('results in an empty batch when the only item is removed', () => {
    const id = getState().addCaptured('camera', 'file://photo-1.jpg');

    getState().removeItem(id);

    expect(getState().items).toEqual([]);
  });
});

describe('reset', () => {
  it('clears all items back to an empty batch', () => {
    getState().addCaptured('camera', 'file://photo-1.jpg');
    getState().addCaptured('camera', 'file://photo-2.jpg');

    getState().reset();

    expect(getState().items).toEqual([]);
  });
});
