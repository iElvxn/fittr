import { render, screen } from '@testing-library/react-native';

import { StorageImage } from '@/components/ui/StorageImage';

const PATH = 'user-1/items/item-1/thumb.webp';

/** expo-image normalizes `source` into an array on its native view, same as `home.test.tsx`. */
function imageProp(element: { props: Record<string, unknown> }, name: 'source' | 'placeholder') {
  const value = element.props[name];
  return (Array.isArray(value) ? value[0] : value) as Record<string, string> | undefined;
}

describe('StorageImage', () => {
  it('caches by storage path, in memory and on disk', async () => {
    await render(<StorageImage testID="img" path={PATH} url="https://signed.example/thumb?token=a" />);

    const image = screen.getByTestId('img');
    expect(imageProp(image, 'source')).toEqual({ uri: 'https://signed.example/thumb?token=a', cacheKey: PATH });
    expect(image.props.cachePolicy).toBe('memory-disk');
  });

  it('keeps the same cache key when the same path is re-signed with a new token', async () => {
    const { rerender } = await render(
      <StorageImage testID="img" path={PATH} url="https://signed.example/thumb?token=a" />,
    );
    const first = imageProp(screen.getByTestId('img'), 'source');

    await rerender(<StorageImage testID="img" path={PATH} url="https://signed.example/thumb?token=b" />);
    const second = imageProp(screen.getByTestId('img'), 'source');

    expect(second?.uri).toBe('https://signed.example/thumb?token=b');
    expect(second?.cacheKey).toBe(first?.cacheKey);
    expect(second?.cacheKey).toBe(PATH);
  });

  it('gives a new path its own cache key', async () => {
    const { rerender } = await render(<StorageImage testID="img" path={PATH} url="https://signed.example/a" />);

    await rerender(<StorageImage testID="img" path="user-1/items/item-2/thumb.webp" url="https://signed.example/b" />);

    expect(imageProp(screen.getByTestId('img'), 'source')?.cacheKey).toBe('user-1/items/item-2/thumb.webp');
  });

  it('defaults recyclingKey to the path, so a recycled cell never shows the previous file', async () => {
    await render(<StorageImage testID="img" path={PATH} url="https://signed.example/a" />);

    expect(screen.getByTestId('img').props.recyclingKey).toBe(PATH);
  });

  it('takes a recyclingKey override', async () => {
    await render(<StorageImage testID="img" path={PATH} url="https://signed.example/a" recyclingKey="2026-09-28" />);

    expect(screen.getByTestId('img').props.recyclingKey).toBe('2026-09-28');
  });

  it.each([null, undefined])('passes no source while the url is %s', async (url) => {
    await render(<StorageImage testID="img" path={PATH} url={url} />);

    expect(imageProp(screen.getByTestId('img'), 'source')?.uri).toBeUndefined();
  });

  it('passes display and accessibility props through unchanged', async () => {
    await render(
      <StorageImage
        testID="img"
        path={PATH}
        url="https://signed.example/a"
        contentFit="contain"
        transition={200}
        accessibilityLabel="Black blazer"
      />,
    );

    const image = screen.getByTestId('img');
    expect(image.props.contentFit).toBe('contain');
    expect(image.props.transition).toMatchObject({ duration: 200 });
    expect(screen.getByLabelText('Black blazer')).toBeTruthy();
  });
});
