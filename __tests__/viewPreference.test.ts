jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';

import { loadPlannerView, savePlannerView } from '@/lib/planner/viewPreference';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('loadPlannerView', () => {
  it('returns the stored view', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('month');

    await expect(loadPlannerView()).resolves.toBe('month');
  });

  it('falls back to week when nothing is stored', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

    await expect(loadPlannerView()).resolves.toBe('week');
  });

  it('falls back to week for an unknown value', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('year');

    await expect(loadPlannerView()).resolves.toBe('week');
  });

  it('falls back to week when the read fails', async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('storage unavailable'));

    await expect(loadPlannerView()).resolves.toBe('week');
  });
});

describe('savePlannerView', () => {
  it('stores the view under the same key it is read from', async () => {
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

    await savePlannerView('month');

    const [key, value] = (AsyncStorage.setItem as jest.Mock).mock.calls[0];
    expect(value).toBe('month');
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('month');
    await loadPlannerView();
    expect(AsyncStorage.getItem).toHaveBeenCalledWith(key);
  });

  it('ignores a failed write', async () => {
    (AsyncStorage.setItem as jest.Mock).mockRejectedValue(new Error('disk full'));

    await expect(savePlannerView('week')).resolves.toBeUndefined();
  });
});
