import { render, screen, fireEvent, userEvent, waitFor, within } from '@testing-library/react-native';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));
// Without this, `addItem`'s real `Crypto.randomUUID()` comes back `undefined`
// under Jest (no native module), so every placed item would share the same
// `undefined` id -- React's "missing key" warning on `items.map`, and a
// correctness landmine for any test asserting on item identity.
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => `uuid-${Math.random()}`) }));
// `CanvasItem` pulls in Reanimated for its drag/pinch/rotate gesture, which
// has no working jest mock under Reanimated v4's worklets split (tracked by
// `CanvasItem` having no tests of its own yet), so it's stubbed here to keep
// the module loadable. Recording the props it's called with (rather than a
// bare `() => null`) lets these tests assert on what `FitCanvas` passes down
// -- e.g. `isSelected` -- without needing the real gesture-driven component.
const mockCanvasItem = jest.fn((_props: Record<string, unknown>) => null);
jest.mock('@/components/fitBuilder/CanvasItem', () => ({
  CanvasItem: (props: Record<string, unknown>) => mockCanvasItem(props),
}));
// `FitCanvas` itself now imports Reanimated directly for `runOnJS` (used by
// its background-deselect gesture) -- the library's own official jest mock
// hits the same broken worklets-split issue as above, so this is a minimal
// hand-rolled stand-in for just the one export this file actually needs.
jest.mock('react-native-reanimated', () => ({ runOnJS: (fn: (...args: unknown[]) => unknown) => fn }));

import { FitCanvas } from '@/components/fitBuilder/FitCanvas';
import { useFitBuilderStore } from '@/stores/fitBuilder';
import { FIT_TEMPLATES } from '@/lib/fitBuilder/templates';

function layout() {
  fireEvent(screen.getByTestId('fit-canvas'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 400 } },
  });
}

function slotIndex(category: string, occurrence = 0) {
  return FIT_TEMPLATES['shorts-and-top']
    .map((slot, index) => ({ slot, index }))
    .filter(({ slot }) => slot.category === category)[occurrence].index;
}

beforeEach(() => {
  useFitBuilderStore.setState({
    templateId: 'shorts-and-top',
    items: [],
    selectedId: null,
    canvasBackgroundColor: null,
  });
});

describe('FitCanvas onSlotPress wiring', () => {
  it("calls onSlotPress with the tapped ghost slot's own index and category", async () => {
    const onSlotPress = jest.fn();
    const user = userEvent.setup();
    await render(<FitCanvas cutoutUrls={{}} wardrobeItemCutoutPaths={{}} onSlotPress={onSlotPress} />);
    layout();

    await user.press(await screen.findByRole('button', { name: 'Add Shoes' }));

    expect(onSlotPress).toHaveBeenCalledWith(slotIndex('shoes'), 'shoes');
  });

  it('gives each distinct slot its own index, not one shared value', async () => {
    const onSlotPress = jest.fn();
    const user = userEvent.setup();
    await render(<FitCanvas cutoutUrls={{}} wardrobeItemCutoutPaths={{}} onSlotPress={onSlotPress} />);
    layout();

    await user.press(await screen.findByRole('button', { name: 'Add Top' }));
    await user.press(screen.getByRole('button', { name: 'Add Bottom' }));

    expect(onSlotPress).toHaveBeenNthCalledWith(1, slotIndex('top'), 'top');
    expect(onSlotPress).toHaveBeenNthCalledWith(2, slotIndex('bottom'), 'bottom');
  });

  it('renders no ghost slots (nothing to press) when there is no template', async () => {
    useFitBuilderStore.setState({ templateId: null, items: [], selectedId: null });
    await render(<FitCanvas cutoutUrls={{}} wardrobeItemCutoutPaths={{}} onSlotPress={jest.fn()} />);
    layout();

    expect(screen.queryByRole('button', { name: /^Add /i })).toBeNull();
  });

  it('hides only the specific accessory ghost that was actually filled, not the first one by template order', async () => {
    const firstAccessoryIndex = slotIndex('accessory', 0);
    const secondAccessoryIndex = slotIndex('accessory', 1);
    // Simulates tapping the *second* accessory ghost and picking something --
    // the store places it at that exact slot index (see fitBuilderStore.test.ts).
    useFitBuilderStore.getState().addItem('wardrobe-item-1', 'accessory', secondAccessoryIndex);
    const onSlotPress = jest.fn();
    const user = userEvent.setup();

    await render(<FitCanvas cutoutUrls={{}} wardrobeItemCutoutPaths={{}} onSlotPress={onSlotPress} />);
    layout();

    // Two accessory ghosts exist; only one is now filled, so exactly one
    // "Add Accessory" badge should remain -- and it must be the genuinely
    // empty first slot, not a ghost still floating over the one just filled.
    const remaining = await screen.findAllByRole('button', { name: 'Add Accessory' });
    expect(remaining).toHaveLength(1);

    await user.press(remaining[0]);

    expect(onSlotPress).toHaveBeenCalledWith(firstAccessoryIndex, 'accessory');
  });
});

