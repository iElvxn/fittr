jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest.fn(),
  addNetworkStateListener: jest.fn(),
}));

import { focusManager, onlineManager, QueryObserver } from '@tanstack/react-query';
import { waitFor } from '@testing-library/react-native';
import * as Network from 'expo-network';
import { AppState } from 'react-native';

import { FitError } from '@/lib/fits/errors';
import { createQueryClient, registerQueryManagers } from '@/lib/query/queryClient';

const getNetworkStateAsync = Network.getNetworkStateAsync as jest.Mock;
const addNetworkStateListener = Network.addNetworkStateListener as jest.Mock;
const removeNetworkListener = jest.fn();

const OFFLINE = new FitError('no_connection', 'offline');

/** The latest `expo-network` listener, called as the OS would. */
function networkChange(isConnected: boolean | null) {
  const listener = addNetworkStateListener.mock.calls.at(-1)[0];
  listener({ isConnected });
}

/** The latest `AppState` `change` listener, called as the OS would. */
function appStateChange(state: string) {
  const listener = (AppState.addEventListener as jest.Mock).mock.calls.filter(([event]) => event === 'change').at(-1)[1];
  listener(state);
}

/**
 * The real defaults, minus the waits: no retry delay, and no cache-cleanup
 * timer left running after the test.
 */
function testClient() {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retryDelay: 0, gcTime: Infinity } });
  return client;
}

describe('createQueryClient', () => {
  it('sets the React Native defaults', () => {
    const queries = createQueryClient().getDefaultOptions().queries;

    expect(queries?.staleTime).toBe(60_000);
    expect(queries?.networkMode).toBe('always');
    // Left unset, `networkMode: 'always'` would turn this off.
    expect(queries?.refetchOnReconnect).toBe(true);
  });

  it('never retries a no-connection error', async () => {
    const client = testClient();
    const queryFn = jest.fn().mockRejectedValue(OFFLINE);

    await client.fetchQuery({ queryKey: ['offline'], queryFn }).catch(() => {});

    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  // Most reads throw Supabase's raw error, not an already-classified `FitError`.
  it.each([
    ['a bare TypeError', new TypeError('Network request failed')],
    ['a raw Supabase error', { message: 'TypeError: Network request failed' }],
  ])('never retries %s from a dropped connection', async (_name, error) => {
    const client = testClient();
    const queryFn = jest.fn().mockRejectedValue(error);

    await client.fetchQuery({ queryKey: ['raw-offline'], queryFn }).catch(() => {});

    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it('retries any other error twice', async () => {
    const client = testClient();
    const queryFn = jest.fn().mockRejectedValue(new Error('500'));

    await client.fetchQuery({ queryKey: ['server-error'], queryFn }).catch(() => {});

    expect(queryFn).toHaveBeenCalledTimes(3);
  });
});

describe('registerQueryManagers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getNetworkStateAsync.mockResolvedValue({ isConnected: true });
    addNetworkStateListener.mockReturnValue({ remove: removeNetworkListener });
  });

  afterEach(() => {
    // Both managers are module singletons shared by every test in the file.
    onlineManager.setEventListener(() => undefined);
    focusManager.setEventListener(() => undefined);
    onlineManager.setOnline(true);
    focusManager.setFocused(undefined);
  });

  it('starts offline when the app launches with no connection', async () => {
    getNetworkStateAsync.mockResolvedValue({ isConnected: false });

    registerQueryManagers();
    await Promise.resolve();

    expect(onlineManager.isOnline()).toBe(false);
  });

  it('never lets a late launch reading overwrite a newer change', async () => {
    let resolveSeed: (state: { isConnected: boolean }) => void = () => {};
    getNetworkStateAsync.mockReturnValue(new Promise((resolve) => (resolveSeed = resolve)));

    registerQueryManagers();
    networkChange(false);
    resolveSeed({ isConnected: true });
    await Promise.resolve();

    expect(onlineManager.isOnline()).toBe(false);
  });

  it('follows connectivity changes', async () => {
    registerQueryManagers();
    await Promise.resolve();

    networkChange(false);
    expect(onlineManager.isOnline()).toBe(false);

    networkChange(true);
    expect(onlineManager.isOnline()).toBe(true);
  });

  it('treats an unknown connection state as online', async () => {
    registerQueryManagers();
    await Promise.resolve();
    networkChange(false);

    networkChange(null);

    expect(onlineManager.isOnline()).toBe(true);
  });

  it('removes the network listener when replaced', () => {
    registerQueryManagers();

    onlineManager.setEventListener(() => undefined);

    expect(removeNetworkListener).toHaveBeenCalledTimes(1);
  });

  it('is focused only while the app is active', () => {
    registerQueryManagers();

    appStateChange('background');
    expect(focusManager.isFocused()).toBe(false);

    appStateChange('inactive');
    expect(focusManager.isFocused()).toBe(false);

    appStateChange('active');
    expect(focusManager.isFocused()).toBe(true);
  });

  describe('with a real client', () => {
    const client = testClient();
    const unsubscribes: (() => void)[] = [];

    /** A mounted read, as a screen would hold it. */
    function observe(key: string, queryFn: jest.Mock, options: { staleTime?: number } = {}) {
      const observer = new QueryObserver(client, { queryKey: [key], queryFn, ...options });
      unsubscribes.push(observer.subscribe(() => {}));
    }

    beforeEach(() => {
      client.mount();
    });

    afterEach(() => {
      unsubscribes.splice(0).forEach((unsubscribe) => unsubscribe());
      client.unmount();
      client.clear();
    });

    it('refetches a read that failed offline when an offline launch reconnects', async () => {
      getNetworkStateAsync.mockResolvedValue({ isConnected: false });
      registerQueryManagers();
      await Promise.resolve();
      const queryFn = jest.fn().mockRejectedValueOnce(OFFLINE).mockResolvedValue('data');
      observe('failed-offline', queryFn);
      await waitFor(() => expect(client.getQueryState(['failed-offline'])?.status).toBe('error'));

      networkChange(true);

      await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2));
    });

    it('refetches stale reads on resume and leaves fresh ones alone', async () => {
      registerQueryManagers();
      await Promise.resolve();
      const stale = jest.fn().mockResolvedValue('data');
      const fresh = jest.fn().mockResolvedValue('data');
      observe('stale', stale, { staleTime: 0 });
      observe('fresh', fresh);
      await waitFor(() => expect(client.getQueryState(['fresh'])?.status).toBe('success'));
      await waitFor(() => expect(client.getQueryState(['stale'])?.status).toBe('success'));

      appStateChange('background');
      appStateChange('active');

      await waitFor(() => expect(stale).toHaveBeenCalledTimes(2));
      expect(fresh).toHaveBeenCalledTimes(1);
    });
  });
});
