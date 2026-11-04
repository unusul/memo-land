import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
    },
    // Every test file clears the same emulator project: run files one after another.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
