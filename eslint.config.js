const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: ['dist/*', 'supabase/migrations/*'],
  },
  {
    // Plain `.js`, so unlike `__tests__/**/*.test.tsx` it doesn't get `no-undef`
    // turned off by the TypeScript override -- `jest.mock` here needs the global.
    files: ['jest.setup.js'],
    languageOptions: {
      globals: { jest: 'readonly' },
    },
  },
];
