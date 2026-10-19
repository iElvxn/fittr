import { StyleSheet } from 'react-native';
import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

import {
  ClosetTile,
  CATEGORY_DEFAULT_ASPECT,
  TILE_PADDING,
  clampAspect,
  closetTileHeight,
  isSignedUrlFor,
  resetMeasuredAspectCache,
} from '@/components/wardrobe/ClosetTile';
import { typeScale } from '@/lib/theme/fonts';

const WIDTH = 110;

/** Shaped like a Supabase signed link: the object path is in the URL, the token changes on every re-sign. */
function signedUrl(path: string, token: string) {
  return `https://project.supabase.co/storage/v1/object/sign/wardrobe/${path}?token=${token}`;
}

/** expo-image normalizes `source` into an array on its native view. */
function imageSource() {
  const source = screen.getByTestId('wardrobe-thumbnail-image').props.source;
  return Array.isArray(source) ? source[0] : source;
}

function wellHeight() {
  return StyleSheet.flatten(screen.getByTestId('closet-tile-well').props.style).height;
}

describe('ClosetTile', () => {
  beforeEach(() => {
    resetMeasuredAspectCache();
  });

  describe('text lines', () => {
    it('shows the name on line 1 and the brand on line 2', async () => {
      await render(
        <ClosetTile category="outerwear" name="Camel coat" brand="Toteme" thumbPath="user-1/items/x/thumb.webp" thumbnailUrl="https://x/a.webp" width={WIDTH} onPress={jest.fn()} />,
      );

      const name = screen.getByText('Camel coat');
      const brand = screen.getByText('Toteme');
      expect(StyleSheet.flatten(name.props.style).fontFamily).toBe(typeScale.meta.fontFamily);
      expect(name.props.className).toContain('text-ink-primary');
      expect(name.props.numberOfLines).toBe(1);
      expect(StyleSheet.flatten(brand.props.style).fontFamily).toBe(typeScale.caption.fontFamily);
      expect(brand.props.className).toContain('text-ink-secondary');
      expect(brand.props.numberOfLines).toBe(1);
    });

    it('falls back to the category on line 2 when there is no brand', async () => {
      await render(
        <ClosetTile category="shoes" name="Loafers" brand={null} thumbPath="user-1/items/x/thumb.webp" thumbnailUrl={null} width={WIDTH} onPress={jest.fn()} />,
      );

      expect(screen.getByText('Loafers')).toBeTruthy();
      expect(screen.getByText('Shoes')).toBeTruthy();
    });

    it('uses the category label on line 1 when there is no name', async () => {
      await render(
        <ClosetTile category="top" name={null} brand="COS" thumbPath="user-1/items/x/thumb.webp" thumbnailUrl={null} width={WIDTH} onPress={jest.fn()} />,
      );

      expect(screen.getByText('Top')).toBeTruthy();
      expect(screen.getByText('COS')).toBeTruthy();
    });

    it('never repeats the category when there is neither name nor brand', async () => {
      await render(
        <ClosetTile category="bottom" name={null} brand={null} thumbPath="user-1/items/x/thumb.webp" thumbnailUrl={null} width={WIDTH} onPress={jest.fn()} />,
      );

      expect(screen.getAllByText('Bottom')).toHaveLength(1);
    });

    it('treats whitespace-only name and brand as missing', async () => {
      await render(
        <ClosetTile category="bottom" name="  " brand=" " thumbPath="user-1/items/x/thumb.webp" thumbnailUrl={null} width={WIDTH} onPress={jest.fn()} />,
      );

      expect(screen.getAllByText('Bottom')).toHaveLength(1);
    });
  });

  describe('accessibility label', () => {
    it('reads "name, brand, category"', async () => {
      await render(
        <ClosetTile category="outerwear" name="Camel coat" brand="Toteme" thumbPath="user-1/items/x/thumb.webp" thumbnailUrl={null} width={WIDTH} onPress={jest.fn()} />,
      );

      expect(screen.getByRole('button', { name: 'Camel coat, Toteme, Outerwear' })).toBeTruthy();
    });

    it('skips missing parts', async () => {
      await render(
        <>
          <ClosetTile category="shoes" name="Loafers" brand={null} thumbPath="user-1/items/x/thumb.webp" thumbnailUrl={null} width={WIDTH} onPress={jest.fn()} />
          <ClosetTile category="top" name={null} brand="COS" thumbPath="user-1/items/x/thumb.webp" thumbnailUrl={null} width={WIDTH} onPress={jest.fn()} />
          <ClosetTile category="bottom" name={null} brand={null} thumbPath="user-1/items/x/thumb.webp" thumbnailUrl={null} width={WIDTH} onPress={jest.fn()} />
        </>,
      );

      expect(screen.getByLabelText('Loafers, Shoes')).toBeTruthy();
      expect(screen.getByLabelText('COS, Top')).toBeTruthy();
      expect(screen.getByLabelText('Bottom')).toBeTruthy();
    });

    it('calls onPress when tapped', async () => {
      const onPress = jest.fn();
      const user = userEvent.setup();
      await render(
        <ClosetTile category="shoes" name="Loafers" brand={null} thumbPath="user-1/items/x/thumb.webp" thumbnailUrl={null} width={WIDTH} onPress={onPress} />,
      );

      await user.press(screen.getByLabelText('Loafers, Shoes'));

      expect(onPress).toHaveBeenCalled();
    });
  });

  describe('thumbnail', () => {
    it('shows a placeholder, not an image, when the URL is missing', async () => {
      await render(
        <ClosetTile category="bottom" name={null} brand={null} thumbPath="user-1/items/x/thumb.webp" thumbnailUrl={null} width={WIDTH} onPress={jest.fn()} />,
      );

      expect(screen.getByTestId('wardrobe-thumbnail-fallback')).toBeTruthy();
      expect(screen.queryByTestId('wardrobe-thumbnail-image')).toBeNull();
      expect(wellHeight()).toBeCloseTo(closetTileHeight(WIDTH, CATEGORY_DEFAULT_ASPECT.bottom));
    });

    it('sits on the surface-tile photo well with soft corners', async () => {
      await render(
        <ClosetTile category="top" name={null} brand={null} thumbPath="user-1/items/x/thumb.webp" thumbnailUrl="https://x/a.webp" width={WIDTH} onPress={jest.fn()} />,
      );

      const wellClass = screen.getByTestId('closet-tile-well').props.className;
      expect(wellClass).toContain('bg-surface-tile');
      expect(wellClass).toContain('dark:bg-surface-tileDark');
      expect(wellClass).toContain('rounded-lg');
      expect(screen.getByTestId('wardrobe-thumbnail-image').props.contentFit).toBe('contain');
    });
  });

  describe('measured height', () => {
    it('starts at the category default aspect ratio', async () => {
      await render(
        <ClosetTile category="shoes" name={null} brand={null} thumbPath="user-1/items/x/thumb.webp" thumbnailUrl="https://x/shoe.webp" width={WIDTH} onPress={jest.fn()} />,
      );

      expect(CATEGORY_DEFAULT_ASPECT).toEqual({ outerwear: 0.75, top: 0.85, bottom: 0.6, shoes: 1.4, accessory: 1.0 });
      expect(wellHeight()).toBeCloseTo(closetTileHeight(WIDTH, 1.4));
    });

    it("snaps to the thumbnail's real aspect ratio once it loads", async () => {
      await render(
        <ClosetTile category="shoes" name={null} brand={null} thumbPath="user-1/items/x/thumb.webp" thumbnailUrl="https://x/shoe.webp" width={WIDTH} onPress={jest.fn()} />,
      );

      await fireEvent(screen.getByTestId('wardrobe-thumbnail-image'), 'load', { nativeEvent: { source: { width: 300, height: 400 } } });

      expect(wellHeight()).toBeCloseTo(closetTileHeight(WIDTH, 0.75));
    });

    it('clamps extreme shapes', async () => {
      await render(
        <ClosetTile category="top" name="Tall" brand={null} thumbPath="user-1/items/x/thumb.webp" thumbnailUrl="https://x/tall.webp" width={WIDTH} onPress={jest.fn()} />,
      );

      await fireEvent(screen.getByTestId('wardrobe-thumbnail-image'), 'load', { nativeEvent: { source: { width: 100, height: 1000 } } });

      expect(wellHeight()).toBeCloseTo(closetTileHeight(WIDTH, 0.5));
      expect(clampAspect(0.1)).toBe(0.5);
      expect(clampAspect(5)).toBe(1.6);
      expect(clampAspect(1.2)).toBe(1.2);
    });

    it('reuses a cached measurement for the same URL on remount', async () => {
      const first = await render(
        <ClosetTile category="shoes" name={null} brand={null} thumbPath="user-1/items/x/thumb.webp" thumbnailUrl="https://x/cached.webp" width={WIDTH} onPress={jest.fn()} />,
      );
      await fireEvent(screen.getByTestId('wardrobe-thumbnail-image'), 'load', { nativeEvent: { source: { width: 200, height: 200 } } });
      await first.unmount();

      await render(
        <ClosetTile category="shoes" name={null} brand={null} thumbPath="user-1/items/x/thumb.webp" thumbnailUrl="https://x/cached.webp" width={WIDTH} onPress={jest.fn()} />,
      );

      expect(wellHeight()).toBeCloseTo(closetTileHeight(WIDTH, 1));
    });

    it('drops the previous measurement when a recycled tile gets a different item', async () => {
      const view = await render(
        <ClosetTile category="top" name={null} brand={null} thumbPath="user-1/items/a/thumb.webp" thumbnailUrl={signedUrl('user-1/items/a/thumb.webp', '1')} width={WIDTH} onPress={jest.fn()} />,
      );
      await fireEvent(screen.getByTestId('wardrobe-thumbnail-image'), 'load', {
        nativeEvent: { source: { url: signedUrl('user-1/items/a/thumb.webp', '1'), width: 200, height: 200 } },
      });
      expect(wellHeight()).toBeCloseTo(closetTileHeight(WIDTH, 1));

      await view.rerender(
        <ClosetTile category="shoes" name={null} brand={null} thumbPath="user-1/items/b/thumb.webp" thumbnailUrl={signedUrl('user-1/items/b/thumb.webp', '1')} width={WIDTH} onPress={jest.fn()} />,
      );

      expect(wellHeight()).toBeCloseTo(closetTileHeight(WIDTH, CATEGORY_DEFAULT_ASPECT.shoes));
    });

    it("ignores a late load from the recycled tile's previous image", async () => {
      await render(
        <ClosetTile category="shoes" name={null} brand={null} thumbPath="user-1/items/b/thumb.webp" thumbnailUrl={signedUrl('user-1/items/b/thumb.webp', '1')} width={WIDTH} onPress={jest.fn()} />,
      );

      await fireEvent(screen.getByTestId('wardrobe-thumbnail-image'), 'load', {
        nativeEvent: { source: { url: signedUrl('user-1/items/a/thumb.webp', '1'), width: 200, height: 200 } },
      });

      expect(wellHeight()).toBeCloseTo(closetTileHeight(WIDTH, CATEGORY_DEFAULT_ASPECT.shoes));
    });

    it('measures a cache hit that reports the older signed URL the file was first stored under', async () => {
      await render(
        <ClosetTile category="shoes" name={null} brand={null} thumbPath="user-1/items/a/thumb.webp" thumbnailUrl={signedUrl('user-1/items/a/thumb.webp', 'new')} width={WIDTH} onPress={jest.fn()} />,
      );

      await fireEvent(screen.getByTestId('wardrobe-thumbnail-image'), 'load', {
        nativeEvent: { source: { url: signedUrl('user-1/items/a/thumb.webp', 'old'), width: 300, height: 400 } },
      });

      expect(wellHeight()).toBeCloseTo(closetTileHeight(WIDTH, 0.75));
    });

    it('keeps the measured height when the same path gets a newly signed URL', async () => {
      const view = await render(
        <ClosetTile category="shoes" name={null} brand={null} thumbPath="user-1/items/a/thumb.webp" thumbnailUrl={signedUrl('user-1/items/a/thumb.webp', '1')} width={WIDTH} onPress={jest.fn()} />,
      );
      await fireEvent(screen.getByTestId('wardrobe-thumbnail-image'), 'load', {
        nativeEvent: { source: { url: signedUrl('user-1/items/a/thumb.webp', '1'), width: 300, height: 400 } },
      });

      await view.rerender(
        <ClosetTile category="shoes" name={null} brand={null} thumbPath="user-1/items/a/thumb.webp" thumbnailUrl={signedUrl('user-1/items/a/thumb.webp', '2')} width={WIDTH} onPress={jest.fn()} />,
      );

      expect(wellHeight()).toBeCloseTo(closetTileHeight(WIDTH, 0.75));
    });

    it('sizes the well so the inset cutout keeps its aspect ratio', () => {
      expect(closetTileHeight(WIDTH, 1)).toBeCloseTo(WIDTH);
      expect(closetTileHeight(WIDTH, 0.5)).toBeCloseTo((WIDTH - TILE_PADDING * 2) / 0.5 + TILE_PADDING * 2);
    });
  });

  describe('isSignedUrlFor', () => {
    const PATH = 'user-1/items/a/thumb.webp';

    it('matches the same path whatever the token', () => {
      expect(isSignedUrlFor(signedUrl(PATH, 'old'), PATH)).toBe(true);
      expect(isSignedUrlFor(signedUrl(PATH, 'new'), PATH)).toBe(true);
    });

    it("rejects another item's URL, including one whose path merely starts the same", () => {
      expect(isSignedUrlFor(signedUrl('user-1/items/b/thumb.webp', '1'), PATH)).toBe(false);
      expect(isSignedUrlFor(signedUrl('user-1/items/ab/thumb.webp', '1'), 'user-1/items/b/thumb.webp')).toBe(false);
    });

    it('matches a percent-encoded path', () => {
      expect(isSignedUrlFor(signedUrl('user-1/items/a%2Fthumb.webp', '1'), PATH)).toBe(true);
    });

    it('ignores the path when it only appears in the query string', () => {
      expect(isSignedUrlFor(`https://x/other.webp?next=/${PATH}`, PATH)).toBe(false);
    });

    it('fails closed on a URL that cannot be decoded', () => {
      expect(isSignedUrlFor('https://x/%E0%A4%A/thumb.webp', PATH)).toBe(false);
    });
  });

  describe('image caching', () => {
    it('caches the thumbnail by storage path, in memory and on disk', async () => {
      await render(
        <ClosetTile category="top" name={null} brand={null} thumbPath="user-1/items/a/thumb.webp" thumbnailUrl={signedUrl('user-1/items/a/thumb.webp', '1')} width={WIDTH} onPress={jest.fn()} />,
      );

      expect(imageSource()).toEqual({ uri: signedUrl('user-1/items/a/thumb.webp', '1'), cacheKey: 'user-1/items/a/thumb.webp' });
      expect(screen.getByTestId('wardrobe-thumbnail-image').props.cachePolicy).toBe('memory-disk');
    });

    it('recycles by path: stable across a re-sign, new for a different item', async () => {
      const view = await render(
        <ClosetTile category="top" name={null} brand={null} thumbPath="user-1/items/a/thumb.webp" thumbnailUrl={signedUrl('user-1/items/a/thumb.webp', '1')} width={WIDTH} onPress={jest.fn()} />,
      );
      expect(screen.getByTestId('wardrobe-thumbnail-image').props.recyclingKey).toBe('user-1/items/a/thumb.webp');

      await view.rerender(
        <ClosetTile category="top" name={null} brand={null} thumbPath="user-1/items/a/thumb.webp" thumbnailUrl={signedUrl('user-1/items/a/thumb.webp', '2')} width={WIDTH} onPress={jest.fn()} />,
      );
      expect(screen.getByTestId('wardrobe-thumbnail-image').props.recyclingKey).toBe('user-1/items/a/thumb.webp');
      expect(imageSource()?.cacheKey).toBe('user-1/items/a/thumb.webp');

      await view.rerender(
        <ClosetTile category="top" name={null} brand={null} thumbPath="user-1/items/b/thumb.webp" thumbnailUrl={signedUrl('user-1/items/b/thumb.webp', '1')} width={WIDTH} onPress={jest.fn()} />,
      );
      expect(screen.getByTestId('wardrobe-thumbnail-image').props.recyclingKey).toBe('user-1/items/b/thumb.webp');
    });
  });
});
