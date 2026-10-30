import { describe, expect, it } from 'vitest';
import { runStructureRules, structureRules } from '../../../tools/check-structure.mjs';
import { memoryRepo } from './support/memoryRepo.js';

// Each structure rule runs against an in-memory tree: the clean tree every rule passes,
// plus the few files a case is about — one tree the rule passes, one it fails.

const LAYERS = '@layer vendor, foundation, common, modules, views;';

/**
 * @param {unknown} value
 * @returns {string}
 */
const json = (value) => JSON.stringify(value);

/** The manifests, entry sheets, entry pages and token sheets the rules read; it passes them all. */
const cleanTree = {
    'package.json': json({ workspaces: ['packages/*'] }),
    'packages/module-base/package.json': json({ name: '@tba3/module-base', files: ['src'] }),
    'packages/modules/package.json': json({
        name: '@tba3/modules',
        files: ['src', 'styles'],
        dependencies: { '@tba3/module-base': '*' },
    }),
    'packages/module-base/src/styles/tokens.css': ':root {\n}',
    'packages/modules/styles/tokens.css': ':root {\n}',
    'src/en/main.css': LAYERS,
    'src/ma/main.css': LAYERS,
    'src/sl/main.css': LAYERS,
    'src/chooser.css': LAYERS,
    'src/styles/app.css': LAYERS,
    'index.html': '<main></main>',
    'en/index.html': '<main></main>',
    'ma/index.html': '<main></main>',
    'sl/index.html': '<main></main>',
};

const unitSheet = `${LAYERS}\n@layer modules {\n    .card {\n        color: red;\n    }\n}`;

/**
 * @param {number} lineCount - The header's lines, opener and closer included.
 * @returns {string} A script with that header.
 */
const scriptWithHeader = (lineCount) =>
    [
        '/**',
        ...Array.from({ length: lineCount - 2 }, (_, index) => ` * Line ${index + 1}.`),
        ' */',
        'export const value = 1;',
    ].join('\n');

/**
 * @param {string} name - The unit.
 * @param {string} data - The body of `## Daten`.
 * @returns {string} A content unit's doc.
 */
const contentDoc = (name, data) => [`# ${name}`, '## Daten', data].join('\n\n');

const mountedGlossary = {
    'src/en/enGlossary.js': [
        "import itemGlossary from './views/item.glossary.json' with { type: 'json' };",
        "import { enGlossaryFragments } from '@tba3/modules/glossary/en';",
    ].join('\n'),
    'src/en/views/item.glossary.json': '{}',
    'packages/modules/src/en/enGlossaryFragments.js':
        "import cardGlossary from './modules/card.glossary.json' with { type: 'json' };",
    'packages/modules/src/en/modules/card.glossary.json': '{}',
    'packages/modules/src/en/modules/cardModule.js': "static glossaryKey = 'general.legend';",
};

/**
 * @typedef {object} RuleCase
 * @property {string} id - The rule.
 * @property {{[file: string]: string}} passing - Added to the clean tree; the rule passes.
 * @property {{[file: string]: string}} failing - Added to the clean tree; the rule fails.
 * @property {string[]} failures - What it reports for `failing`, in order.
 * @property {Parameters<typeof memoryRepo>[1]} [ports]
 */

