module.exports = {
  collectCoverageFrom: ['lib/**/*.{ts,tsx}', '!lib/**/*.d.ts'],
  projects: [
    {
      displayName: 'app',
      preset: 'jest-expo',
      setupFiles: ['<rootDir>/jest.setup.js'],
      testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/supabase/'],
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
