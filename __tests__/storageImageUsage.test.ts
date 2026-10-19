/**
 * Node's `fs`/`path`, typed locally: this project's tsconfig scopes `types`
 * to `jest` only (see `supabase/tests/rls.test.ts`), so Node's own
 * declarations aren't available to import.
 */
type DirEntry = { name: string; isDirectory(): boolean };
const fs = jest.requireActual('fs') as {
  readdirSync(dir: string, options: { withFileTypes: true }): DirEntry[];
  readFileSync(file: string, encoding: 'utf8'): string;
};
const path = jest.requireActual('path') as {
  resolve(...segments: string[]): string;
  join(...segments: string[]): string;
};
declare const __dirname: string;

/**
 * Story 6.1: every Storage image renders through `StorageImage`, cached by
 * its path. A raw `source={{ uri }}` would cache under the signed URL, whose
 * token changes, and download the same file again. Only local files
 * (captures, the collage preview, a just-picked avatar) may use one.
 */
const LOCAL_URI_FILES = new Set([
  'app/onboarding.tsx',
  'app/profile.tsx',
  'components/fitBuilder/SaveFitSheet.tsx',
  'components/fits/WearPhotoImage.tsx',
  'components/wardrobe/BatchQueueRow.tsx',
  'components/wardrobe/CameraFilmstrip.tsx',
]);

const ROOT = path.resolve(__dirname, '..');
// `uri: expr` or the `{ uri }` shorthand; the shorthand is reported as `uri`.
const RAW_URI_SOURCE = /source=\{\s*\{\s*uri\b(?:\s*:\s*([\w.?]+))?/g;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const relative = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      return sourceFiles(relative);
    }
    return /\.tsx?$/.test(entry.name) ? [relative] : [];
  });
}

function rawUriSources(file: string) {
  const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  return [...text.matchAll(RAW_URI_SOURCE)].map((match) => match[1] ?? 'uri');
}

describe('Storage images are cached by path', () => {
  it('recognizes both the `uri: expr` and the `{ uri }` shorthand forms', () => {
    const matches = (text: string) => [...text.matchAll(RAW_URI_SOURCE)].map((match) => match[1] ?? 'uri');

    expect(matches('<Image source={{ uri: signedUrl }} />')).toEqual(['signedUrl']);
    expect(matches('<Image source={{ uri }} />')).toEqual(['uri']);
    expect(matches('<Image source={{uri:item.url}} />')).toEqual(['item.url']);
    expect(matches('<StorageImage path={p} url={u} />')).toEqual([]);
  });

  it('only local-file images use a raw uri source', () => {
    const offenders = [...sourceFiles('app'), ...sourceFiles('components')].filter(
      (file) => !LOCAL_URI_FILES.has(file) && rawUriSources(file).length > 0,
    );

    expect(offenders).toEqual([]);
  });

  it("profile's raw uri source is only the just-picked local avatar", () => {
    expect(rawUriSources('app/profile.tsx')).toEqual(['pickedAvatarUri']);
  });

  it("WearPhotoImage's raw uri source is only the just-picked local photo", () => {
    expect(rawUriSources('components/fits/WearPhotoImage.tsx')).toEqual(['localUri']);
  });
});
