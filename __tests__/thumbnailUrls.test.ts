jest.mock('@/lib/supabase', () => ({ supabase: { storage: { from: jest.fn() } } }));

import { toThumbnailUrlMap } from '@/lib/wardrobe/thumbnailUrls';

describe('toThumbnailUrlMap', () => {
  it('maps each path to its signed URL on success', () => {
    const result = toThumbnailUrlMap([
      { path: 'user-1/items/a/thumb.webp', error: null, signedUrl: 'https://example.com/a' },
      { path: 'user-1/items/b/thumb.webp', error: null, signedUrl: 'https://example.com/b' },
    ]);

    expect(result).toEqual({
      'user-1/items/a/thumb.webp': 'https://example.com/a',
      'user-1/items/b/thumb.webp': 'https://example.com/b',
    });
  });

  it('maps a per-path failure to null instead of dropping the whole batch', () => {
    const result = toThumbnailUrlMap([
      { path: 'user-1/items/a/thumb.webp', error: null, signedUrl: 'https://example.com/a' },
      { path: 'user-1/items/b/thumb.webp', error: 'Object not found', signedUrl: '' },
    ]);

    expect(result).toEqual({
      'user-1/items/a/thumb.webp': 'https://example.com/a',
      'user-1/items/b/thumb.webp': null,
    });
  });

  it('skips entries with a null path', () => {
    const result = toThumbnailUrlMap([{ path: null, error: 'Object not found', signedUrl: '' }]);

    expect(result).toEqual({});
  });
});
