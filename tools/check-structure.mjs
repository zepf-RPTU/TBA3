import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
    chartConfigFilePattern,
    listFiles,
    listUnitSources,
    readTextFile,
    repoRoot,
    toRelativePath,
} from './lib/moduleUnits.mjs';
import { h1LinesOf, headingsOf, sectionOf } from './lib/markdown.mjs';

const textExtensions = new Set(['.css', '.js', '.mjs', '.md']);
const failures = [];
// Most of the checks scan src/ plus the extracted packages; walk all three roots once.
// The packages are source we own and ship, so the structural rules — unit docs, one icon
// source, CSS ownership, comment altitude — follow the code there. What stays behind is
// tba3 house style: glossary-owned UI copy makes no sense for a consumer that passes
// literals.
const sourceRoots = ['src', 'packages/module-base/src', 'packages/modules/src'];
const sourceFiles = sourceRoots.flatMap((relativeRoot) =>
    listFiles(path.join(repoRoot, relativeRoot)),
);
/** Files under src/ only — for the rules that are about this product, not the kit. */
const appSourceFiles = listFiles(path.join(repoRoot, 'src'));

function splitLines(text) {
    return text.split(/\r?\n/);
}

function lineMatches(lines, pattern) {
    return lines
        .map((lineText, lineIndex) => ({ lineText, lineNumber: lineIndex + 1 }))
        .filter(({ lineText }) => pattern.test(lineText));
}

function findLineMatches(filePath, pattern) {
    return lineMatches(splitLines(readTextFile(filePath)), pattern);
}

/**
 * Walk a dot-path into a plain-object tree.
 * @param {object} tree - The root.
 * @param {string} dotPath - `a.b.c`.
 * @returns {unknown} The value at the path, or `undefined` when a segment is missing.
 */
function resolveDotPath(tree, dotPath) {
    let node = tree;
    for (const segment of dotPath.split('.')) {
        node = node && typeof node === 'object' ? node[segment] : undefined;
        if (node === undefined) return undefined;
    }
    return node;
}

