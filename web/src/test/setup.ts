// Loaded before every test file (vite.config.ts → test.setupFiles).

// Dates are asserted in the gym's timezone; fail loudly instead of comparing shifted hours.
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
if (zone !== 'Africa/Tunis') {
  throw new Error(`Tests expect the Africa/Tunis timezone, got ${zone}. Run them with "npm test".`);
}
