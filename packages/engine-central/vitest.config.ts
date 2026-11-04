import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: loadEnv('test', process.cwd(), ''),
    // Every test signs up users on the same local database: run files one after another.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
