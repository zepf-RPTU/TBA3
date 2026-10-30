import { afterEach, vi } from 'vitest';

// Runs after the file's own afterEach hooks. The browser project gives each file one
// page, not each test: whatever a test mounts would reach the next one.
afterEach(async () => {
    vi.useRealTimers();
    // Absent in the node project; a test's stubbed `document` may carry no body.
    globalThis.document?.body?.replaceChildren();
    // A removed module tears down one microtask later, and takes its page listeners
    // with it: they must not answer for the next test.
    await Promise.resolve();
});