describe('FitCanvas background tap', () => {
  // `deselectGesture` is a `Gesture.Tap()` (react-native-gesture-handler),
  // not a plain `Pressable` -- deliberately, since a Pressable ancestor
  // doesn't reliably get its touch claim blocked by a `CanvasItem`
  // descendant's own gesture (see the comment on `deselectGesture` in
  // FitCanvas.tsx for the exact bug this fixed). `userEvent.press` drives
  // RN's Pressable/Touchable interface, not RNGH's native gesture events, so
  // it can't exercise this interaction here -- same category of gap as
  // `CanvasItem`'s untested gestures above. RNGH ships an official
  // `fireGestureHandler` test utility for this, but wiring in its jest setup
  // is a project-wide config change bigger than this fix; verified manually
  // on-device instead.
  it('still opens the catalog sheet when a ghost badge on that same background is tapped', async () => {
    const onSlotPress = jest.fn();
    const user = userEvent.setup();

    await render(<FitCanvas cutoutUrls={{}} wardrobeItemCutoutPaths={{}} onSlotPress={onSlotPress} />);
    layout();

    await user.press(await screen.findByRole('button', { name: 'Add Shoes' }));

    expect(onSlotPress).toHaveBeenCalledWith(slotIndex('shoes'), 'shoes');
  });
});

describe('FitCanvas capture-time chrome exclusion', () => {
  // `app/new-fit.tsx`'s Save flow captures exactly the `fit-canvas` node via
  // `react-native-view-shot` -- a ghost slot rendered *inside* that subtree
  // would get baked into the saved collage for any Fit with an unfilled
  // template slot. Ghosts must render as a sibling overlay instead, so this
  // asserts the structural guarantee directly rather than trusting render
  // order not to regress.
  it('renders ghost slots outside the capturable fit-canvas subtree', async () => {
    await render(<FitCanvas cutoutUrls={{}} wardrobeItemCutoutPaths={{}} onSlotPress={jest.fn()} />);
    layout();

    expect(await screen.findByRole('button', { name: 'Add Shoes' })).toBeTruthy();
    expect(within(screen.getByTestId('fit-canvas')).queryByRole('button', { name: /^Add /i })).toBeNull();
  });

  it('renders the delete button outside the capturable fit-canvas subtree too', async () => {
    useFitBuilderStore.getState().addItem('wardrobe-item-1', 'top');
    const [placed] = useFitBuilderStore.getState().items;
    useFitBuilderStore.getState().selectItem(placed.id);

    await render(<FitCanvas cutoutUrls={{}} wardrobeItemCutoutPaths={{}} onSlotPress={jest.fn()} />);
    layout();

    expect(await screen.findByRole('button', { name: 'Delete item' })).toBeTruthy();
    expect(within(screen.getByTestId('fit-canvas')).queryByRole('button', { name: 'Delete item' })).toBeNull();
  });

  it('hides the delete button while capturing, even with an item selected', async () => {
    useFitBuilderStore.getState().addItem('wardrobe-item-1', 'top');
    const [placed] = useFitBuilderStore.getState().items;
    useFitBuilderStore.getState().selectItem(placed.id);

    await render(<FitCanvas cutoutUrls={{}} wardrobeItemCutoutPaths={{}} onSlotPress={jest.fn()} capturing />);
    layout();

    expect(screen.queryByRole('button', { name: 'Delete item' })).toBeNull();
  });

  it("suppresses the selected item's own outline/shadow while capturing, so it can't end up in the saved cover", async () => {
    useFitBuilderStore.getState().addItem('wardrobe-item-1', 'top');
    const [placed] = useFitBuilderStore.getState().items;
    useFitBuilderStore.getState().selectItem(placed.id);
    mockCanvasItem.mockClear();

    await render(<FitCanvas cutoutUrls={{}} wardrobeItemCutoutPaths={{}} onSlotPress={jest.fn()} capturing />);
    layout();

    await waitFor(() => expect(mockCanvasItem).toHaveBeenCalledWith(expect.objectContaining({ isSelected: false })));
  });

  it('otherwise passes isSelected through normally when not capturing', async () => {
    useFitBuilderStore.getState().addItem('wardrobe-item-1', 'top');
    const [placed] = useFitBuilderStore.getState().items;
    useFitBuilderStore.getState().selectItem(placed.id);
    mockCanvasItem.mockClear();

    await render(<FitCanvas cutoutUrls={{}} wardrobeItemCutoutPaths={{}} onSlotPress={jest.fn()} />);
    layout();

    await waitFor(() => expect(mockCanvasItem).toHaveBeenCalledWith(expect.objectContaining({ isSelected: true })));
  });
});

describe('FitCanvas delete button', () => {
  it('shows no delete button when nothing is selected', async () => {
    await render(<FitCanvas cutoutUrls={{}} wardrobeItemCutoutPaths={{}} onSlotPress={jest.fn()} />);
    layout();

    expect(screen.queryByRole('button', { name: 'Delete item' })).toBeNull();
  });

  it('shows a delete button for the selected item and removes it on tap', async () => {
    useFitBuilderStore.getState().addItem('wardrobe-item-1', 'top');
    const [placed] = useFitBuilderStore.getState().items;
    useFitBuilderStore.getState().selectItem(placed.id);
    const user = userEvent.setup();

    await render(<FitCanvas cutoutUrls={{}} wardrobeItemCutoutPaths={{}} onSlotPress={jest.fn()} />);
    layout();

    await user.press(await screen.findByRole('button', { name: 'Delete item' }));

    expect(useFitBuilderStore.getState().items).toEqual([]);
    expect(useFitBuilderStore.getState().selectedId).toBeNull();
  });
});

describe('FitCanvas custom background color', () => {
  it("paints the canvas card with the store's canvasBackgroundColor when one is set", async () => {
    useFitBuilderStore.setState({ canvasBackgroundColor: '#F6DADA' });
    await render(<FitCanvas cutoutUrls={{}} wardrobeItemCutoutPaths={{}} onSlotPress={jest.fn()} />);
    layout();

    const canvasStyle = screen.getByTestId('fit-canvas').props.style;
    const flattened = Array.isArray(canvasStyle) ? Object.assign({}, ...canvasStyle) : canvasStyle;
    expect(flattened.backgroundColor).toBe('#F6DADA');
  });
});
