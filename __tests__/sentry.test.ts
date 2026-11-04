jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  setUser: jest.fn(),
  reactNavigationIntegration: jest.fn(() => ({ name: 'ReactNavigation', registerNavigationContainer: jest.fn() })),
}));

import * as Sentry from '@sentry/react-native';

const DSN = 'https://key@o0.ingest.sentry.io/0';

// The DSN is read once at module load, so each case loads a fresh copy.
function loadSentry(dsn: string | undefined): typeof import('@/lib/observability/sentry') {
  if (dsn === undefined) {
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  } else {
    process.env.EXPO_PUBLIC_SENTRY_DSN = dsn;
  }
  let mod!: typeof import('@/lib/observability/sentry');
  jest.isolateModules(() => {
    mod = require('@/lib/observability/sentry');
  });
  return mod;
}

function setDev(value: boolean) {
  Object.assign(globalThis, { __DEV__: value });
}

function initOptions() {
  return (Sentry.init as jest.Mock).mock.calls[0][0];
}

describe('initSentry', () => {
  const originalDev = __DEV__;

  beforeEach(() => jest.clearAllMocks());
  afterEach(() => {
    setDev(originalDev);
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  });

  it('traces every session in development', () => {
    setDev(true);
    loadSentry(DSN).initSentry();

    expect(initOptions().tracesSampleRate).toBe(1.0);
  });

  it('samples a fifth of sessions in production builds', () => {
    setDev(false);
    loadSentry(DSN).initSentry();

    expect(initOptions().tracesSampleRate).toBe(0.2);
  });

  it('registers the navigation integration so traces split per screen', () => {
    const { initSentry, navigationIntegration } = loadSentry(DSN);
    initSentry();

    expect(initOptions().integrations).toEqual([navigationIntegration]);
  });

  it('stays a disabled no-op without a DSN', () => {
    loadSentry(undefined).initSentry();

    expect(initOptions()).toEqual(expect.objectContaining({ dsn: undefined, enabled: false }));
  });

  it('enables with a DSN and never sends default PII', () => {
    loadSentry(DSN).initSentry();

    expect(initOptions()).toEqual(expect.objectContaining({ dsn: DSN, enabled: true }));
    expect(initOptions().sendDefaultPii).not.toBe(true);
  });
});

describe('identifySentryUser', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sets only the user id', () => {
    loadSentry(undefined).identifySentryUser('user-1');

    expect(Sentry.setUser).toHaveBeenCalledWith({ id: 'user-1' });
  });

  it('clears the user on null', () => {
    loadSentry(undefined).identifySentryUser(null);

    expect(Sentry.setUser).toHaveBeenCalledWith(null);
  });
});
