module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.js'],
  collectCoverageFrom: ['lib/**/*.{ts,tsx}', '!lib/**/*.d.ts'],
};
