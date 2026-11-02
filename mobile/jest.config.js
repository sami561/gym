// Unit tests (`npm test`). jest-expo runs them in Node with the native modules mocked and maps the
// `@/*` alias from tsconfig.json. Dates are asserted in the gym's timezone, whatever the machine's.
process.env.TZ = 'Africa/Tunis';

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts?(x)'],
  restoreMocks: true,
};
