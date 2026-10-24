import { AppState } from 'react-native';

const mockStartAutoRefresh = jest.fn();
const mockStopAutoRefresh = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ auth: { startAutoRefresh: mockStartAutoRefresh, stopAutoRefresh: mockStopAutoRefresh } })),
}));
jest.mock('expo-secure-store', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () => ({}));

describe('Supabase auto-refresh follows the foreground', () => {
  let onChange: (state: string) => void;
  let addEventListener: jest.SpyInstance;

  beforeAll(() => {
    addEventListener = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
      onChange = handler as (state: string) => void;
      return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
    // No real project config under Jest; the client module warns about it.
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    require('@/lib/supabase');
  });

  beforeEach(() => {
    mockStartAutoRefresh.mockClear();
    mockStopAutoRefresh.mockClear();
  });

  it('registers exactly one AppState listener when the client module loads', () => {
    expect(addEventListener).toHaveBeenCalledTimes(1);
    expect(addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('starts refreshing when the app becomes active', () => {
    onChange('active');

    expect(mockStartAutoRefresh).toHaveBeenCalledTimes(1);
    expect(mockStopAutoRefresh).not.toHaveBeenCalled();
  });

  it.each(['background', 'inactive'])('stops refreshing when the app goes %s', (state) => {
    onChange(state);

    expect(mockStopAutoRefresh).toHaveBeenCalledTimes(1);
    expect(mockStartAutoRefresh).not.toHaveBeenCalled();
  });
});
