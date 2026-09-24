// Keep `.env`-style vars empty by default so tests never accidentally talk
// to a real Supabase project unless the environment explicitly provides one.
require('react-native-get-random-values');

jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

// FlashList measures its own layout natively, so under Jest it renders no
// items. Its shipped `jestSetup.js` also swaps `FlashList` for a
// `RecyclerView` export that 2.0.x no longer has (leaving it undefined), so
// only the measurement half of that setup is reproduced here.
jest.mock('@shopify/flash-list/dist/recyclerview/utils/measureLayout', () => ({
  ...jest.requireActual('@shopify/flash-list/dist/recyclerview/utils/measureLayout'),
  measureParentSize: jest.fn(() => ({ x: 0, y: 0, width: 400, height: 900 })),
  measureFirstChildLayout: jest.fn(() => ({ x: 0, y: 0, width: 400, height: 900 })),
  measureItemLayout: jest.fn(() => ({ x: 0, y: 0, width: 100, height: 100 })),
}));
