// Every suite runs in one fixed zone, set here before Jest spawns its
// workers: a test file can't change it for itself, since each file gets its
// own copy of `process.env`. A zone with daylight saving (not UTC, which CI
// runners default to) so date code is exercised across 23/25-hour days --
// see `__tests__/plannerWeek.test.ts`.
process.env.TZ = 'America/Los_Angeles';

module.exports = {
  collectCoverageFrom: ['lib/**/*.{ts,tsx}', '!lib/**/*.d.ts'],
  projects: [
    {
      displayName: 'app',
      preset: 'jest-expo',
      setupFiles: ['<rootDir>/jest.setup.js'],
      testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/supabase/'],
      // `jest-expo`'s default pattern doesn't cover these two -- both ship an
      // untranspiled ESM build that Jest resolves ahead of their CommonJS
      // one, so anything importing them (transitively, via lib/wardrobe/processImage.ts)
      // fails with "Cannot use import statement outside a module" unless
      // they're carved out of the default node_modules exclusion here too.
      transformIgnorePatterns: [
        '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation|@shopify/react-native-skia|@six33/react-native-bg-removal))',
        '/node_modules/react-native-reanimated/plugin/',
        '/node_modules/@react-native/babel-preset/',
      ],
    },
    {
      // `@react-native/jest-preset` (pulled in by `jest-expo` above) mocks
      // the native Networking module, so RN's `fetch` polyfill never makes
      // a real HTTP call under that preset -- every request resolves
      // instantly with a bogus empty Response (`status: undefined`). This
      // test hits a real Supabase project on purpose (RLS can only be
      // verified against real Postgres), so it needs a plain Node
      // environment with untouched native `fetch`, not the RN preset.
      displayName: 'supabase-integration',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/supabase/tests/**/*.test.ts'],
      // Deliberately not `babel.config.js`'s `babel-preset-expo`: that
      // preset rewrites `process.env.EXPO_PUBLIC_*` into an import from a
      // Metro-only virtual module, which only jest-expo's own
      // moduleNameMapper (not used by this plain-Node project) can
      // resolve. This test needs nothing RN/Expo-specific -- just
      // TS-to-JS and ESM-to-CommonJS.
      transform: {
        '^.+\\.tsx?$': [
          'babel-jest',
          {
            // `babel-jest` merges these options with the root
            // `babel.config.js` by default -- `configFile: false` opts
            // out so `babel-preset-expo` never runs here.
            configFile: false,
            babelrc: false,
            presets: ['@babel/preset-typescript'],
            plugins: ['@babel/plugin-transform-modules-commonjs'],
          },
        ],
      },
    },
  ],
};
