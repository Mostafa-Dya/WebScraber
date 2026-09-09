/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

// Opt-in tests against the real development spreadsheet: `npm run test:live`.
// Each test skips itself unless .env provides GOOGLE_SHEET_ID and working credentials.
export default getViteConfig({
  test: {
    include: ['tests/live/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 60_000,
    passWithNoTests: true,
  },
});
