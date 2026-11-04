const mockClient = {
  identify: jest.fn(),
  reset: jest.fn(),
  optOut: jest.fn(() => Promise.resolve()),
  capture: jest.fn(),
};

jest.mock('posthog-react-native', () => jest.fn(() => mockClient));

// The key is read once at module load, so each case loads a fresh copy.
function loadPosthog(apiKey: string | undefined): typeof import('@/lib/analytics/posthog') {
  if (apiKey === undefined) {
    delete process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
  } else {
    process.env.EXPO_PUBLIC_POSTHOG_API_KEY = apiKey;
  }
  let mod!: typeof import('@/lib/analytics/posthog');
  jest.isolateModules(() => {
    mod = require('@/lib/analytics/posthog');
  });
  return mod;
}

describe('posthog analytics', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => {
    delete process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
  });

  it('identifies by the user id only', () => {
    loadPosthog('phc_real').identifyAnalyticsUser('user-1');

    expect(mockClient.identify).toHaveBeenCalledWith('user-1');
  });

  it('resets the person on sign-out', () => {
    loadPosthog('phc_real').resetAnalyticsUser();

    expect(mockClient.reset).toHaveBeenCalledTimes(1);
  });

  it('opts out with the placeholder key', () => {
    loadPosthog(undefined);

    expect(mockClient.optOut).toHaveBeenCalledTimes(1);
  });

  // reset() clears every persisted property, opt-out flag included, so
  // calling it on the placeholder client would opt it back in.
  it('never touches the placeholder client on identify or reset', () => {
    const { identifyAnalyticsUser, resetAnalyticsUser } = loadPosthog(undefined);

    identifyAnalyticsUser('user-1');
    resetAnalyticsUser();

    expect(mockClient.identify).not.toHaveBeenCalled();
    expect(mockClient.reset).not.toHaveBeenCalled();
  });

  it('stays opted in with a real key', () => {
    loadPosthog('phc_real');

    expect(mockClient.optOut).not.toHaveBeenCalled();
  });
});
