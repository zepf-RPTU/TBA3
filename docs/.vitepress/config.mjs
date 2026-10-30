import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitepress';
import { buildDocTree } from '../../tools/docs-sidebar.mjs';
import { foldSections } from './foldSections.mjs';

// Windows keeps whatever drive-letter case the caller's cwd had, and VitePress resolves a
// relative srcDir against it while Vite canonicalises every module id through
// realpathSync.native (upper-cased drive). The two then never compare equal and rendering
// dies in resolvePageImports, so pin srcDir to the canonical absolute repo root.
const repoRoot = realpathSync.native(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'),
);

const repositoryUrl = JSON.parse(
    readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
).repository.url.replace(/\.git$/, '');

// The wiki renders the Markdown where it lives: the unit docs beside their sources under
// src/ and the hand-written set under docs/. srcDir is therefore the repo root; the
// sidebar is generated from the docs' own link tables (tools/docs-sidebar.mjs).
// Dead links fail the build on purpose — that is the link validation the structure
// check lacks.
export default defineConfig({
    lang: 'de-DE',
    title: 'TBA3',
    description: 'Modul- und Architekturdokumentation der TBA3-Dashboards',
    srcDir: repoRoot,
    srcExclude: ['public/**', 'tests/**', 'coverage/**', 'playwright-report/**', 'test-results/**'],
    rewrites: { 'README.md': 'index.md' },
    // No icon, as in the dashboards: without the tag the browser requests /favicon.ico at
    // the origin root, outside the site, and logs a 404.
    head: [['link', { rel: 'icon', href: 'data:,' }]],
    // One level below the dashboards' base (vite.config.js); GitHub Pages sets TBA3_BASE.
    base: `${process.env.TBA3_BASE ?? '/'}docs/`,
    outDir: '../dist/docs',
    cacheDir: '../node_modules/.vitepress',
    // No root vite.config.js (the dashboard MPA build) and no root public/ (the fixtures).
    vite: {
        configFile: false,
        publicDir: false,
        // The only chunk above Vite's default 500 kB limit is the local-search index,
        // one generated asset that loads on the first search keystroke and cannot be split.
        build: { chunkSizeWarningLimit: 700 },
    },
    markdown: {
        // Fenced blocks are v-pre already; inline code is not, and the docs quote glossary
        // and info-box placeholders such as `{{Bereich}}` that Vue would try to evaluate.
        config(md) {
            const render = md.renderer.rules.code_inline;
            md.renderer.rules.code_inline = (tokens, idx, options, env, self) => {
                tokens[idx].attrSet('v-pre', '');
                return render(tokens, idx, options, env, self);
            };
            // A relative link to anything but a Markdown page names a source file, which the
            // wiki does not serve: it opens the file on GitHub instead. VitePress's own link
            // rule, installed before config() runs, then treats it as an external link.
            const renderLink = md.renderer.rules.link_open;
            md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
                const href = tokens[idx].attrGet('href');
                const target = href?.replace(/[?#].*$/, '');
                if (target && !/^(?:[a-z]+:|\/)/i.test(href) && !target.endsWith('.md')) {
                    const repoPath = path.posix.join(path.posix.dirname(env.relativePath), target);
                    const kind = target.endsWith('/') ? 'tree' : 'blob';
                    tokens[idx].attrSet(
                        'href',
                        `${repositoryUrl}/${kind}/main/${repoPath}${href.slice(target.length)}`,
                    );
                }
                return renderLink(tokens, idx, options, env, self);
            };
            md.use(foldSections);
        },
    },
    themeConfig: {
        sidebar: buildDocTree().groups,
        search: { provider: 'local' },
        outline: [2, 3],
        nav: [
            { text: 'Architektur', link: '/docs/architecture' },
            { text: 'Modulindex', link: '/docs/module-index' },
            { text: 'Felder je Endpunkt', link: '/docs/endpoint-fields' },
            { text: 'Impressum', link: '/docs/impressum' },
        ],
        docFooter: { prev: 'Zurück', next: 'Weiter' },
        outlineTitle: 'Auf dieser Seite',
        sidebarMenuLabel: 'Menü',
        returnToTopLabel: 'Nach oben',
        darkModeSwitchLabel: 'Design',
    },
});