/** @type {RuleCase[]} */
const ruleCases = [
    {
        id: 'css-ownership',
        // A shared sheet, and a unit sheet its sibling imports.
        passing: {
            'src/styles/app.css': `${LAYERS}\n@import './shared.css' layer(common);`,
            'src/styles/shared.css': '.shared {\n}',
            'src/en/card.js': "import './card.css';",
            'src/en/card.css': unitSheet,
        },
        // A unit sheet outside one layer block, an orphan, a shared sheet a unit imports.
        failing: {
            'src/styles/app.css': `${LAYERS}\n@import './shared.css' layer(common);`,
            'src/styles/shared.css': '.shared {\n}',
            'src/en/card.js': "import './card.css';\nimport '../styles/shared.css';",
            'src/en/card.css': '.card {\n    color: red;\n}',
            'src/en/stray.css': unitSheet,
        },
        failures: [
            `src/en/card.css must be "${LAYERS}", any "@import '…' layer(vendor);", then exactly one "@layer <vendor|foundation|common|modules|views> { … }" block`,
            'src/en/stray.css is neither imported by an entry sheet nor beside a stray.js that could own it',
            'src/styles/shared.css is a shared sheet (imported by an entry sheet) and may not also be imported by src/en/card.js',
        ],
    },
    {
        id: 'scheme-tokens',
        // The hook in module-base's token sheet.
        passing: {
            'packages/module-base/src/styles/tokens.css':
                ":root[data-color-scheme='dark'] {\n    color-scheme: dark;\n}",
        },
        // A rule keyed on the attribute in a sheet a package publishes.
        failing: { 'packages/modules/styles/card.css': "[data-color-scheme='dark'] .card {\n}" },
        failures: [
            'packages/modules/styles/card.css keys a rule on data-color-scheme; declare the token as light-dark(<light>, <dark>) instead',
        ],
    },
    {
        id: 'package-side-effects',
        // A registering module its pattern names.
        passing: {
            'packages/modules/package.json': json({
                name: '@tba3/modules',
                files: ['src', 'styles'],
                sideEffects: ['*.css', 'src/**/*Module.js'],
            }),
            'packages/modules/src/cardModule.js':
                "export class CardModule {}\ncustomElements.define('tba-card', CardModule);",
        },
        // In a third workspace package: a script with a top-level call, one imported
        // bare, and an entry matching nothing.
        failing: {
            'packages/extra/package.json': json({
                name: '@tba3/extra',
                files: ['src'],
                sideEffects: ['src/gone.js'],
            }),
            'packages/extra/src/index.js': "import './setup.js';",
            'packages/extra/src/plugins.js': 'Tabulator.registerModule(plugins);',
            'packages/extra/src/setup.js': 'export const ready = true;',
        },
        failures: [
            'packages/extra/src/plugins.js runs code on import but is not in packages/extra/package.json sideEffects',
            'packages/extra/src/setup.js runs code on import but is not in packages/extra/package.json sideEffects',
            'packages/extra/package.json sideEffects lists src/gone.js, which matches no file',
        ],
    },
    {
        id: 'tracked-source-markers',
        passing: { 'src/en/card.css': '/* TODO ASSUMPTION-7: the grid gap */\n.card {\n}' },
        failing: { 'src/en/card.css': '.card {\n}\n/* TODO: tidy */' },
        failures: [
            'src/en/card.css:3 has an untracked TODO/FIXME/HACK marker; reference an ASSUMPTION- ID: /* TODO: tidy */',
        ],
    },
    {
        id: 'comment-doc-references',
        passing: { 'src/en/card.css': '/* The gap matches the grid. */\n.card {\n}' },
        failing: { 'src/en/card.css': '/* See docs/architecture.md. */\n.card {\n}' },
        failures: [
            'src/en/card.css:1 references a document from a comment; state the constraint instead',
        ],
    },
    {
        id: 'unit-header-ceiling',
        // Eight lines beside a doc; any length without one.
        passing: {
            'src/en/short.js': scriptWithHeader(8),
            'src/en/short.md': '# short',
            'src/en/undocumented.js': scriptWithHeader(12),
        },
        failing: { 'src/en/long.js': scriptWithHeader(9), 'src/en/long.md': '# long' },
        failures: [
            'src/en/long.js has a 9-line file header (max 8); move what spans more than one function into long.md',
        ],
    },
    {
        id: 'icon-sources',
        passing: {
            'src/en/card.css': ".card::before {\n    font-family: 'Material Symbols Outlined';\n}",
        },
        // An emoji in a sheet, the icon font in an entry page.
        failing: {
            'src/en/card.css': ".card::before {\n    content: '\u{1F389}';\n}",
            'en/index.html': '<main>\n<span class="material-icons">home</span>\n</main>',
        },
        failures: [
            "src/en/card.css:2 uses an emoji as an icon; name a Material Symbols glyph instead: content: '\u{1F389}';",
            'en/index.html:2 references the removed Material Icons font; render through createIcon()/iconSvg() of @tba3/module-base: <span class="material-icons">home</span>',
        ],
    },
    {
        id: 'no-knip-skip-tag',
        // Only scripts carry exports; a unit doc may name a tag.
        passing: {
            'src/en/card.js': '/** A card. */\nexport const card = 1;',
            'src/en/card.md': 'A tag such as @public stays out of the scripts.',
        },
        failing: {
            'src/en/card.js': 'export const card = 1;\n/** @public */\nexport const deck = 2;',
        },
        failures: [
            'src/en/card.js:2 carries a JSDoc tag knip skips the export for, so an unused or test-only export would pass',
        ],
    },
    {
        id: 'element-tag',
        // A concrete module with its derived tag, over a base defining none.
        passing: {
            'src/en/baseCardModule.js': 'export class BaseCardModule extends ContentModule {}',
            'src/en/cardModule.js':
                "export class CardModule extends BaseCardModule {}\ncustomElements.define('tba-card', CardModule);",
        },
        failing: {
            'src/en/baseCardModule.js':
                "export class BaseCardModule extends ContentModule {}\ncustomElements.define('tba-base-card', BaseCardModule);",
            'src/en/cardModule.js':
                "export class CardModule extends BaseCardModule {}\ncustomElements.define('tba-card-module', CardModule);",
        },
        failures: [
            'src/en/baseCardModule.js defines a tag for BaseCardModule, a base other modules extend; only concrete modules are elements of their own',
            "src/en/cardModule.js must define CardModule as 'tba-card' (customElements.define('tba-card', CardModule))",
        ],
    },
    {
        id: 'module-doc',
        // A content doc without API data, one with both field tables, one with sections of
        // the author's own, and a header control, which needs no doc.
        passing: {
            'src/en/baseListModule.js': 'export class BaseListModule extends ContentModule {}',
            'src/en/baseListModule.md': [
                '# BaseListModule',
                '## Methoden',
                '## Daten',
                'Keine API-Daten.',
                '## Notizen',
            ].join('\n\n'),
            'src/en/sortedListModule.js': 'export class SortedListModule extends BaseListModule {}',
            'src/en/sortedListModule.md': contentDoc('SortedListModule', 'Keine API-Daten.'),
            'src/common/modules/controls/pickerModule.js':
                'export class PickerModule extends BaseModule {}',
            'src/en/cardModule.js': 'export class CardModule extends ContentModule {}',
            'src/en/cardModule.md': contentDoc('CardModule', 'Keine API-Daten.'),
            'src/en/listModule.js': 'export class ListModule extends ContentModule {}',
            'src/en/listModule.md': contentDoc(
                'ListModule',
                [
                    '| Endpunkt | Parameter | Felder |',
                    '|---|---|---|',
                    '| `items` | `type=students` | `id` |',
                    '',
                    'Keine optionalen Felder.',
                ].join('\n'),
            ),
        },
        // A field table of a shape the endpoint page cannot place, a doc without the
        // heading the endpoint page reads, and a missing doc.
        failing: {
            'src/en/gridModule.js': 'export class GridModule extends ContentModule {}',
            'src/en/gridModule.md': '# GridModule\n\n## Zweck',
            'src/en/cardModule.js': 'export class CardModule extends ContentModule {}',
            'src/en/cardModule.md': contentDoc(
                'CardModule',
                [
                    '| Endpunkt | Parameter | Felder | Hinweis |',
                    '|---|---|---|---|',
                    '| `items` | `type=students` | `id` | – |',
                ].join('\n'),
            ),
            'src/en/listModule.js': 'export class ListModule extends ContentModule {}',
        },
        failures: [
            "src/en/cardModule.md has a '## Daten' that is neither the API-spec tables its kind (content) requires nor 'Keine API-Daten.'",
            'src/en/cardModule.md has an Endpunkt table of unknown shape: | Endpunkt | Parameter | Felder | Hinweis |',
            "src/en/gridModule.md lacks the required heading '## Daten'",
            'src/en/listModule.md is missing; it must document ListModule',
        ],
    },
    {
        id: 'token-defaults',
        // Reads defaulted below, inline, at runtime or by the package itself; and a third
        // package that reads no token, so needs no sheet.
        passing: {
            'packages/module-base/src/styles/tokens.css': ':root {\n    --mb-gap: 4px;\n}',
            'packages/module-base/src/card.css': '.card {\n    gap: var(--mb-gap);\n}',
            'packages/modules/styles/tokens.css': ':root {\n    --m-ink: var(--mb-gap);\n}',
            'packages/modules/styles/list.css':
                '.list {\n    color: var(--m-ink);\n    margin: var(--mb-gap);\n    padding: var(--m-pad, 2px);\n    width: var(--m-bar);\n}',
            'packages/modules/src/bar.js': "node.style.setProperty('--m-bar', width);",
            'packages/extra/package.json': json({ name: '@tba3/extra', files: ['src'] }),
            'packages/extra/src/util.js': 'export const one = 1;',
        },
        // A read only a higher package defaults, one nothing defaults, a stale default and
        // a default the lower package already has.
        failing: {
            'packages/module-base/src/styles/tokens.css':
                ':root {\n    --mb-gap: 4px;\n    --mb-stale: 1px;\n}',
            'packages/module-base/src/card.css':
                '.card {\n    gap: var(--mb-gap);\n    color: var(--m-ink);\n    border-color: var(--mb-unset);\n}',
            'packages/modules/styles/tokens.css':
                ':root {\n    --m-ink: black;\n    --mb-gap: 2px;\n}',
            'packages/modules/styles/list.css':
                '.list {\n    color: var(--m-ink);\n    gap: var(--mb-gap);\n}',
        },
        failures: [
            'packages/module-base/src/card.css reads --m-ink, which only packages/modules/styles/tokens.css defaults; move it to packages/module-base/src/styles/tokens.css',
            'packages/module-base/src/card.css reads --mb-unset, which nothing defaults; add it to packages/module-base/src/styles/tokens.css',
            'packages/module-base/src/styles/tokens.css defaults --mb-stale, which no package sheet or script reads',
            'packages/modules/styles/tokens.css defaults --mb-gap, which packages/module-base/src/styles/tokens.css already defaults',
        ],
    },
    {
        id: 'glossary-path-resolution',
        // Fragments the barrel or the package's mount map imports, paths that resolve.
        passing: {
            ...mountedGlossary,
            'src/en/views/itemView.js': "const options = { glossaryPath: 'en.item.header' };",
        },
        // Fragments nobody mounts, a path into nothing.
        failing: {
            ...mountedGlossary,
            'src/en/views/itemView.js': "const options = { glossaryPath: 'en.item.missing' };",
            'src/en/views/orphan.glossary.json': '{}',
            'packages/modules/src/en/modules/loose.glossary.json': '{}',
        },
        failures: [
            'src/en/views/orphan.glossary.json is imported by 0 barrels; expected exactly 1',
            'packages/modules/src/en/modules/loose.glossary.json is imported by 0 barrels; expected exactly 1',
            "src/en/views/itemView.js references 'en.item.missing', which resolves to nothing",
        ],
        ports: {
            modules: {
                'src/en/enGlossary.js': {
                    enGlossary: {
                        en: { item: { header: { title: 'Aufgaben' } } },
                        general: { legend: { title: 'Legende' } },
                    },
                },
            },
        },
    },
];

