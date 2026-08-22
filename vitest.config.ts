import { defineConfig } from 'vitest/config';
export default defineConfig({test:{include:['tests/unit/**/*.test.ts'],coverage:{provider:'v8',include:['lib/game/**/*.ts'],thresholds:{lines:75,functions:75,branches:65,statements:75}}}});
