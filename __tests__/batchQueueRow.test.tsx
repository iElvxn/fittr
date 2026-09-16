jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

import { render, screen, userEvent } from '@testing-library/react-native';

import { BatchQueueRow } from '@/components/wardrobe/BatchQueueRow';
import type { BatchItem } from '@/stores/wardrobeCapture';

function makeItem(overrides: Partial<BatchItem> = {}): BatchItem {
  return {
    id: 'row-1',
    source: 'camera',
    photoUri: 'file://photo-1.jpg',
    cutoutUri: null,
    thumbUri: null,
    itemId: null,
    status: 'processing',
    errorMessage: null,
    category: 'top',
    colorHex: null,
    name: '',
    brand: '',
    notes: '',
    expanded: false,
    ...overrides,
  };
}

const baseProps = {
  onToggleExpand: jest.fn(),
  onRetake: jest.fn(),
  onRemove: jest.fn(),
  onCategoryChange: jest.fn(),
  onColorChange: jest.fn(),
  onNameChange: jest.fn(),
  onBrandChange: jest.fn(),
  onNotesChange: jest.fn(),
};

describe('BatchQueueRow, processing status', () => {
  it('shows a processing indicator and no editable controls', async () => {
    await render(<BatchQueueRow item={makeItem({ status: 'processing' })} {...baseProps} />);

    expect(screen.getByText(/processing/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Top' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retake' })).toBeNull();
  });

  it('still allows removal while processing', async () => {
    const onRemove = jest.fn();
    await render(<BatchQueueRow item={makeItem({ status: 'processing' })} {...baseProps} onRemove={onRemove} />);

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Remove' }));

    expect(onRemove).toHaveBeenCalledWith('row-1');
  });
});

describe('BatchQueueRow, error status', () => {
  it('shows the error message and a Retake action', async () => {
    const onRetake = jest.fn();
    await render(
      <BatchQueueRow
        item={makeItem({ status: 'error', errorMessage: "Couldn't find your item in that photo." })}
        {...baseProps}
        onRetake={onRetake}
      />,
    );

    expect(screen.getByText("Couldn't find your item in that photo.")).toBeTruthy();

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Retake' }));
    expect(onRetake).toHaveBeenCalledWith('row-1');
  });

  it('still allows removal while errored', async () => {
    const onRemove = jest.fn();
    await render(
      <BatchQueueRow
        item={makeItem({ status: 'error', errorMessage: 'boom' })}
        {...baseProps}
        onRemove={onRemove}
      />,
    );

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Remove' }));

    expect(onRemove).toHaveBeenCalledWith('row-1');
  });
});

describe('BatchQueueRow, ready status, collapsed', () => {
  it('shows the cutout and a summary, without exposing edit controls', async () => {
    await render(
      <BatchQueueRow
        item={makeItem({ status: 'ready', cutoutUri: 'file://cutout-1.png', category: 'shoes', expanded: false })}
        {...baseProps}
      />,
    );

    expect(screen.getByTestId('batch-row-cutout')).toBeTruthy();
    expect(screen.getByText('Shoes')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Top' })).toBeNull();
    expect(screen.queryByLabelText('Item name')).toBeNull();
  });

  it('shows a collapsed chevron and calls onToggleExpand with the item id when the row is tapped', async () => {
    const onToggleExpand = jest.fn();
    await render(
      <BatchQueueRow
        item={makeItem({ status: 'ready', cutoutUri: 'file://cutout-1.png', expanded: false })}
        {...baseProps}
        onToggleExpand={onToggleExpand}
      />,
    );

    expect(screen.getByText('▾')).toBeTruthy();

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: /expand|top/i }));

    expect(onToggleExpand).toHaveBeenCalledWith('row-1');
  });

  it('calls onRemove with the item id, with no confirmation dialog', async () => {
    const onRemove = jest.fn();
    await render(
      <BatchQueueRow
        item={makeItem({ status: 'ready', cutoutUri: 'file://cutout-1.png' })}
        {...baseProps}
        onRemove={onRemove}
      />,
    );

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Remove' }));

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith('row-1');
  });
});

describe('BatchQueueRow, ready status, expanded', () => {
  it('exposes category chips, color swatches, and text fields, and a Retake action', async () => {
    await render(
      <BatchQueueRow
        item={makeItem({ status: 'ready', cutoutUri: 'file://cutout-1.png', expanded: true })}
        {...baseProps}
      />,
    );

    expect(screen.getByRole('button', { name: 'Top' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Shoes' })).toBeTruthy();
    expect(screen.getByLabelText('Item name')).toBeTruthy();
    expect(screen.getByLabelText('Item brand')).toBeTruthy();
    expect(screen.getByLabelText('Item notes')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retake' })).toBeTruthy();
  });

  it('shows an expanded chevron', async () => {
    await render(
      <BatchQueueRow
        item={makeItem({ status: 'ready', cutoutUri: 'file://cutout-1.png', expanded: true })}
        {...baseProps}
      />,
    );

    expect(screen.getByText('▴')).toBeTruthy();
  });

  it('calls onCategoryChange with the item id and the tapped category', async () => {
    const onCategoryChange = jest.fn();
    await render(
      <BatchQueueRow
        item={makeItem({ status: 'ready', cutoutUri: 'file://cutout-1.png', expanded: true })}
        {...baseProps}
        onCategoryChange={onCategoryChange}
      />,
    );

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Shoes' }));

    expect(onCategoryChange).toHaveBeenCalledWith('row-1', 'shoes');
  });

  it('calls onRetake with the item id', async () => {
    const onRetake = jest.fn();
    await render(
      <BatchQueueRow
        item={makeItem({ status: 'ready', cutoutUri: 'file://cutout-1.png', expanded: true })}
        {...baseProps}
        onRetake={onRetake}
      />,
    );

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Retake' }));

    expect(onRetake).toHaveBeenCalledWith('row-1');
  });
});
