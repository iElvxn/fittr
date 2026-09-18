import { render, screen, fireEvent, userEvent } from '@testing-library/react-native';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));
// `CanvasItem` pulls in Reanimated for its drag/pinch/rotate gesture, which
// has no working jest mock under Reanimated v4's worklets split (tracked by
// `CanvasItem` having no tests of its own yet). These tests never place an
// item, so `CanvasItem` never renders -- but `FitCanvas` still imports it
// statically, so it must be stubbed here purely to keep the module loadable.
jest.mock('@/components/fitBuilder/CanvasItem', () => ({ CanvasItem: () => null }));

import { FitCanvas } from '@/components/fitBuilder/FitCanvas';
import { useFitBuilderStore } from '@/stores/fitBuilder';

function layout() {
  fireEvent(screen.getByTestId('fit-canvas'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 400 } },
  });
}

beforeEach(() => {
  useFitBuilderStore.setState({ templateId: 'shorts-and-top', items: [], selectedId: null });
});

describe('FitCanvas onSlotPress wiring', () => {
  it("calls onSlotPress with the tapped ghost slot's own category", async () => {
    const onSlotPress = jest.fn();
    const user = userEvent.setup();
    await render(<FitCanvas cutoutUrls={{}} wardrobeItemCutoutPaths={{}} onSlotPress={onSlotPress} />);
    layout();

    await user.press(await screen.findByRole('button', { name: 'Add Shoes' }));

    expect(onSlotPress).toHaveBeenCalledWith('shoes');
  });

  it('gives each distinct slot its own category, not one shared value', async () => {
    const onSlotPress = jest.fn();
    const user = userEvent.setup();
    await render(<FitCanvas cutoutUrls={{}} wardrobeItemCutoutPaths={{}} onSlotPress={onSlotPress} />);
    layout();

    await user.press(await screen.findByRole('button', { name: 'Add Top' }));
    await user.press(screen.getByRole('button', { name: 'Add Bottom' }));

    expect(onSlotPress).toHaveBeenNthCalledWith(1, 'top');
    expect(onSlotPress).toHaveBeenNthCalledWith(2, 'bottom');
  });

  it('renders no ghost slots (nothing to press) when there is no template', async () => {
    useFitBuilderStore.setState({ templateId: null, items: [], selectedId: null });
    await render(<FitCanvas cutoutUrls={{}} wardrobeItemCutoutPaths={{}} onSlotPress={jest.fn()} />);
    layout();

    expect(screen.queryByRole('button', { name: /^Add /i })).toBeNull();
  });
});
