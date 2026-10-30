/**
 * Import boundaries between the apps, the shared layer and the two workspace packages.
 * `npm run check:deps` cruises src, packages and tests with this file; every rule is an
 * error. The cross-file checks that are not about imports stay in tools/check-structure.mjs.
 */

import { readFileSync } from 'node:fs';

/** Every entry of `@tba3/modules` that is not a chart, as a path pattern. */
const nonChartEntries = Object.entries(
    JSON.parse(readFileSync(new URL('../packages/modules/package.json', import.meta.url), 'utf8'))
        .exports,
)
    .filter(([key]) => !key.startsWith('./charts') && !key.includes('*'))
    .map(([, target]) => `^packages/modules/${target.slice(2).replaceAll('.', '[.]')}$`);

/** @type {import('dependency-cruiser').IConfiguration} */
export default {
    forbidden: [
        {
            name: 'common-not-to-apps',
            comment:
                'The shared layer serves all three apps, so it never imports one of them; app-specific code is handed in by the app.',
            severity: 'error',
            from: { path: '^(src|packages/modules/src)/common/' },
            to: { path: '^(src|packages/modules/src)/(en|ma|sl)/' },
        },
        {
            name: 'apps-not-to-each-other',
            comment:
                'An app never imports another app; what two apps share moves to src/common or into the package.',
            severity: 'error',
            from: { path: '^src/(en|ma|sl)/' },
            to: { path: '^src/(en|ma|sl)/', pathNot: '^src/$1/' },
        },
        {
            name: 'src-not-to-config',
            comment:
                "App code runs in the browser and config/ is build tooling. The one exception is config/csp.mjs, plain dependency-free ESM, which apiClient.js imports so the CSP's connect-src and the ?api= check share LOOPBACK_HOSTS.",
            severity: 'error',
            from: { path: '^src/' },
            to: { path: '^config/', pathNot: '^config/csp[.]mjs$' },
        },
        {
            name: 'csp-imports-nothing',
            comment:
                'config/csp.mjs ships in the app bundle (see src-not-to-config), so it imports nothing: Node-only code there would break the bundle.',
            severity: 'error',
            from: { path: '^config/csp[.]mjs$' },
            to: {},
        },
        {
            name: 'module-base-not-to-modules',
            comment:
                'module-base is the lower layer: @tba3/modules builds on it, never the other way round.',
            severity: 'error',
            from: { path: '^packages/module-base/' },
            to: { path: '^packages/modules/' },
        },
        {
            name: 'package-boundary',
            comment:
                'A package source or test reaches nothing outside its own folder by a relative path: a consumer installing the package would not have it, and a test exercises the package the way a consumer installs it. Other workspace packages come in by name.',
            severity: 'error',
            from: { path: '^packages/([^/]+)/' },
            to: {
                dependencyTypes: ['local'],
                dependencyTypesNot: ['aliased-workspace'],
                pathNot: '^packages/$1/',
            },
        },
        {
            name: 'package-undeclared-dependency',
            comment:
                'A package imports only what its own package.json declares; declaring a dependency is the one step that permits it.',
            severity: 'error',
            from: { path: '^packages/[^/]+/(src/|index[.]js$)' },
            // A peer dependency also reads as npm-no-pkg: it is declared but resolved from the root.
            to: {
                dependencyTypes: ['npm-no-pkg', 'npm-unknown', 'npm-dev'],
                dependencyTypesNot: ['npm-peer'],
            },
        },
        {
            name: 'package-internals',
            comment:
                "Outside a package, its code is reached only through its @tba3/* entries; a relative path would walk around the exports map. A package's test/support helpers stay reachable for the app's tests. The live-API tier (tests/e2e-server) pins internals and never ships.",
            severity: 'error',
            from: { path: '^(src|tests)/', pathNot: '^tests/e2e-server/' },
            to: {
                dependencyTypes: ['local'],
                dependencyTypesNot: ['aliased-workspace'],
                path: '^packages/[^/]+/src/',
            },
        },
        {
            name: 'chart-host-boundary',
            comment:
                'The chart host is a card and carries no chart weight for a consumer that renders no chart: no glossary annotator (it drags in the competence palette), no d3, no Tabulator. Capabilities come through packages/module-base/src/modules/moduleRuntime.js.',
            severity: 'error',
            from: { path: '^packages/modules/src/common/charts/host/chartHostModule[.]js$' },
            to: {
                reachable: true,
                path: [
                    '^packages/modules/src/common/glossary/glossaryAnnotator[.]js$',
                    '^node_modules/(d3|tabulator-tables)/',
                ],
            },
        },
        {
            name: 'renderers-internal-private',
            comment:
                'renderers/internal/ is reached only from renderers/: a chart calls ChartRenderer, the facade, and names its types through chartRenderer.js.',
            severity: 'error',
            from: {
                path: '^packages/modules/src/',
                pathNot: '^packages/modules/src/common/charts/renderers/',
            },
            to: { path: '^packages/modules/src/common/charts/renderers/internal/' },
        },
        {
            name: 'tables-internal-private',
            comment: 'tables/internal/ is reached only from tables/.',
            severity: 'error',
            from: {
                path: '^packages/modules/src/',
                pathNot: '^packages/modules/src/common/tables/',
            },
            to: { path: '^packages/modules/src/common/tables/internal/' },
        },
        {
            name: 'd3-free-entries',
            comment:
                'd3 is an optional peer of @tba3/modules: only a chart needs it. Every entry of its exports map outside ./charts loads without it; colour and array helpers come from the small d3-color, d3-interpolate and d3-array packages.',
            severity: 'error',
            from: { path: nonChartEntries },
            to: { reachable: true, path: '^node_modules/d3/' },
        },
        {
            name: 'domain-boundary',
            comment:
                'The vocabulary barrels let a host read rows, options and metrics without a card: no d3, no Tabulator, no sheet, no glossary annotator and nothing from a card folder.',
            severity: 'error',
            from: {
                path: '^packages/modules/src/(common/domain|en|ma|sl)/index[.]js$',
            },
            to: {
                reachable: true,
                path: [
                    '^packages/modules/src/common/glossary/glossaryAnnotator[.]js$',
                    '^packages/modules/src/(en|ma|sl)/modules/',
                    '[.]css$',
                    '^node_modules/(d3|tabulator-tables)/',
                ],
            },
        },
    ],
    options: {
        doNotFollow: { path: 'node_modules' },
        enhancedResolveOptions: {
            exportsFields: ['exports'],
            conditionNames: ['import', 'default'],
        },
    },
};
