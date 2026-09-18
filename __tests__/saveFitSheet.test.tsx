import { render, screen, userEvent } from '@testing-library/react-native';

import { SaveFitSheet } from '@/components/fitBuilder/SaveFitSheet';

const BASE_PROPS = {
  visible: true,
  collageUri: 'file://collage.png',
  defaultName: 'Fit 12',
  saving: false,
  connectionError: false,
  onSave: jest.fn(),
  onClose: jest.fn(),
};

describe('SaveFitSheet', () => {
  it('renders nothing when not visible', async () => {
    await render(<SaveFitSheet {...BASE_PROPS} visible={false} />);

    expect(screen.queryByText('Save Fit')).toBeNull();
  });

  it('pre-fills the name field with the generated default', async () => {
    await render(<SaveFitSheet {...BASE_PROPS} />);

    expect(screen.getByDisplayValue('Fit 12')).toBeTruthy();
  });

  it('saves with the default name when the user taps Save without editing it', async () => {
    const onSave = jest.fn();
    const user = userEvent.setup();
    await render(<SaveFitSheet {...BASE_PROPS} onSave={onSave} />);

    await user.press(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith('Fit 12');
  });

  it('saves with a trimmed custom name when the user edits the field', async () => {
    const onSave = jest.fn();
    const user = userEvent.setup();
    await render(<SaveFitSheet {...BASE_PROPS} onSave={onSave} />);

    await user.clear(screen.getByLabelText('Fit name'));
    await user.type(screen.getByLabelText('Fit name'), '  Weekend brunch  ');
    await user.press(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith('Weekend brunch');
  });

  it('falls back to the generated default when the edited name is blank', async () => {
    const onSave = jest.fn();
    const user = userEvent.setup();
    await render(<SaveFitSheet {...BASE_PROPS} onSave={onSave} />);

    await user.clear(screen.getByLabelText('Fit name'));
    await user.type(screen.getByLabelText('Fit name'), '   ');
    await user.press(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith('Fit 12');
  });

  it('shows the connection-error notice and keeps the sheet open on failure', async () => {
    await render(<SaveFitSheet {...BASE_PROPS} connectionError />);

    expect(screen.getByText('No connection — nothing was lost. Try again.')).toBeTruthy();
    expect(screen.getByDisplayValue('Fit 12')).toBeTruthy();
  });

  it('shows a loading state on the Save button while saving', async () => {
    await render(<SaveFitSheet {...BASE_PROPS} saving />);

    expect(screen.getByRole('button', { name: 'Save' }).props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('calls onClose when the scrim behind the sheet is tapped', async () => {
    const onClose = jest.fn();
    const user = userEvent.setup();
    await render(<SaveFitSheet {...BASE_PROPS} onClose={onClose} />);

    await user.press(screen.getByRole('button', { name: 'Dismiss' }));

    expect(onClose).toHaveBeenCalled();
  });

  it('does not call onClose when the scrim is tapped while saving', async () => {
    const onClose = jest.fn();
    const user = userEvent.setup();
    await render(<SaveFitSheet {...BASE_PROPS} saving onClose={onClose} />);

    await user.press(screen.getByRole('button', { name: 'Dismiss' }));

    expect(onClose).not.toHaveBeenCalled();
  });
});
