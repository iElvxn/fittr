import { render, screen } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), setParams: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));

import Fits from '@/app/(tabs)/fits';
import { useLocalSearchParams } from 'expo-router';

describe('Fits tab -- save acknowledgement', () => {
  it('shows "Fit saved." when returning with fitSaved=1', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ fitSaved: '1' });

    await render(<Fits />);

    expect(screen.getByText('Fit saved.')).toBeTruthy();
  });

  it('shows no acknowledgement without the fitSaved param', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({});

    await render(<Fits />);

    expect(screen.queryByText('Fit saved.')).toBeNull();
  });
});
