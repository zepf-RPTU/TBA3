// End-to-end suite: a Node project whose specs drive the installed Google
// Chrome through the `playwright` library against the built bundle (see
// tests/e2e/support/servers.js). Self-contained — every dataset it opens is a committed
// fixture. Kept out of config/vitest.config.mjs on purpose so `npm test` and the
// pre-push gate never pick it up — the suite needs Chrome and minutes.
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        name: 'e2e',
        environment: 'node',
        include: ['tests/e2e/**/*.spec.js'],
        globalSetup: ['tests/e2e/support/servers.js'],
        // One spec at a time: the specs share one preview server on a fixed port, so
        // parallel spec files would contend for it.
        fileParallelism: false,
        testTimeout: 30_000,
        hookTimeout: 60_000,
        retry: 0,
        reporters: ['verbose'],
    },
});
