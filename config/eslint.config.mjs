import css from '@eslint/css';
import { defineConfig } from 'eslint/config';
import {
    breakpointsSheet,
    cssLayerNames,
    listSharedSheets,
    tokenDefaultsSheets,
} from '../tools/lib/cssSheets.mjs';

// ESLint lints CSS only. JavaScript is oxlint's (.oxlintrc.json at the repo root).
// The seven type-scale tokens, plus the sizes a renderer or a component computes at runtime
// (an icon box, a ring label, the welcome splash's display figure, a report page scaled to
// its width).
const fontSizeTokens = [
    'fs-sm',
    'fs-base',
    'fs-lg',
    'fs-h1',
    'fs-h2',
    'fs-module-title',
    'fs-header-control',
    'btn-icon-size',
    'ring-fs',
    'preview-display-size',
    'report-page-width',
];

// Every font-size reads a token: the type scale stays seven sizes, and a size that a
// renderer computes is named for what computes it.
const fontSizeRestrictions = [
    {
        selector:
            'Declaration[property="font-size"]:not(:has(Function[name="var"])):not(:has(Identifier[name="inherit"]))',
        message: 'font-size must read a type-scale token (--fs-*).',
    },
    {
        selector: `Declaration[property="font-size"] Function[name="var"] > Identifier:first-child[name!=/^--(${fontSizeTokens.join('|')})$/]`,
        message: 'font-size must read a type-scale token (--fs-*).',
    },
    // The shorthand sets a size too, past the two rules above: it may only inherit.
    {
        selector: 'Declaration[property="font"]:not(:has(Identifier[name="inherit"]))',
        message:
            'The font shorthand may only be `inherit`; set font-size and font-weight with their tokens.',
    },
];

const fontWeightTokens = ['fw-bold', 'fw-semibold'];

// Every font-weight reads a token, so emphasis stays two weights; `normal` resets one.
const fontWeightRestrictions = [
    {
        selector:
            'Declaration[property="font-weight"]:not(:has(Function[name="var"])):not(:has(Identifier[name=/^(inherit|normal)$/]))',
        message: 'font-weight must read a --fw-* token.',
    },
    {
        selector: `Declaration[property="font-weight"] Function[name="var"] > Identifier:first-child[name!=/^--(${fontWeightTokens.join('|')})$/]`,
        message: 'font-weight must read a --fw-* token.',
    },
];
// --primary-color misses 4.5:1 as text (module-base tokens.css); `color` reads
// --color-accent-text.
const textColorRestrictions = [
    {
        selector:
            'Declaration[property="color"] Function[name="var"] > Identifier:first-child[name="--primary-color"]',
        message: 'color must not read --primary-color; use --color-accent-text.',
    },
];
// The page reflows at one breakpoint, `--stacked-layout` (src/styles/foundation/
// breakpoints.css); a width of a sheet's own, on the viewport or on a container, would be
// a second, guessed one.
const breakpointRestriction = {
    selector: 'Atrule[name=/^(media|container)$/] > AtrulePrelude Dimension',
    message:
        'A media or container query must not name its own width; use `@media (--stacked-layout)` or a fit test against the measured content.',
};
// Unit-owned sheets may not target the ContentModule shell slots; those belong to the slot
// owner, the shared table-host layout that composes them, and the foundation sheets. Units
// add owner-local classes instead.
const slotRestriction = {
    selector:
        'ClassSelector[name=/^(content-module-(header|title|subtitle|body)|module-container)$/]',
    message:
        'targets a shared ContentModule slot; add an owner-local class from the owning module instead.',
};

export default defineConfig([
    // `@custom-media`, which the CSS parser does not know; Lightning CSS resolves it at
    // build (vite.config.js).
    { ignores: [breakpointsSheet] },
    {
        files: ['**/*.css'],
        plugins: { css },
        language: 'css/css',
        extends: ['css/recommended'],
        rules: {
            // An !important is a deliberate exception, disabled with its reason at the site.
            'css/no-important': 'warn',

            // Baseline "newly available" rather than the rule's default "widely available"
            // (30 months behind): the dashboard targets current evergreen browsers, and
            // `scrollbar-gutter`, which keeps the MA item-ring grid centred and has no
            // substitute, is only newly available. "newly" still fails anything not in
            // Baseline at all; `user-select` is exempted at each call site.
            'css/use-baseline': ['warn', { available: 'newly' }],

            // Custom properties are declared in the foundation sheets and read everywhere
            // else; the rule only sees one file at a time, so an unknown variable is not
            // a finding. Property names and literal values are still validated.
            'css/no-invalid-properties': ['error', { allowUnknownVariables: true }],

            'no-restricted-syntax': [
                'error',
                ...fontSizeRestrictions,
                ...fontWeightRestrictions,
                ...textColorRestrictions,
                breakpointRestriction,
            ],
        },
    },
    {
        // Every rule sits in one of the five cascade layers and every `@import` names
        // one. The shared sheets are layered by the entry sheet that imports them, and the
        // packages' token default sheets by whichever consumer imports it (which sheet may
        // import which is tools/check-structure.mjs, `css-ownership`).
        files: ['src/**/*.css', 'packages/**/*.css'],
        ignores: [...listSharedSheets(), ...Object.values(tokenDefaultsSheets)],
        rules: {
            'css/use-layers': [
                'error',
                {
                    requireImportLayers: true,
                    layerNamePattern: `^(${cssLayerNames.join('|')})$`,
                },
            ],
        },
    },
    {
        // A later block replaces the rule's whole option list, so the slot rule carries
        // the font-size, font-weight, text-colour and breakpoint restrictions along.
        files: ['**/*.css'],
        ignores: [
            'src/styles/**',
            'packages/module-base/src/modules/contentModule.css',
            'packages/modules/styles/table-host.css',
        ],
        rules: {
            'no-restricted-syntax': [
                'error',
                ...fontSizeRestrictions,
                ...fontWeightRestrictions,
                ...textColorRestrictions,
                breakpointRestriction,
                slotRestriction,
            ],
        },
    },
]);