/**
 * @param {string} id - A rule id.
 * @param {{[file: string]: string}} files - Added to the clean tree, or replacing its files.
 * @param {Parameters<typeof memoryRepo>[1]} [ports]
 * @returns {Promise<string[]>} The rule's failures.
 */
async function failuresOf(id, files, ports) {
    const rule = structureRules.find((candidate) => candidate.id === id);
    if (!rule) throw new Error(`no structure rule ${id}`);
    return rule.check(memoryRepo({ ...cleanTree, ...files }, ports));
}

describe('tools/check-structure', () => {
    it('has a case for every rule', () => {
        expect(ruleCases.map(({ id }) => id)).toEqual(structureRules.map(({ id }) => id));
    });

    it('passes the clean tree and reports a failure under its rule id', async () => {
        expect(await runStructureRules(memoryRepo(cleanTree))).toEqual([]);
        const tree = {
            ...cleanTree,
            'src/en/card.js': "import './card.css';",
            'src/en/card.css': `${LAYERS}\n@layer modules {\n    [data-color-scheme='dark'] .card {\n    }\n}`,
        };
        expect(await runStructureRules(memoryRepo(tree))).toEqual([
            {
                rule: 'scheme-tokens',
                message:
                    'src/en/card.css keys a rule on data-color-scheme; declare the token as light-dark(<light>, <dark>) instead',
            },
        ]);
    });

    describe.each(ruleCases)('$id', ({ id, passing, failing, failures, ports }) => {
        it('passes its passing tree', async () => {
            expect(await failuresOf(id, passing, ports)).toEqual([]);
        });

        it('reports exactly the failures of its failing tree', async () => {
            expect(await failuresOf(id, failing, ports)).toEqual(failures);
        });
    });
});