function addFailure(ruleName, message) {
    failures.push({ ruleName, message });
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const cssLayerNames = ['vendor', 'foundation', 'common', 'modules', 'views'];
const cssLayerOrderStatement = `@layer ${cssLayerNames.join(', ')};`;
const cssEntrySheets = ['src/en/main.css', 'src/ma/main.css', 'src/sl/main.css', 'src/chooser.css'];
/** Shared sheets — entry-imported, not unit-owned — live here. */
const sharedStylesPrefix = 'src/styles/';
/** Owns the ContentModule shell slots; the shared table-host layout composes them too. */
const slotOwnerSheet = 'packages/module-base/src/modules/contentModule.css';
const cssFiles = sourceFiles.filter((filePath) => filePath.endsWith('.css'));

function isEntrySheet(filePath) {
    return cssEntrySheets.includes(toRelativePath(filePath));
}

function stripCssComments(text) {
    return text.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Unit-owned sheets may not target the ContentModule shell slots; those belong to the
 * slot owner and the shared sheets. Units add owner-local classes instead.
 */
function checkFeatureCssSlotSelectors() {
    const selectorPattern =
        /\.(?:content-module-(?:header|title|subtitle|body)|module-container)\b/;
    const isUnitSheet = (filePath) => {
        const relativePath = toRelativePath(filePath);
        return !relativePath.startsWith(sharedStylesPrefix) && relativePath !== slotOwnerSheet;
    };

    for (const filePath of cssFiles.filter(isUnitSheet)) {
        for (const match of findLineMatches(filePath, selectorPattern)) {
            addFailure(
                'feature-css-slot-selectors',
                `${toRelativePath(filePath)}:${match.lineNumber} targets a shared ContentModule slot: ${match.lineText.trim()}`,
            );
        }
    }
}

/**
 * Every sheet has exactly one way into the cascade. An entry sheet declares the layer
 * order and imports each shared sheet with `layer(...)`. Every other sheet is either
 * such a shared sheet, or a unit's own: `X.css` beside the `X.js` that emits its
 * classes, imported by that file alone, and consisting of exactly one `@layer` block —
 * never both, never neither. An unlayered rule would beat every layer.
 */
function checkCssOwnership() {
    const layeredImports = new Set();
    const entryImportPattern =
        /^\s*@import\s+(?:url\()?['"]([^'"]+)['"]\)?\s*(layer\((\w+)\))?\s*;/gm;

    for (const relativeEntry of cssEntrySheets) {
        const entryPath = path.join(repoRoot, relativeEntry);
        const text = stripCssComments(readTextFile(entryPath));
        if (!text.includes(cssLayerOrderStatement)) {
            addFailure(
                'css-ownership',
                `${relativeEntry} must declare the layer order "${cssLayerOrderStatement}"`,
            );
        }
        for (const [, specifier, layerClause, layerName] of text.matchAll(entryImportPattern)) {
            if (!layerClause || !cssLayerNames.includes(layerName)) {
                addFailure(
                    'css-ownership',
                    `${relativeEntry} imports '${specifier}' without a layer(...) from ${cssLayerNames.join('|')}`,
                );
            }
            if (specifier.startsWith('.')) {
                layeredImports.add(path.resolve(path.dirname(entryPath), specifier));
            }
        }
    }

    const importers = new Map(cssFiles.map((sheet) => [sheet, []]));
    const jsImportPattern = /^\s*import\s+['"](\.{1,2}\/[^'"]+\.css)['"];?/gm;
    for (const filePath of sourceFiles.filter((candidate) => candidate.endsWith('.js'))) {
        for (const match of readTextFile(filePath).matchAll(jsImportPattern)) {
            const target = path.resolve(path.dirname(filePath), match[1]);
            if (!importers.has(target)) {
                addFailure(
                    'css-ownership',
                    `${toRelativePath(filePath)} imports ${match[1]}, which is not a sheet under src/`,
                );
                continue;
            }
            importers.get(target).push(filePath);
        }
    }

    for (const sheet of cssFiles.filter((candidate) => !isEntrySheet(candidate))) {
        const relativeSheet = toRelativePath(sheet);
        const owners = importers.get(sheet) ?? [];
        if (layeredImports.has(sheet)) {
            for (const owner of owners) {
                addFailure(
                    'css-ownership',
                    `${relativeSheet} is a shared sheet (imported by an entry sheet) and may not also be imported by ${toRelativePath(owner)}`,
                );
            }
            continue;
        }
        const sibling = sheet.replace(/\.css$/, '.js');
        if (!fs.existsSync(sibling)) {
            addFailure(
                'css-ownership',
                `${relativeSheet} is neither imported by an entry sheet with layer(...) nor beside a ${path.basename(sibling)} that could own it`,
            );
            continue;
        }
        if (!owners.includes(sibling)) {
            addFailure(
                'css-ownership',
                `${toRelativePath(sibling)} must import './${path.basename(sheet)}'`,
            );
        }
        for (const other of owners.filter((owner) => owner !== sibling)) {
            addFailure(
                'css-ownership',
                `${toRelativePath(other)} imports ${relativeSheet}, which only its sibling ${path.basename(sibling)} may import`,
            );
        }
        // A chunk's CSS can reach the page before the entry sheet, and the first @layer
        // statement the browser sees fixes the order — so every unit sheet repeats it.
        const body = stripCssComments(readTextFile(sheet)).trim();
        const blockMatch = body.match(/^@layer ([\w, ]+);\s*@layer (\w+) \{([\s\S]*)\}$/);
        if (
            !blockMatch ||
            `@layer ${blockMatch[1]};` !== cssLayerOrderStatement ||
            !cssLayerNames.includes(blockMatch[2]) ||
            !isSingleBlock(blockMatch[3])
        ) {
            addFailure(
                'css-ownership',
                `${relativeSheet} must be "${cssLayerOrderStatement}" followed by exactly one "@layer <${cssLayerNames.join('|')}> { … }" block`,
            );
        }
    }
}

/**
 * @param {string} inner - The text between a block's outer braces.
 * @returns {boolean} Whether the braces inside balance without closing the outer block early.
 */
function isSingleBlock(inner) {
    let depth = 0;
    for (const character of inner) {
        if (character === '{') depth += 1;
        if (character === '}') {
            depth -= 1;
            if (depth < 0) return false;
        }
    }
    return depth === 0;
}

function checkChartConfigDescriptors() {
    const chartConfigFiles = sourceFiles.filter((filePath) =>
        chartConfigFilePattern.test(filePath),
    );

    for (const filePath of chartConfigFiles) {
        if (!readTextFile(filePath).includes('CONFIG DESCRIPTOR')) {
            addFailure(
                'chart-config-descriptor',
                `${toRelativePath(filePath)} is missing the CONFIG DESCRIPTOR section marker`,
            );
        }
    }
}

function checkLegacySlOverviewNames() {
    const legacyClassNames = [
        ['Base', 'Competency', 'Grid', 'Module'].join(''),
        ['Subject', 'Overview', 'Module'].join(''),
        ['Class', 'Overview', 'Module'].join(''),
    ];
    const legacyFileNames = [
        ['subjectOverviewModule', 'js'].join('.'),
        ['classOverviewModule', 'js'].join('.'),
    ];
    const legacyPrivateFields = [
        ['#subject', 'Overview', 'Module'].join(''),
        ['#class', 'Overview', 'Module'].join(''),
    ];
    const legacyPattern = new RegExp(
        `(?:\\b(?:${[...legacyClassNames, ...legacyFileNames].map(escapeRegExp).join('|')})\\b|${legacyPrivateFields.map(escapeRegExp).join('|')})`,
    );
    const scanRoots = ['src', 'docs'];

    for (const filePath of scanRoots
        .flatMap((relativePath) => listFiles(path.join(repoRoot, relativePath)))
        .filter((candidatePath) => textExtensions.has(path.extname(candidatePath)))) {
        for (const match of findLineMatches(filePath, legacyPattern)) {
            addFailure(
                'legacy-sl-overview-names',
                `${toRelativePath(filePath)}:${match.lineNumber} contains a legacy SL overview name: ${match.lineText.trim()}`,
            );
        }
    }
}

function checkTrackedSourceMarkers() {
    const markerPattern = /\b(?:TODO|FIXME|HACK)\b/;
    const trackedReferencePattern = /ASSUMPTION-/;

    for (const filePath of sourceFiles.filter((candidatePath) =>
        /\.(?:js|mjs|css)$/.test(candidatePath),
    )) {
        for (const match of findLineMatches(filePath, markerPattern)) {
            if (trackedReferencePattern.test(match.lineText)) {
                continue;
            }
            addFailure(
                'tracked-source-markers',
                `${toRelativePath(filePath)}:${match.lineNumber} has an untracked TODO/FIXME/HACK marker; reference an ASSUMPTION- ID: ${match.lineText.trim()}`,
            );
        }
    }
}

function checkCommentDocReferences() {
    // A comment must stand on its own: a pointer to a document rots silently, and
    // nothing resolves one at build time.
    // Runtime strings are exempt — a console.warn naming the payload contract is
    // addressed to whoever hit it, not to a reader of the source.
    const docReferencePattern = /\.md\b|\bdocs\//;
    const stringLiteralPattern = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g;

    for (const filePath of sourceFiles.filter((candidatePath) =>
        /\.(?:js|mjs|css)$/.test(candidatePath),
    )) {
        let insideBlockComment = false;

        readTextFile(filePath)
            .split(/\r?\n/)
            .forEach((lineText, index) => {
                // Mask string literals so a URL or a doc path inside one is not read as
                // a comment delimiter; same length, so offsets still index lineText.
                const masked = insideBlockComment
                    ? lineText
                    : lineText.replace(stringLiteralPattern, (literal) =>
                          ' '.repeat(literal.length),
                      );
                let commentText = '';
                let cursor = 0;

                while (cursor < masked.length || insideBlockComment) {
                    if (insideBlockComment) {
                        const end = masked.indexOf('*/', cursor);
                        if (end === -1) {
                            commentText += lineText.slice(cursor);
                            break;
                        }
                        commentText += lineText.slice(cursor, end + 2);
                        insideBlockComment = false;
                        cursor = end + 2;
                        continue;
                    }
                    const blockStart = masked.indexOf('/*', cursor);
                    const lineStart = masked.indexOf('//', cursor);
                    if (lineStart !== -1 && (blockStart === -1 || lineStart < blockStart)) {
                        commentText += lineText.slice(lineStart);
                        break;
                    }
                    if (blockStart === -1) break;
                    insideBlockComment = true;
                    cursor = blockStart + 2;
                }

                if (docReferencePattern.test(commentText)) {
                    addFailure(
                        'comment-doc-references',
                        `${toRelativePath(filePath)}:${index + 1} references a document from a comment; state the constraint instead: ${lineText.trim()}`,
                    );
                }
            });
    }
}

function checkBannerLabelNoise() {
    // A section banner earns its place by naming a domain section, or by marking a step
    // of the module file scan order (constructor/defaults -> event handlers -> base-hook
    // implementations -> lifecycle/update -> export/public API -> private helpers). A
    // banner that only names a language construct says what the declaration under it
    // already says.
    // A denylist, not an allowlist: domain banners are open-ended and stay unconstrained.
    const bannedTitles = new Set([
        'ACCESSORS',
        'ACCESSOR METHODS FOR SUBCLASSES',
        'ANIMATION FRAMES',
        'ASYNC SAFETY',
        'CALLBACKS',
        'CLEANUP',
        'CONFIGURATION DEFAULTS',
        'CORE PROPERTIES',
        'DESTROY',
        'DISPOSABLES',
        'DOCUMENT-LEVEL LISTENERS',
        'DOM LISTENERS',
        'EN-SPECIFIC COLUMN DEFINITIONS',
        'EN-SPECIFIC DATA PREPARATION',
        'EN-SPECIFIC METHODS',
        'EN-SPECIFIC MODE SWITCHING',
        'EN-SPECIFIC TABLE RENDERING',
        'GETTERS',
        'INTERNAL METHODS',
        'INTERNALS',
        'INVALIDATION',
        'JSDOC TYPE DEFINITIONS',
        'MA-SPECIFIC CONFIGURATION',
        'MA-SPECIFIC METHODS',
        'MA-SPECIFIC PUBLIC API',
        'MA-SPECIFIC TABLE RENDERING',
        'OVERRIDDEN METHODS',
        'OVERRIDES',
        'PERSISTENCE',
        'PRIVATE',
        'PRIVATE METHODS',
        'PRIVATE UPDATE METHODS',
        'PUBLIC METHODS FOR EXTERNAL CONTROL',
        'REGISTRATION',
        'RENDERING METHODS',
        'SETTERS',
        'SHARED CONSTANTS',
        'SHARED UTILITIES',
        'SINGLETON',
        'SINGLETON EXPORT',
        'SUBSCRIPTIONS',
        'TEARDOWN',
        'TIMEOUTS',
        'TYPE DEFINITIONS',
        'TYPES',
        'UTILITY',
        'UTILITY METHODS',
    ]);
    // A whole-line `//` comment whose text reads as a label rather than a sentence.
    const labelLinePattern = /^\s*\/\/\s*([A-Za-z][A-Za-z0-9 &/_.-]*?)(?:\s*\([^)]*\))?\s*$/;

    for (const filePath of sourceFiles.filter((candidatePath) => /\.js$/.test(candidatePath))) {
        readTextFile(filePath)
            .split(/\r?\n/)
            .forEach((lineText, index) => {
                const match = labelLinePattern.exec(lineText);
                if (!match) return;
                if (!bannedTitles.has(match[1].trim().toUpperCase())) return;
                addFailure(
                    'banner-label-noise',
                    `${toRelativePath(filePath)}:${index + 1} labels a section with a language construct; name the domain section or delete it: ${lineText.trim()}`,
                );
            });
    }
}

function checkUnitHeaderCeiling() {
    // A file header carries one paragraph: what this file is, plus the single fact a
    // reader needs before reading any function in it. Anything spanning more than one
    // function belongs in the unit's German <unitFile>.md beside the source.
    // The ceiling binds only where that .md exists — a file without one has no lower
    // altitude, and its header is the documentation.
    const maxHeaderLines = 8;

    for (const filePath of sourceFiles.filter((candidatePath) => /\.js$/.test(candidatePath))) {
        if (!fs.existsSync(filePath.replace(/\.js$/, '.md'))) continue;

        // A byte-order mark ahead of the opener would hide the header from this scan.
        const lines = readTextFile(filePath)
            .replace(/^\uFEFF/, '')
            .split(/\r?\n/);
        if (!lines[0]?.startsWith('/**')) continue;

        const closing = lines.findIndex((lineText) => lineText.includes('*/'));
        if (closing === -1) continue;

        const headerLines = closing + 1;
        if (headerLines <= maxHeaderLines) continue;

        addFailure(
            'unit-header-ceiling',
            `${toRelativePath(filePath)} has a ${headerLines}-line file header (max ${maxHeaderLines}); move what spans more than one function into ${path.basename(filePath).replace(/\.js$/, '.md')}`,
        );
    }
}

function checkConstantsMutableState() {
    // Data-derived config belongs on a per-instance builder (src/en/enConfig.js is
    // the reference implementation), not in module-level mutable registries.
    // Guard the anti-pattern's natural home: *Constants.js.
    // Reassignable bindings (let/var) plus const-bound mutable collections
    // (`const _reg = new Map()` — the shape of the removed _domainRegistry).
    const mutablePattern =
        /^(?:export\s+)?(?:let|var)\b|^(?:export\s+)?const\s+[\w$]+\s*=\s*new\s+(?:Map|Set|WeakMap|WeakSet)\b/;
    const constantsFiles = sourceFiles.filter((filePath) => /Constants\.js$/.test(filePath));

    for (const filePath of constantsFiles) {
        for (const match of findLineMatches(filePath, mutablePattern)) {
            addFailure(
                'constants-mutable-state',
                `${toRelativePath(filePath)}:${match.lineNumber} declares top-level mutable state in a *Constants.js file; derive per-instance config via a builder instead (see src/en/enConfig.js): ${match.lineText.trim()}`,
            );
        }
    }
}

// The glossary is the single source of UI copy.
// Two shapes overrode it in the past and are now rejected: a setTitle()/setSubtitle()
// call with a string literal (data-driven titles pass an expression), and a
// title/headerText/subtitle/description literal declared beside a glossary key —
// dead when the entry has a title, an override when it does not. A `subtitle`
// that starts with markup is dynamic content appended after the copy and passes.
// A chart host's key usually sits in its config file, out of sight of the call
// site, so the options passed to `new ChartHostModule(` are held to the same rule.
// A non-empty string literal opener: a quote not immediately closed again.
const literalStart = String.raw`(?:'(?!')|"(?!")|\`(?!\`))`;
const literalSetterPattern = new RegExp(String.raw`\.set(?:Title|Subtitle)\(\s*${literalStart}`);
const glossaryKeyLinePattern = /^\s*(?:glossaryKey|glossaryPath|navigationGlossaryPath):\s*['"]/;
const chartHostCallPattern = /\bnew ChartHostModule\(/;
const copyLiteralLinePattern = new RegExp(
    String.raw`^\s*(?:title|headerText|description):\s*${literalStart}|^\s*subtitle:\s*${literalStart}(?!<)`,
);

// The same rule reaches the strings the first two shapes missed: empty-state
// sentences (`placeholder:`, `noDataMessage:`, `showNoDataMessage('…')`), accessible
// names (`ariaLabel:`, `setAttribute('aria-label', '…')`, `aria-label="…"` in markup)
// and native confirm prompts. A template literal carrying `${` is data and passes.
const plainLiteralStart = String.raw`(?:'(?!')|"(?!")|\`(?![^\`]*\$\{))`;
const copyLiteralPattern = new RegExp(
    String.raw`^\s*(?:placeholder|noDataMessage|ariaLabel):\s*${plainLiteralStart}` +
        String.raw`|\.showNoDataMessage\(\s*${plainLiteralStart}` +
        String.raw`|setAttribute\(\s*['"]aria-label['"]\s*,\s*${plainLiteralStart}` +
        String.raw`|(?:window\.)?confirm\(\s*${plainLiteralStart}` +
        String.raw`|aria-label="(?!"|\$\{)`,
);
const copyLiteralExemptPattern = /[\\/]glossary[\\/]/;

function indentOf(lineText) {
    return lineText.length - lineText.trimStart().length;
}

function checkGlossaryCopyOwnership() {
    for (const filePath of appSourceFiles.filter((candidatePath) =>
        candidatePath.endsWith('.js'),
    )) {
        const lines = splitLines(readTextFile(filePath));
        for (const match of lineMatches(lines, literalSetterPattern)) {
            addFailure(
                'glossary-copy-ownership',
                `${toRelativePath(filePath)}:${match.lineNumber} sets copy from code; put it in the glossary entry: ${match.lineText.trim()}`,
            );
        }

        if (!copyLiteralExemptPattern.test(filePath)) {
            for (const match of lineMatches(lines, copyLiteralPattern)) {
                addFailure(
                    'glossary-copy-ownership',
                    `${toRelativePath(filePath)}:${match.lineNumber} carries UI copy as a literal; read it from the glossary: ${match.lineText.trim()}`,
                );
            }
        }

        const flaggedLines = new Set();
        lines.forEach((lineText, lineIndex) => {
            if (glossaryKeyLinePattern.test(lineText)) {
                // The enclosing object literal: every neighbouring line at the same or
                // deeper indentation, up to the braces that open and close it.
                const keyIndent = indentOf(lineText);
                const inBlock = (candidate) =>
                    candidate.trim() === '' || indentOf(candidate) >= keyIndent;
                for (const step of [-1, 1]) {
                    for (
                        let index = lineIndex + step;
                        index >= 0 && index < lines.length && inBlock(lines[index]);
                        index += step
                    ) {
                        if (copyLiteralLinePattern.test(lines[index])) flaggedLines.add(index);
                    }
                }
            }
            if (chartHostCallPattern.test(lineText)) {
                // The call's argument list: every following line indented deeper
                // than the `new` line, up to the closing `)`.
                const callIndent = indentOf(lineText);
                for (let index = lineIndex + 1; index < lines.length; index += 1) {
                    const candidate = lines[index];
                    if (candidate.trim() !== '' && indentOf(candidate) <= callIndent) break;
                    if (copyLiteralLinePattern.test(candidate)) flaggedLines.add(index);
                }
            }
        });
        for (const lineIndex of [...flaggedLines].sort((a, b) => a - b)) {
            addFailure(
                'glossary-copy-ownership',
                `${toRelativePath(filePath)}:${lineIndex + 1} declares copy beside a glossary key; the entry owns it: ${lines[lineIndex].trim()}`,
            );
        }
    }
}

// Every module unit documents itself in a German <unitFile>.md beside its source
// (docs/architecture.md, "Modul-Dokumentation"); what counts as a unit and its
// kind is defined by the scan in tools/lib/moduleUnits.mjs, shared with the docs
// generators. Renderers, controllers and helpers are not units and get no doc of
// their own. The required headings depend on the unit's kind and must appear in
// this order; the body of `Klassenhierarchie` is written by tools/docs-hierarchy.mjs.
const requiredDocHeadingsByKind = {
    content: ['Zweck', 'Design/Idee', 'Klassenhierarchie', 'Daten', 'Optionen', 'Methoden'],
    view: [
        'Zweck',
        'Design/Idee',
        'Klassenhierarchie',
        'Kinder',
        'Daten',
        'Zustand',
        'Verdrahtung',
        'Optionen',
        'Methoden',
    ],
    app: ['Zweck', 'Design/Idee', 'Klassenhierarchie', 'Views', 'Daten', 'Zustand', 'Hooks'],
};

// What `## Daten` holds per kind (packages/modules/docs/datenvertrag.md): the tables of
// the API spec parts the unit depends on, or the statement that it reads no API data.
// Only the format is checked; the field paths are not validated against the spec.
const noApiDataPattern = /^Keine API-Daten\./m;
const dataSectionFormatByKind = {
    content: (section) =>
        noApiDataPattern.test(section) ||
        (section.includes('| Endpunkt | Parameter | Felder |') &&
            (section.includes('| Endpunkt | Feld | Ohne das Feld |') ||
                section.includes('Keine optionalen Felder.'))),
    view: (section) =>
        noApiDataPattern.test(section) || section.includes('| Endpunkt | Parameter | Geht an |'),
    // BaseAppModule declares no requests of its own; every app subclass lists them.
    app: (section, unitNames) =>
        unitNames.includes('BaseAppModule') ||
        section.includes('| Anfrage | Parameter | Dokument | Schlüssel |'),
};

function checkModuleDocs() {
    for (const { docPath, units } of listUnitSources()) {
        const unitNames = units.map((unit) => unit.name);

        const relativeDoc = toRelativePath(docPath);
        if (!fs.existsSync(docPath)) {
            addFailure(
                'module-doc',
                `${relativeDoc} is missing; it must document ${unitNames.join(', ')}`,
            );
            continue;
        }
        const docText = readTextFile(docPath);
        const headings = headingsOf(docText);
        const requiredHeadings = [
            ...new Set(units.flatMap((unit) => requiredDocHeadingsByKind[unit.kind])),
        ];
        for (const heading of requiredHeadings) {
            if (!headings.has(heading)) {
                addFailure(
                    'module-doc',
                    `${relativeDoc} lacks the required heading '## ${heading}'`,
                );
            }
        }
        const presentOrder = [...headings].filter((heading) => requiredHeadings.includes(heading));
        const expectedOrder = requiredHeadings.filter((heading) => headings.has(heading));
        if (presentOrder.join('\n') !== expectedOrder.join('\n')) {
            addFailure(
                'module-doc',
                `${relativeDoc} orders its headings ${presentOrder.join(', ')}; expected ${expectedOrder.join(', ')}`,
            );
        }
        const dataSection = sectionOf(docText, 'Daten');
        for (const kind of new Set(units.map((unit) => unit.kind))) {
            if (headings.has('Daten') && !dataSectionFormatByKind[kind](dataSection, unitNames)) {
                addFailure(
                    'module-doc',
                    `${relativeDoc} has a '## Daten' that is neither the API-spec tables its kind (${kind}) requires nor 'Keine API-Daten.'`,
                );
            }
        }
        const h1Lines = h1LinesOf(docText);
        for (const name of unitNames) {
            if (!h1Lines.some((line) => new RegExp(String.raw`\b${name}\b`).test(line))) {
                addFailure('module-doc', `${relativeDoc} has no H1 naming ${name}`);
            }
        }
    }
}

function listGlossaryFragments() {
    return sourceFiles.filter((filePath) => filePath.endsWith('.glossary.json'));
}

function readGlossaryBarrels() {
    return ['en', 'ma', 'sl'].map((appId) => ({
        appId,
        filePath: path.join(repoRoot, 'src', appId, `${appId}Glossary.js`),
    }));
}

// Only namespaced dot-paths are checkable. Bare keys ('landesschnitt') are term
// lookups against shared.element_texts and `glossarySubKey` values index an
// entry's own element_texts — neither is a path into the tree.
const glossaryNamespaces = new Set(['en', 'ma', 'sl', 'general']);
const glossaryPathPatterns = [
    /\b(?:\w*[Gg]lossary(?:Path|Key)|\w*BasePath)\s*[:=]\s*['"]([^'"]+)['"]/g,
    /\b(?:getRequiredEntryText|getEntryText|loadInfoFromGlossary|createItemTablePresets)\(\s*['"]([^'"]+)['"]/g,
    // Tour steps a view appends by hand (classViewModule.customizeTourSteps).
    /\bpath:\s*['"]((?:en|ma|sl|general)\.[^'"]+)['"]/g,
];

async function checkGlossaryPathResolution() {
    const barrels = readGlossaryBarrels();
    const trees = {};

    for (const { appId, filePath } of barrels) {
        if (!fs.existsSync(filePath)) {
            addFailure('glossary-path-resolution', `${toRelativePath(filePath)} is missing`);
            return;
        }
        const barrelModule = await import(pathToFileURL(filePath).href);
        trees[appId] = barrelModule[`${appId}Glossary`];
    }
    // `general.*` is never fragmented, so any barrel carries the same copy.
    trees.general = trees.en;

    const barrelSources = new Map(
        barrels.map(({ appId, filePath }) => [appId, readTextFile(filePath)]),
    );

    // A fragment nobody imports is dead prose: it never reaches the tree, and the
    // module it belongs to silently falls back to 'MISSING FROM GLOSSARY'.
    for (const fragmentPath of listGlossaryFragments()) {
        const relativePath = toRelativePath(fragmentPath);
        // Match the exact specifier the owning barrel would use. Every app has a
        // views/welcome.glossary.json, so a basename match would count all three.
        // A fragment that moved into a package is imported by its package subpath;
        // the barrel stays in tba3 either way, because it is a mount table, not prose.
        const importCount = barrels.filter(({ appId }) => {
            const source = barrelSources.get(appId);
            const appPrefix = `src/${appId}/`;
            if (relativePath.startsWith(appPrefix)) {
                return source.includes(`'./${relativePath.slice(appPrefix.length)}'`);
            }
            const packagePrefix = `packages/modules/src/${appId}/`;
            if (relativePath.startsWith(packagePrefix)) {
                // A package card's fragment is mounted by the package's own map, which the
                // barrel spreads in whole — so the barrel must import that map, and the map
                // must import the fragment.
                const mountModule = path.join(
                    repoRoot,
                    packagePrefix,
                    `${appId}GlossaryFragments.js`,
                );
                return (
                    source.includes(`'@tba3/modules/glossary/${appId}'`) &&
                    fs.existsSync(mountModule) &&
                    readTextFile(mountModule).includes(
                        `'./${relativePath.slice(packagePrefix.length)}'`,
                    )
                );
            }
            return false;
        }).length;
        if (importCount !== 1) {
            addFailure(
                'glossary-path-resolution',
                `${relativePath} is imported by ${importCount} barrels; expected exactly 1`,
            );
        }
    }

    // Every literal path a module declares must resolve. Computed keys
    // (getLevelGlossaryKey(...), the sl.longitudinal ternary) are out of reach of a
    // static scan and stay covered by tests/e2e/tour.spec.js.
    for (const filePath of sourceFiles.filter(
        (candidatePath) =>
            candidatePath.endsWith('.js') &&
            !candidatePath.endsWith('Glossary.js') &&
            !candidatePath.endsWith('GlossaryFragments.js'),
    )) {
        const sourceText = readTextFile(filePath);

        for (const pattern of glossaryPathPatterns) {
            for (const match of sourceText.matchAll(pattern)) {
                const dotPath = match[1];
                const segments = dotPath.split('.');
                if (segments.length < 2 || !glossaryNamespaces.has(segments[0])) continue;

                if (resolveDotPath(trees[segments[0]], dotPath) === undefined) {
                    addFailure(
                        'glossary-path-resolution',
                        `${toRelativePath(filePath)} references '${dotPath}', which resolves to nothing`,
                    );
                }
            }
        }
    }
}

// Every UI icon is a Material Symbols glyph rendered through @tba3/module-base/utils/icons.js
// from the vendored path registry. The three systems it replaced — the icon font,
// emoji, and hand-written <svg> literals — must not creep back: they paint
// differently per platform, ignore the theme, or reflow on font load.
const iconFontPattern = /material-icons|Material Icons/;
const emojiPattern = /[\u{1F000}-\u{1FAFF}]|\u{FE0F}/u;
const svgLiteralPattern = /<svg\b/;
const commentLinePattern = /^\s*(?:\*|\/\/|\/\*)/;
const iconRegistryFile = path.join(repoRoot, 'packages', 'module-base', 'src', 'utils', 'icons.js');
const htmlEntryPoints = ['index.html', 'en/index.html', 'ma/index.html', 'sl/index.html'];

function checkIconSources() {
    const scannedFiles = [
        ...sourceFiles.filter((filePath) => /\.(?:js|css)$/.test(filePath)),
        ...htmlEntryPoints.map((relativePath) => path.join(repoRoot, relativePath)),
    ];

    for (const filePath of scannedFiles) {
        for (const match of findLineMatches(filePath, iconFontPattern)) {
            addFailure(
                'icon-sources',
                `${toRelativePath(filePath)}:${match.lineNumber} references the removed Material Icons font; render through @tba3/module-base/utils/icons.js: ${match.lineText.trim()}`,
            );
        }
        for (const match of findLineMatches(filePath, emojiPattern)) {
            addFailure(
                'icon-sources',
                `${toRelativePath(filePath)}:${match.lineNumber} uses an emoji as an icon; name a Material Symbols glyph instead: ${match.lineText.trim()}`,
            );
        }
        if (filePath.endsWith('.js') && filePath !== iconRegistryFile) {
            for (const match of findLineMatches(filePath, svgLiteralPattern)) {
                if (commentLinePattern.test(match.lineText)) continue;
                addFailure(
                    'icon-sources',
                    `${toRelativePath(filePath)}:${match.lineNumber} hand-writes <svg> markup; use iconSvg()/createIcon() from @tba3/module-base/utils/icons.js: ${match.lineText.trim()}`,
                );
            }
        }
    }
}

// The card base class must not reach the app layer. ContentModule resolves its
// export service from packages/module-base/src/modules/moduleRuntime.js, whose default is a
// no-op, so a host that registers nothing gets no export button and no export
// graph. Importing the export singleton back into a guarded entry would undo
// that silently: it compiles, the dashboards still work, and the closure quietly
// regrows the hash router, the competence palette and Tabulator — 39 files where
// 18 are needed. Only a closure check catches it, so this is that check.
const baseGuardedEntries = [
    'packages/module-base/src/modules/baseModule.js',
    'packages/module-base/src/modules/contentModule.js',
    'packages/modules/src/common/charts/host/chartHostModule.js',
];
// resizeService.js is deliberately NOT guarded: it is a dependency-free leaf, so
// it costs a card nothing, and a no-op default would silently stop charts
// re-rendering on resize. It is infrastructure, not one of our features.
const baseForbiddenPrefixes = ['src/common/export/'];
const baseForbiddenFiles = [
    'src/common/app/viewRouter.js',
    'packages/modules/src/common/glossary/glossaryAnnotator.js',
];
const baseForbiddenPackages = ['tabulator-tables', 'd3'];
const moduleSpecifierPattern = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

// A workspace package is source we own, so a closure has to walk into it rather than
// stopping at the bare specifier — otherwise moving a file behind a package name is
// enough to hide whatever it drags in. Mirrors each package's own `exports` map.
const workspacePackages = [
    {
        name: '@tba3/module-base',
        entry: 'packages/module-base/index.js',
        subpathRoot: 'packages/module-base/src',
    },
    {
        // No root barrel on purpose: a "." export would pull every subpath into one
        // graph and defeat the split the package exists for.
        name: '@tba3/modules',
        entry: null,
        subpathRoot: 'packages/modules/src',
    },
];

/**
 * Resolve a workspace package specifier to the file it names.
 * @param {string} specifier - The specifier as written in the import.
 * @returns {string|null} Repo-relative POSIX path, or null when the specifier names no workspace package.
 */
function workspaceSpecifierToFile(specifier) {
    for (const { name, entry, subpathRoot } of workspacePackages) {
        if (specifier === name) return entry;
        if (specifier.startsWith(`${name}/`)) {
            return `${subpathRoot}/${specifier.slice(name.length + 1)}`;
        }
    }
    return null;
}

function moduleSpecifiersOf(filePath) {
    const source = readTextFile(filePath)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
    return [...source.matchAll(moduleSpecifierPattern)].map((match) => match[1]);
}

/**
 * Every file and bare package a guarded entry reaches through its imports.
 * @param {string} entryRelativePath - Repo-relative path of the entry.
 * @returns {{files: Set<string>, packages: Set<string>}} The reachable source files (repo-relative, POSIX) and bare package names.
 */
function importClosureOf(entryRelativePath) {
    const files = new Set();
    const packages = new Set();
    const pending = [entryRelativePath];

    while (pending.length > 0) {
        const current = pending.pop();
        if (files.has(current)) continue;
        files.add(current);
        if (!current.endsWith('.js')) continue;

        for (const specifier of moduleSpecifiersOf(path.join(repoRoot, current))) {
            const workspaceFile = workspaceSpecifierToFile(specifier);
            if (workspaceFile) {
                if (fs.existsSync(path.join(repoRoot, workspaceFile))) pending.push(workspaceFile);
                continue;
            }
            if (!specifier.startsWith('.')) {
                packages.add(specifier);
                continue;
            }
            const resolved = path
                .normalize(path.join(path.dirname(current), specifier))
                .split(path.sep)
                .join('/');
            // A specifier that resolves to nothing is a typo elsewhere's problem;
            // this rule only reports what a real file drags in.
            if (fs.existsSync(path.join(repoRoot, resolved))) pending.push(resolved);
        }
    }

    return { files, packages };
}

// The package ships default values for the custom properties its sheets read, so a host
// with no design system still gets something legible. Two ways that rots: a sheet starts
// reading a token nobody defaults, or a default outlives the tba3 property it was copied
// from. Both are cheap to catch and invisible otherwise — a missing token renders as an
// unset colour, not as an error.
const modulesTokenDefaultsFile = 'packages/modules/styles/tokens.css';
const modulesTokenSources = [
    'src/styles/foundation/variables.css',
    'src/styles/foundation/responsive.css',
    'src/styles/foundation/typography.css',
    'src/styles/foundation/buttons.css',
    'src/styles/foundation/interactive.css',
    'src/styles/foundation/controls.css',
    'src/styles/foundation/layout-reset.css',
    // SL's own tokens: the SL tables' sheet reads them.
    'src/sl/variables.css',
];
// Stamped inline per element by a renderer, from data — a static default would be a lie.
const modulesRuntimeTokens = new Set([
    '--ks-band-color',
    '--ks-band-ink',
    '--control-preferred-width',
    '--distribution-share',
]);
const cssVarCallPattern = /var\(\s*(--[A-Za-z0-9-]+)\s*[,)]/g;
const cssVarDeclarationPattern = /^\s*(--[A-Za-z0-9-]+)\s*:\s*([^;]+);/gm;

function checkModulesTokenDefaults() {
    const defaultsPath = path.join(repoRoot, modulesTokenDefaultsFile);
    if (!fs.existsSync(defaultsPath)) {
        addFailure('modules-token-defaults', `${modulesTokenDefaultsFile} is missing`);
        return;
    }

    const defaults = new Map();
    for (const match of readTextFile(defaultsPath).matchAll(cssVarDeclarationPattern)) {
        defaults.set(match[1], match[2].trim());
    }

    const sheets = [
        ...listFiles(path.join(repoRoot, 'packages', 'modules', 'src')),
        ...listFiles(path.join(repoRoot, 'packages', 'modules', 'styles')),
    ].filter(
        (filePath) =>
            filePath.endsWith('.css') && toRelativePath(filePath) !== modulesTokenDefaultsFile,
    );

    const declaredBySheets = new Set();
    const readBySheets = new Map();
    for (const filePath of sheets) {
        const text = readTextFile(filePath);
        for (const match of text.matchAll(cssVarDeclarationPattern)) declaredBySheets.add(match[1]);
        for (const match of text.matchAll(cssVarCallPattern)) {
            if (!readBySheets.has(match[1])) readBySheets.set(match[1], toRelativePath(filePath));
        }
    }

    // Every token a sheet reads is defaulted somewhere the consumer gets: by the sheet
    // itself, by tokens.css, by an inline var() fallback, or by the renderer at runtime.
    for (const [token, sheet] of readBySheets) {
        if (declaredBySheets.has(token) || defaults.has(token) || modulesRuntimeTokens.has(token)) {
            continue;
        }
        addFailure(
            'modules-token-defaults',
            `${sheet} reads ${token}, which nothing defaults; add it to ${modulesTokenDefaultsFile}`,
        );
    }

    // Every default still names a property tba3 declares, so the two cannot drift apart
    // silently. A value written as var(--other) needs --other defaulted here too.
    const tba3Tokens = new Set();
    for (const source of modulesTokenSources) {
        const sourcePath = path.join(repoRoot, source);
        if (!fs.existsSync(sourcePath)) continue;
        for (const match of readTextFile(sourcePath).matchAll(cssVarDeclarationPattern)) {
            tba3Tokens.add(match[1]);
        }
    }
    for (const [token, value] of defaults) {
        if (!tba3Tokens.has(token)) {
            addFailure(
                'modules-token-defaults',
                `${modulesTokenDefaultsFile} defaults ${token}, which tba3's foundation sheets no longer declare`,
            );
        }
        for (const match of value.matchAll(cssVarCallPattern)) {
            if (!defaults.has(match[1]) && !modulesRuntimeTokens.has(match[1])) {
                addFailure(
                    'modules-token-defaults',
                    `${modulesTokenDefaultsFile} defaults ${token} as ${value}, but ${match[1]} is defaulted nowhere`,
                );
            }
        }
    }
}

// A workspace package must be self-contained: everything it needs is inside it or is a
// declared dependency. The boundary check above asks what a card drags in; this one asks
// the opposite question — whether each package still stands on its own. A relative
// specifier climbing out to `src/` compiles and runs here, because the repo is one tree,
// and breaks the moment anyone installs the package on its own. The allowed bare
// packages are read from the package's own manifest, so declaring a dependency is the
// one step that permits it.
function checkPackageBoundaries() {
    for (const { name, entry, subpathRoot } of workspacePackages) {
        const packageRoot = path.posix.dirname(subpathRoot);
        const manifest = JSON.parse(readTextFile(path.join(repoRoot, packageRoot, 'package.json')));
        const declared = new Set([
            ...Object.keys(manifest.dependencies ?? {}),
            ...Object.keys(manifest.peerDependencies ?? {}),
        ]);
        const sources = listFiles(path.join(repoRoot, subpathRoot)).map(toRelativePath);
        if (entry) sources.push(entry);

        for (const relativePath of sources) {
            if (!relativePath.endsWith('.js')) continue;

            for (const specifier of moduleSpecifiersOf(path.join(repoRoot, relativePath))) {
                if (!specifier.startsWith('.')) {
                    const packageName = specifier.startsWith('@')
                        ? specifier.split('/').slice(0, 2).join('/')
                        : specifier.split('/')[0];
                    if (packageName === name) {
                        addFailure(
                            'package-boundary',
                            `${relativePath} imports itself as '${specifier}'; inside the package the import is relative`,
                        );
                    } else if (!declared.has(packageName)) {
                        addFailure(
                            'package-boundary',
                            `${relativePath} imports '${specifier}'; declare it in ${packageRoot}/package.json or drop the import`,
                        );
                    }
                    continue;
                }

                const resolved = path.posix.normalize(
                    path.posix.join(path.posix.dirname(relativePath), specifier),
                );
                if (!resolved.startsWith(`${packageRoot}/`)) {
                    addFailure(
                        'package-boundary',
                        `${relativePath} reaches ${resolved}, outside the package; a consumer installing ${name} would not have it`,
                    );
                }
            }
        }
    }
}

// The app is the packages' first consumer, and the only one whose imports we can see. If
// it reaches past the curated entry points, nothing keeps those honest: an entry can go
// stale, or miss the helper a module needs, and no build here would notice. So src/ and
// the HTML entry points get the same front door an installed consumer has — the specifiers
// each package's `exports` map names outright. The `./*` and `./styles/*` fallbacks stay
// for tests and for a fork adapting a copy, which is why they are matched by pattern and
// not listed here.
function curatedSpecifiersOf() {
    const specifiers = new Set();
    for (const { name, subpathRoot } of workspacePackages) {
        const packageRoot = path.posix.dirname(subpathRoot);
        const manifest = JSON.parse(readTextFile(path.join(repoRoot, packageRoot, 'package.json')));
        specifiers.add(name);
        for (const key of Object.keys(manifest.exports ?? {})) {
            if (key.includes('*')) continue;
            specifiers.add(key === '.' ? name : `${name}${key.slice(1)}`);
        }
    }
    return specifiers;
}

function checkAppPublicImports() {
    const curated = curatedSpecifiersOf();
    const scanned = [
        ...appSourceFiles.filter((filePath) => /\.(?:js|mjs)$/.test(filePath)),
        ...htmlEntryPoints.map((relativePath) => path.join(repoRoot, relativePath)),
    ];

    for (const filePath of scanned) {
        for (const specifier of moduleSpecifiersOf(filePath)) {
            if (!specifier.startsWith('@tba3/')) continue;
            if (curated.has(specifier)) continue;
            addFailure(
                'app-public-imports',
                `${toRelativePath(filePath)} imports '${specifier}'; the app may only use the entry points the package's exports map names`,
            );
        }
    }
}

function checkModuleBaseBoundary() {
    for (const entry of baseGuardedEntries) {
        const { files, packages } = importClosureOf(entry);

        for (const reached of files) {
            const forbidden =
                baseForbiddenPrefixes.some((prefix) => reached.startsWith(prefix)) ||
                baseForbiddenFiles.includes(reached);
            if (forbidden) {
                addFailure(
                    'module-base-boundary',
                    `${entry} reaches ${reached}; resolve it through packages/module-base/src/modules/moduleRuntime.js instead of importing it`,
                );
            }
        }

        for (const packageName of baseForbiddenPackages) {
            if (packages.has(packageName)) {
                addFailure(
                    'module-base-boundary',
                    `${entry} reaches the '${packageName}' package; a card must not carry it`,
                );
            }
        }
    }
}

checkFeatureCssSlotSelectors();
checkCssOwnership();
checkChartConfigDescriptors();
checkLegacySlOverviewNames();
checkTrackedSourceMarkers();
checkCommentDocReferences();
checkBannerLabelNoise();
checkUnitHeaderCeiling();
checkConstantsMutableState();
checkGlossaryCopyOwnership();
checkIconSources();
checkModuleDocs();
checkModuleBaseBoundary();
checkPackageBoundaries();
checkAppPublicImports();
checkModulesTokenDefaults();
await checkGlossaryPathResolution();

if (failures.length > 0) {
    console.error('Structure checks failed:');
    for (const failure of failures) {
        console.error(`- [${failure.ruleName}] ${failure.message}`);
    }
    process.exitCode = 1;
} else {
    console.log('Structure checks passed.');
}
