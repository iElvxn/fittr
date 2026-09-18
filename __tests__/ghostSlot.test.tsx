import { render, screen, userEvent } from '@testing-library/react-native';
import { processColor } from 'react-native';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

import { GhostSlot } from '@/components/fitBuilder/GhostSlot';

type SilhouetteProps = { tintColor?: string | number; style?: { opacity?: number } };

/** No type-based query in this RNTL version -- walks the rendered JSON tree for the tinted silhouette image's own props. */
function findSilhouetteProps(node: unknown): SilhouetteProps | undefined {
  if (!node) {
    return undefined;
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findSilhouetteProps(child);
      if (found) {
        return found;
      }
    }
    return undefined;
  }
  const element = node as { props?: SilhouetteProps; children?: unknown };
  if (element.props?.tintColor) {
    return element.props;
  }
  return findSilhouetteProps(element.children);
}

describe('GhostSlot', () => {
  it('renders as an accessible button labeled with its category', async () => {
    await render(
      <GhostSlot category="top" containerWidth={300} containerHeight={400} x={0.5} y={0.3} onPress={jest.fn()} />,
    );

    expect(screen.getByRole('button', { name: 'Add Top' })).toBeTruthy();
  });

  it('calls onPress when tapped', async () => {
    const onPress = jest.fn();
    const user = userEvent.setup();
    await render(
      <GhostSlot category="shoes" containerWidth={300} containerHeight={400} x={0.5} y={0.3} onPress={onPress} />,
    );

    await user.press(screen.getByRole('button', { name: 'Add Shoes' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('still renders the category label text beneath the badge', async () => {
    await render(
      <GhostSlot category="outerwear" containerWidth={300} containerHeight={400} x={0.5} y={0.3} onPress={jest.fn()} />,
    );

    expect(screen.getByText('Outerwear')).toBeTruthy();
  });

  it('renders as a plain, non-interactive badge when onPress is omitted (template-preview usage)', async () => {
    await render(<GhostSlot category="top" containerWidth={300} containerHeight={400} x={0.5} y={0.3} />);

    expect(screen.getByText('Top')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('tints the silhouette white and more opaque (not the near-white-calibrated hairline) when the canvas has a custom background', async () => {
    const { toJSON } = await render(
      <GhostSlot
        category="top"
        containerWidth={300}
        containerHeight={400}
        x={0.5}
        y={0.3}
        width={0.3}
        height={0.3}
        canvasBackgroundColor="#F6DADA"
      />,
    );

    const silhouetteProps = findSilhouetteProps(toJSON());
    // The Image mock serializes `tintColor` through RN's native color processing
    // (a packed int), not the raw hex string, so the expectation goes through
    // the same `processColor` to compare like with like.
    expect(silhouetteProps?.tintColor).toBe(processColor('#FFFFFF'));
    expect(silhouetteProps?.style?.opacity).toBe(0.75);
  });
});
