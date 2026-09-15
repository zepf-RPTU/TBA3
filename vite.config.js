// Stays at the repo root: Vite resolves `root`, the
// multi-page inputs and `publicDir` relative to the config's directory.
import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fixtureApiPlugin } from './config/fixtureApiPlugin.js';

/**
 * An optional API server on port 8000, reached same-origin under /api/. The fixture API plugin answers the committed fixtures' scopes ahead of it.
 */
const API_PROXY = {
    '/api/': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (/** @type {string} */ path) => path.replace(/^\/api\//, '/'),
    },
};

/**
 * jsPDF's `html()` reaches `html2canvas`, `canvg` and `dompurify` through dynamic
 * imports; the repo never calls it (see config/emptyModule.js), and without the alias
 * the three ship as 376 KB of unreachable chunks.
 */
const EMPTY_MODULE = fileURLToPath(new URL('config/emptyModule.js', import.meta.url));

/** The third-party notices travel with every build (dist/NOTICE), so the image ships them. */
const NOTICE_FILE = fileURLToPath(new URL('NOTICE', import.meta.url));

export default defineConfig({
    // Unset everywhere the site is served from the domain root (dev, preview, e2e, the
    // nginx image). GitHub Pages serves a project page from /<repo>/, so its workflow
    // sets this. Absolute on purpose: `siteUrl()` (apiClient.js) resolves BASE_URL
    // against document.baseURI, and a relative base would land under /en/ on the sub-pages.
    base: process.env.TBA3_BASE ?? '/',
    appType: 'mpa',
    plugins: [
        fixtureApiPlugin(),
        {
            name: 'tba3-notice',
            generateBundle() {
                this.emitFile({
                    type: 'asset',
                    fileName: 'NOTICE',
                    source: readFileSync(NOTICE_FILE),
                });
            },
        },
    ],
    resolve: {
        alias: { html2canvas: EMPTY_MODULE, canvg: EMPTY_MODULE, dompurify: EMPTY_MODULE },
    },
    server: { port: 5501, strictPort: true, proxy: API_PROXY },
    preview: { port: 8765, strictPort: true, proxy: API_PROXY },
    build: {
        rolldownOptions: {
            input: {
                chooser: 'index.html',
                en: 'en/index.html',
                ma: 'ma/index.html',
                sl: 'sl/index.html',
            },
        },
    },
});
