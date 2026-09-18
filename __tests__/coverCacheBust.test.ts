import { cacheBustedCoverUrl } from '@/lib/fits/coverCacheBust';

describe('cacheBustedCoverUrl', () => {
  it('appends a version param with & when the URL already has a query string', () => {
    const result = cacheBustedCoverUrl('https://example.com/cover.png?token=abc', '2026-09-18T00:00:00.000Z');

    expect(result).toBe('https://example.com/cover.png?token=abc&v=2026-09-18T00%3A00%3A00.000Z');
  });

  it('appends a version param with ? when the URL has no query string', () => {
    const result = cacheBustedCoverUrl('https://example.com/cover.png', '2026-09-18T00:00:00.000Z');

    expect(result).toBe('https://example.com/cover.png?v=2026-09-18T00%3A00%3A00.000Z');
  });

  it('produces a different URL for a different updated_at, so caches keyed by URL treat it as new content', () => {
    const before = cacheBustedCoverUrl('https://example.com/cover.png?token=abc', '2026-09-18T00:00:00.000Z');
    const after = cacheBustedCoverUrl('https://example.com/cover.png?token=abc', '2026-09-18T00:05:00.000Z');

    expect(before).not.toBe(after);
  });
});
