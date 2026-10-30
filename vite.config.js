// Stays at the repo root: Vite resolves `root`, the multi-page inputs and `publicDir`
// relative to the config's directory.
import { defineConfig } from 'vite';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DASHBOARD_META_CSP } from './config/csp.mjs';
import { breakpointsSheet } from './tools/lib/cssSheets.mjs';

// Windows keeps the drive-letter case of the caller's cwd (cmd.exe keeps `d:`), while Vite
// canonicalises module ids through realpathSync.native (`D:`). Mixed, Rolldown bundles
// lit-html twice and the second `trustedTypes.createPolicy('lit-html')` throws under the
// CSP, so pin root to the canonical path.
const ROOT = realpathSync.native(fileURLToPath(new URL('.', import.meta.url)));

/** An optional API server, reached same-origin under /api/; TBA3_API sets its address. */
const API_PROXY = {
    '/api/': {
        target: process.env.TBA3_API ?? 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (/** @type {string} */ path) => path.replace(/^\/api\//, '/'),
    },
};

/**
 * jsPDF's `html()` reaches `html2canvas` and `canvg` through dynamic imports; the repo
 * never calls it (see config/emptyModule.js), and without the alias the two ship as
 * unreachable chunks. Its third optional import, `dompurify`, resolves to the copy the
 * app already bundles for sanitizing API markup.
 */
const EMPTY_MODULE = fileURLToPath(new URL('config/emptyModule.js', import.meta.url));

/**
 * The browsers the CSS is compiled for. The sheets are written to Baseline "newly
 * available", the CSS lint's `css/use-baseline` setting. Under Vite's default
 * widely-available target, Lightning CSS polyfills light-dark() with space toggles that
 * resolve where a token is declared (:root), so a subtree with its own color-scheme
 * (paper under a dark page) would inherit the page's scheme.
 */
const CSS_TARGET = ['chrome123', 'edge123', 'firefox120', 'safari17.5'];

/**
 * Lightning CSS's form of a `build.cssTarget` list: each browser's version packed as
 * `major << 16 | minor << 8`.
 * @param {string[]} targets - Like `chrome123` or `safari17.5`.
 * @returns {Record<string, number>}
 */
function lightningTargets(targets) {
    return Object.fromEntries(
        targets.map((target) => {
            const [, browser, major, minor = '0'] =
                /^([a-z]+)(\d+)(?:\.(\d+))?$/.exec(target) ?? [];
            return [browser, (Number(major) << 16) | (Number(minor) << 8)];
        }),
    );
}

/**
 * The one layout breakpoint (`@custom-media --stacked-layout`). Lightning CSS reads a
 * custom media query only at the top level of the bundle it compiles, and every sheet a
 * module imports is a bundle of its own, so the definition is imported into each.
 */
const BREAKPOINTS_SHEET = fileURLToPath(new URL(breakpointsSheet, import.meta.url)).replaceAll(
    '\\',
    '/',
);

/** A sheet's leading comments and its `@layer a, b;` order statement, when it opens with one. */
const LEADING_LAYER_STATEMENT = /^(?:\s|\/\*[\s\S]*?\*\/)*@layer [^;{]+;/;

/** The third-party notices travel with every build (dist/NOTICE), so the image ships them. */
const NOTICE_FILE = fileURLToPath(new URL('NOTICE', import.meta.url));

export default defineConfig({
    root: ROOT,
    // Unset everywhere the site is served from the domain root (dev, preview, e2e, the
    // nginx image). GitHub Pages serves a project page from /<repo>/, so its workflow
    // sets this. Absolute on purpose: `siteUrl()` (apiClient.js) resolves BASE_URL
    // against document.baseURI, and a relative base would land under /en/ on the sub-pages.
    base: process.env.TBA3_BASE ?? '/',
    appType: 'mpa',
    plugins: [
        {
            // Build only: the dev server's inline module scripts and injected <style>
            // elements are exactly what the policy forbids (see config/csp.mjs).
            name: 'tba3-csp-meta',
            apply: 'build',
            transformIndexHtml: () => [
                {
                    tag: 'meta',
                    attrs: { 'http-equiv': 'Content-Security-Policy', content: DASHBOARD_META_CSP },
                    injectTo: 'head-prepend',
                },
            ],
        },
        {
            // Before vite:css compiles the sheet; the definition emits no rules.
            name: 'tba3-breakpoints',
            enforce: 'pre',
            transform(code, id) {
                const file = id.split('?')[0].replaceAll('\\', '/');
                if (!file.endsWith('.css') || file.includes('/node_modules/')) return null;
                if (file === BREAKPOINTS_SHEET) return null;
                // After the sheet's layer order statement: Lightning CSS ends the import
                // block at a statement that follows an @import.
                const head = LEADING_LAYER_STATEMENT.exec(code)?.[0] ?? '';
                return {
                    code: `${head}\n@import '${BREAKPOINTS_SHEET}';\n${code.slice(head.length)}`,
                    map: null,
                };
            },
        },
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
        alias: { html2canvas: EMPTY_MODULE, canvg: EMPTY_MODULE },
    },
    // Lightning CSS compiles the sheets in dev as in the build, so the one layout
    // breakpoint (`tba3-breakpoints`) resolves as `@custom-media`. The transform does not
    // read `build.cssTarget`, so it gets the same browsers.
    css: {
        transformer: 'lightningcss',
        lightningcss: { targets: lightningTargets(CSS_TARGET), drafts: { customMedia: true } },
    },
    // Dev only. The export libraries load through import() on the first export; listed
    // here, the dev server pre-bundles them at start, so finding them late cannot
    // re-optimize under an open page and fail that export with a 504.
    optimizeDeps: { include: ['jspdf', 'html-to-image'] },
    server: { port: 5501, strictPort: true, proxy: API_PROXY },
    preview: { port: 8765, strictPort: true, proxy: API_PROXY },
    build: {
        cssTarget: CSS_TARGET,
        rolldownOptions: {
            input: {
                chooser: 'index.html',
                en: 'en/index.html',
                ma: 'ma/index.html',
                sl: 'sl/index.html',
            },
            output: {
                // Each runtime library gets a chunk of its own: the three pages share
                // them, so they cache across releases instead of travelling in the
                // shared app chunk and re-downloading whenever that chunk changes.
                codeSplitting: {
                    groups: [
                        { name: 'tabulator', test: /node_modules[\\/]tabulator-tables[\\/]/ },
                        { name: 'quill', test: /node_modules[\\/](?:quill|parchment)[\\/]/ },
                        // The d3 modules the shell imports without a chart (palette
                        // tokens, statistics) sit apart from the rest, so a page preloads
                        // them alone and the full d3 chunk comes with the first chart.
                        {
                            name: 'd3-core',
                            test: /node_modules[\\/]d3-(?:array|color|interpolate|shape|path)[\\/]/,
                        },
                        { name: 'd3', test: /node_modules[\\/]d3(?:-[a-z-]+)?[\\/]/ },
                    ],
                },
            },
        },
    },
});
