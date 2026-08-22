import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({resolve:{alias:{'@':fileURLToPath(new URL('.',import.meta.url))}},test:{include:['tests/unit/**/*.test.ts'],coverage:{provider:'v8',include:['lib/{game,services}/**/*.ts'],thresholds:{lines:75,functions:75,branches:65,statements:75}}}});
