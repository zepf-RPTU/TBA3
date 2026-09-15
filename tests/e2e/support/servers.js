/**
 * Global setup for the e2e project: build, then serve the built output.
 *
 * The artifact users get is what the specs exercise, so the bundle is built and served
 * with Vite's preview server (port 8765). Nothing else is needed: every dataset the
 * dashboards list is a committed fixture, and the fixture API plugin
 * (config/fixtureApiPlugin.js) answers `?scope=` requests for those fixtures under
 * /api/.
 */

import { build, preview } from 'vite';

/** @returns {Promise<() => Promise<void>>} The teardown. */
export default async function setup() {
    await build({ configFile: 'vite.config.js', logLevel: 'warn' });
    // strictPort in vite.config.js: a stale server on 8765 fails the run instead of
    // silently testing someone else's build.
    const previewServer = await preview({ configFile: 'vite.config.js' });
    return async () => {
        await previewServer.close();
    };
}
