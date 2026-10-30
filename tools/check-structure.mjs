/**
 * The cross-file structural rules: what one file owes another. Per-file rules are lint
 * rules in config/oxlintPlugin.mjs and config/eslint.config.mjs; import boundaries are
 * dependency-cruiser rules in config/dependency-cruiser.mjs.
 *
 * Each rule reads the repository through a `Repo` (tools/lib/repo.mjs) and returns its
 * failures; `node tools/check-structure.mjs` runs them all against the working tree.
 */
import path from 'node:path';
import { resolveDotPath } from '@tba3/module-base/glossary';
import { diskRepo, listSourceFiles, workspacePackages } from './lib/repo.mjs';
import { listUnitSources } from './lib/moduleUnits.mjs';
import { readUnitDocs, unitDocFailures } from './lib/unitDocs.mjs';
import {
    DOC_REFERENCE_PATTERN,
    EMOJI_PATTERN,
    ICON_FONT_PATTERN,
    isUntrackedMarker,
} from './lib/sourcePatterns.mjs';
import {
    breakpointsSheet,
    cssEntrySheets,
    cssLayerNames,
    listSharedSheets,
    tokenDefaultsSheets,
} from './lib/cssSheets.mjs';

/** @typedef {import('./lib/repo.mjs').Repo} Repo */

/**
 * @typedef {object} StructureRule
 * @property {string} id - What a failure is reported under.
 * @property {(repo: Repo) => string[] | Promise<string[]>} check - Its failures, each naming
 *   the file.
 */

/**
 * @param {string} text
 * @returns {string[]} Its lines, either line ending.
 */
function splitLines(text) {
    return text.split(/\r?\n/);
}

/**
 * @param {string} text - A file's text.
 * @param {RegExp} pattern - Tested per line.
 * @returns {{ lineText: string, lineNumber: number }[]} The matching lines, 1-based.
 */
function findLineMatches(text, pattern) {
    return splitLines(text)
        .map((lineText, lineIndex) => ({ lineText, lineNumber: lineIndex + 1 }))
        .filter(({ lineText }) => pattern.test(lineText));
}

/**
 * @param {Repo} repo
 * @returns {string[]} The stylesheets the rules govern.
 */
function listCssFiles(repo) {
    return listSourceFiles(repo).filter((filePath) => filePath.endsWith('.css'));
}

/**
 * @param {Repo} repo
 * @returns {string[]} The scripts the rules govern.
 */
function listScripts(repo) {
    return listSourceFiles(repo).filter((filePath) => filePath.endsWith('.js'));
}

const cssLayerOrderStatement = `@layer ${cssLayerNames.join(', ')};`;

/**
 * @param {string} text - A stylesheet.
 * @returns {string}
 */
function stripCssComments(text) {
    return text.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Every sheet has exactly one way into the cascade. An entry sheet declares the layer
 * order and imports each shared sheet with `layer(...)` (the layer's presence and name
 * are ESLint's `css/use-layers`). Every other sheet is either such a shared sheet, or a
 * unit's own: `X.css` beside the `X.js` that emits its classes, imported by that file
 * alone, and consisting of exactly one `@layer` block (after any vendor sheets it
 * imports into `layer(vendor)`) — never both, never neither. An unlayered rule would
 * beat every layer.
 * @param {Repo} repo
 * @returns {string[]}
 */
function checkCssOwnership(repo) {
    /** @type {string[]} */
    const failures = [];
    for (const entry of cssEntrySheets) {
        if (!stripCssComments(repo.readText(entry)).includes(cssLayerOrderStatement)) {
            failures.push(`${entry} must declare the layer order "${cssLayerOrderStatement}"`);
        }
    }
    const sharedSheets = new Set([
        ...listSharedSheets(repo),
        ...Object.values(tokenDefaultsSheets),
        breakpointsSheet,
    ]);

    const cssFiles = listCssFiles(repo);
    /** @type {Map<string, string[]>} */
    const importers = new Map(cssFiles.map((sheet) => [sheet, []]));
    const jsImportPattern = /^\s*import\s+['"](\.{1,2}\/[^'"]+\.css)['"];?/gm;
    for (const filePath of listScripts(repo)) {
        for (const match of repo.readText(filePath).matchAll(jsImportPattern)) {
            const target = path.posix.join(path.posix.dirname(filePath), match[1]);
            if (!importers.has(target)) {
                failures.push(
                    `${filePath} imports ${match[1]}, which names no sheet the structure rules govern`,
                );
                continue;
            }
            importers.get(target)?.push(filePath);
        }
    }

    for (const sheet of cssFiles.filter((candidate) => !cssEntrySheets.includes(candidate))) {
        const owners = importers.get(sheet) ?? [];
        if (sharedSheets.has(sheet)) {
            for (const owner of owners) {
                failures.push(
                    `${sheet} is a shared sheet (imported by an entry sheet) and may not also be imported by ${owner}`,
                );
            }
            continue;
        }
        const sibling = sheet.replace(/\.css$/, '.js');
        if (!repo.exists(sibling)) {
            failures.push(
                `${sheet} is neither imported by an entry sheet nor beside a ${path.posix.basename(sibling)} that could own it`,
            );
            continue;
        }
        if (!owners.includes(sibling)) {
            failures.push(`${sibling} must import './${path.posix.basename(sheet)}'`);
        }
        for (const other of owners.filter((owner) => owner !== sibling)) {
            failures.push(
                `${other} imports ${sheet}, which only its sibling ${path.posix.basename(sibling)} may import`,
            );
        }
        // A chunk's CSS can reach the page before the entry sheet, and the first @layer
        // statement the browser sees fixes the order — so every unit sheet repeats it.
        const body = stripCssComments(repo.readText(sheet)).trim();
        // Between the two, a unit may import a vendor sheet only it needs (the notes
        // drawer's Quill theme), so the sheet travels in the unit's lazy chunk.
        const blockMatch = body.match(
            /^@layer ([\w, ]+);\s*(?:@import '[^']+' layer\(vendor\);\s*)*@layer (\w+) \{([\s\S]*)\}$/,
        );
        if (
            !blockMatch ||
            `@layer ${blockMatch[1]};` !== cssLayerOrderStatement ||
            !cssLayerNames.includes(blockMatch[2]) ||
            !isSingleBlock(blockMatch[3])
        ) {
            failures.push(
                `${sheet} must be "${cssLayerOrderStatement}", any "@import '…' layer(vendor);", then exactly one "@layer <${cssLayerNames.join('|')}> { … }" block`,
            );
        }
    }
    return failures;
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

/** @type {WeakMap<Repo, { location: string, text: string }[]>} */
const cssCommentsByRepo = new WeakMap();

/**
 * @param {Repo} repo
 * @returns {{ location: string, text: string }[]} Every stylesheet comment, with the
 *   `file:line` it starts on.
 */
function listCssComments(repo) {
    let comments = cssCommentsByRepo.get(repo);
    if (!comments) {
        comments = listCssFiles(repo).flatMap((filePath) => {
            const text = repo.readText(filePath);
            let line = 1;
            let scanned = 0;
            return [...text.matchAll(/\/\*[\s\S]*?\*\//g)].map((match) => {
                for (; scanned < match.index; scanned++) if (text[scanned] === '\n') line++;
                return { location: `${filePath}:${line}`, text: match[0] };
            });
        });
        cssCommentsByRepo.set(repo, comments);
    }
    return comments;
}

/**
 * A stylesheet's TODO/FIXME/HACK names the ASSUMPTION-<id> it rests on. JS comments are
 * the lint rule of the same name.
 * @param {Repo} repo
 * @returns {string[]}
 */
function checkCssMarkers(repo) {
    return listCssComments(repo).flatMap(({ location, text }) =>
        text
            .split('\n')
            .filter(isUntrackedMarker)
            .map(
                (line) =>
                    `${location} has an untracked TODO/FIXME/HACK marker; reference an ASSUMPTION- ID: ${line.trim()}`,
            ),
    );
}

/**
 * No stylesheet comment points at a document. JS comments are the lint rule of the same
 * name.
 * @param {Repo} repo
 * @returns {string[]}
 */
function checkCssDocReferences(repo) {
    return listCssComments(repo)
        .filter(({ text }) => DOC_REFERENCE_PATTERN.test(text))
        .map(
            ({ location }) =>
                `${location} references a document from a comment; state the constraint instead`,
        );
}

/**
 * A file header carries one paragraph: what this file is, plus the single fact a reader
 * needs before reading any function in it. Anything spanning more than one function
 * belongs in the unit's German <unitFile>.md beside the source. The ceiling binds only
 * where that .md exists — a file without one has no lower altitude, and its header is
 * the documentation.
 * @param {Repo} repo
 * @returns {string[]}
 */
function checkUnitHeaderCeiling(repo) {
    const maxHeaderLines = 8;
    /** @type {string[]} */
    const failures = [];
    for (const filePath of listScripts(repo)) {
        if (!repo.exists(filePath.replace(/\.js$/, '.md'))) continue;

        // A byte-order mark ahead of the opener would hide the header from this scan.
        const lines = splitLines(repo.readText(filePath).replace(/^﻿/, ''));
        if (!lines[0]?.startsWith('/**')) continue;

        const closing = lines.findIndex((lineText) => lineText.includes('*/'));
        if (closing === -1) continue;

        const headerLines = closing + 1;
        if (headerLines <= maxHeaderLines) continue;

        failures.push(
            `${filePath} has a ${headerLines}-line file header (max ${maxHeaderLines}); move what spans more than one function into ${path.posix.basename(filePath).replace(/\.js$/, '.md')}`,
        );
    }
    return failures;
}

// Only namespaced dot-paths are checkable. Bare keys ('landesschnitt') are term
// lookups against shared.element_texts and `glossarySubKey` values index an
// entry's own element_texts — neither is a path into the tree.
const glossaryPathPatterns = [
    /\b\w*[Gg]lossary(?:Path|Key)\s*[:=]\s*['"]([^'"]+)['"]/g,
    /\bgetRequiredEntryText\(\s*['"]([^'"]+)['"]/g,
];

/**
 * Every glossary fragment is mounted by exactly one barrel (`src/<app>/<app>Glossary.js`),
 * and every literal glossary path a module declares resolves in the assembled tree.
 * @param {Repo} repo
 * @returns {Promise<string[]>}
 */
async function checkGlossaryPathResolution(repo) {
    /** @type {string[]} */
    const failures = [];
    const sourceFiles = listSourceFiles(repo);
    const barrels = sourceFiles.flatMap((filePath) => {
        const appId = filePath.match(/^src\/(\w+)\/\1Glossary\.js$/)?.[1];
        return appId ? [{ appId, filePath, source: repo.readText(filePath) }] : [];
    });
    /** @type {{[namespace: string]: import('@tba3/module-base/glossary').GlossaryTree}} */
    const trees = {};
    for (const { appId, filePath } of barrels) {
        const barrelModule = await repo.importModule(filePath);
        trees[appId] = /** @type {import('@tba3/module-base/glossary').GlossaryTree} */ (
            barrelModule[`${appId}Glossary`]
        );
    }
    // `general.*` is never fragmented, so any barrel carries the same copy.
    if (barrels.length > 0) trees.general = trees[barrels[0].appId];

    const packages = workspacePackages(repo);
    // A fragment nobody imports is dead prose: it never reaches the tree, and the
    // module it belongs to renders the missing-entry marker.
    for (const fragmentPath of sourceFiles.filter((file) => file.endsWith('.glossary.json'))) {
        // Match the exact specifier the owning barrel would use. Every app has a
        // views/welcome.glossary.json, so a basename match would count all three.
        // A fragment that lives in a package is imported by its package subpath;
        // the barrel stays in tba3 either way, because it is a mount table, not prose.
        const importCount = barrels.filter(({ appId, source }) => {
            const appPrefix = `src/${appId}/`;
            if (fragmentPath.startsWith(appPrefix)) {
                return source.includes(`'./${fragmentPath.slice(appPrefix.length)}'`);
            }
            // A package card's fragment is mounted by the package's own map, which the
            // barrel spreads in whole — so the barrel must import that map, and the map
            // must import the fragment.
            return packages.some(({ manifest, roots }) =>
                roots.some((root) => {
                    const packagePrefix = `${root}/${appId}/`;
                    if (!fragmentPath.startsWith(packagePrefix)) return false;
                    const mountModule = `${packagePrefix}${appId}GlossaryFragments.js`;
                    return (
                        source.includes(`'${manifest.name}/glossary/${appId}'`) &&
                        repo.exists(mountModule) &&
                        repo
                            .readText(mountModule)
                            .includes(`'./${fragmentPath.slice(packagePrefix.length)}'`)
                    );
                }),
            );
        }).length;
        if (importCount !== 1) {
            failures.push(
                `${fragmentPath} is imported by ${importCount} barrels; expected exactly 1`,
            );
        }
    }

    // Computed keys (getLevelGlossaryKey(...)) are out of reach of a static scan and stay
    // covered by tests/e2e/tour.spec.js.
    for (const filePath of sourceFiles.filter(
        (candidatePath) =>
            candidatePath.endsWith('.js') &&
            !candidatePath.endsWith('Glossary.js') &&
            !candidatePath.endsWith('GlossaryFragments.js'),
    )) {
        const sourceText = repo.readText(filePath);
        for (const pattern of glossaryPathPatterns) {
            for (const match of sourceText.matchAll(pattern)) {
                const dotPath = match[1];
                const segments = dotPath.split('.');
                if (segments.length < 2 || !Object.hasOwn(trees, segments[0])) continue;

                if (resolveDotPath(trees[segments[0]], dotPath) == null) {
                    failures.push(`${filePath} references '${dotPath}', which resolves to nothing`);
                }
            }
        }
    }
    return failures;
}

const htmlEntryPoints = ['index.html', 'en/index.html', 'ma/index.html', 'sl/index.html'];

/**
 * @param {string} className - A module class name.
 * @returns {string} Its element tag: `tba-` and the kebab-cased name without `Module`.
 */
function elementTagOf(className) {
    const stem = className.replace(/Module$/, '');
    return `tba-${stem.replace(/(?<=[a-z0-9])([A-Z])/g, '-$1').toLowerCase()}`;
}

/**
 * Every module is a custom element: a concrete module class (one nothing extends) defines
 * its derived `tba-` tag in its own file, and an abstract base, which only its subclasses
 * instantiate, defines none.
 * @param {Repo} repo
 * @returns {string[]}
 */
function checkElementTags(repo) {
    /** @type {string[]} */
    const failures = [];
    const classUnits = listUnitSources(repo).flatMap(({ sourcePath, units }) =>
        units.filter((unit) => !unit.descriptor).map((unit) => ({ sourcePath, unit })),
    );
    for (const { sourcePath, unit } of classUnits) {
        const defined = [
            ...repo
                .readText(sourcePath)
                .matchAll(
                    new RegExp(
                        String.raw`customElements\.define\(\s*'([^']+)',\s*${unit.name}\s*\)`,
                        'g',
                    ),
                ),
        ].map((match) => match[1]);
        if (unit.extended) {
            if (defined.length > 0) {
                failures.push(
                    `${sourcePath} defines a tag for ${unit.name}, a base other modules extend; only concrete modules are elements of their own`,
                );
            }
            continue;
        }
        const tag = elementTagOf(unit.name);
        if (defined.length !== 1 || defined[0] !== tag) {
            failures.push(
                `${sourcePath} must define ${unit.name} as '${tag}' (customElements.define('${tag}', ${unit.name}))`,
            );
        }
    }
    return failures;
}

/**
 * `check:unused:prod` fails an export only tests use, so tests go through the API
 * production uses. knip skips exports tagged `@public`, `@beta` or `@alias` in every mode
 * and `@internal` in production mode, which would let an unused or test-only export back
 * in under a tag, so the four tags are barred outright. Only scripts carry exports; a
 * unit doc or a glossary entry may name the tags.
 * @param {Repo} repo
 * @returns {string[]}
 */
function checkNoKnipSkipTag(repo) {
    return listScripts(repo).flatMap((filePath) =>
        findLineMatches(repo.readText(filePath), /@(?:internal|public|beta|alias)\b/).map(
            ({ lineNumber }) =>
                `${filePath}:${lineNumber} carries a JSDoc tag knip skips the export for, so an unused or test-only export would pass`,
        ),
    );
}

/**
 * Every UI icon is a Material Symbols glyph rendered through the icon registry
 * (`createIcon`/`iconSvg` of `@tba3/module-base`); the icon font and emoji are barred
 * from stylesheets and HTML entry points. JS literals are the lint rule of the same name.
 * @param {Repo} repo
 * @returns {string[]}
 */
function checkIconSources(repo) {
    /** @type {string[]} */
    const failures = [];
    for (const filePath of [...listCssFiles(repo), ...htmlEntryPoints]) {
        const text = repo.readText(filePath);
        for (const match of findLineMatches(text, ICON_FONT_PATTERN)) {
            failures.push(
                `${filePath}:${match.lineNumber} references the removed Material Icons font; render through createIcon()/iconSvg() of @tba3/module-base: ${match.lineText.trim()}`,
            );
        }
        for (const match of findLineMatches(text, EMOJI_PATTERN)) {
            failures.push(
                `${filePath}:${match.lineNumber} uses an emoji as an icon; name a Material Symbols glyph instead: ${match.lineText.trim()}`,
            );
        }
    }
    return failures;
}

// The packages ship default values for the custom properties their sheets and scripts
// read, so a host with no design system still gets something legible; tba3 imports them
// first and overrides its deltas. Two ways that rots: a sheet starts reading a token
// nobody defaults, or a default outlives its last reader. Neither shows otherwise: a
// missing token renders as an unset colour, not as an error.
const cssVarCallPattern = /var\(\s*(--[A-Za-z0-9-]+)\s*(,)?/g;
const cssVarDeclarationPattern = /^\s*(--[A-Za-z0-9-]+)\s*:\s*([^;]+);/gm;
// Stamped per element by a renderer, from data, so it has no static default.
const runtimeTokenPattern = /(--[A-Za-z0-9-]+)\s*[:'"]/g;

/**
 * Every token a package's sheets or scripts read is defaulted somewhere its consumer
 * gets: by the sheet itself, by an inline var() fallback, by the renderer at runtime, or
 * by the token sheet of the package or one below it. A token a lower package reads is
 * defaulted by that package, none by two sheets, and every default still has a reader.
 * @param {Repo} repo
 * @returns {string[]}
 */
function checkTokenDefaults(repo) {
    /** @type {string[]} */
    const failures = [];
    // Lowest package first: each sees its own defaults and those before it. A package
    // reading no token nobody below defaults needs no sheet of its own.
    const packages = workspacePackages(repo).map(({ dir, roots }) => ({
        dir,
        /** @type {string | null} */
        sheet: tokenDefaultsSheets[path.posix.basename(dir)] ?? null,
        files: roots.flatMap((root) => repo.listFiles(root)),
        /** @type {Map<string, string>} */
        defaults: new Map(),
        /** @type {Map<string, string>} Each token read, with the first file reading it. */
        reads: new Map(),
        /** @type {Set<string>} Tokens a sheet declares or a var() call falls back for; a package above may read them too. */
        declared: new Set(),
        /** @type {Set<string>} Tokens read without a fallback. */
        bareReads: new Set(),
    }));
    const runtimeTokens = new Set();

    for (const pkg of packages) {
        if (pkg.sheet) {
            if (!repo.exists(pkg.sheet)) {
                failures.push(`${pkg.sheet} is missing`);
                return failures;
            }
            for (const match of repo.readText(pkg.sheet).matchAll(cssVarDeclarationPattern)) {
                pkg.defaults.set(match[1], match[2].trim());
            }
        }

        /**
         * @param {string} token
         * @param {string} filePath
         * @param {boolean} hasFallback - Whether the read carries an inline fallback.
         */
        const addRead = (token, filePath, hasFallback) => {
            if (!pkg.reads.has(token)) pkg.reads.set(token, filePath);
            if (hasFallback) pkg.declared.add(token);
            else pkg.bareReads.add(token);
        };
        // Script reads count like sheet reads: a `var(--x)` a renderer paints with.
        for (const filePath of pkg.files.filter((file) => file.endsWith('.js'))) {
            const text = repo.readText(filePath);
            const scriptReads = new Set();
            for (const [, token, fallback] of text.matchAll(cssVarCallPattern)) {
                addRead(token, filePath, !!fallback);
                scriptReads.add(token);
            }
            for (const match of text.matchAll(runtimeTokenPattern)) {
                if (!scriptReads.has(match[1])) runtimeTokens.add(match[1]);
            }
        }
        for (const filePath of pkg.files.filter(
            (file) => file.endsWith('.css') && file !== pkg.sheet,
        )) {
            const text = repo.readText(filePath);
            for (const match of text.matchAll(cssVarDeclarationPattern)) pkg.declared.add(match[1]);
            for (const [, token, fallback] of text.matchAll(cssVarCallPattern)) {
                addRead(token, filePath, !!fallback);
            }
        }
    }

    packages.forEach((pkg, index) => {
        const below = packages.slice(0, index);
        const above = packages.slice(index + 1);
        const visible = new Map([...below, pkg].flatMap((visiblePkg) => [...visiblePkg.defaults]));
        const home = pkg.sheet ?? `a token defaults sheet of ${pkg.dir} (tokenDefaultsSheets)`;

        for (const [token, file] of pkg.reads) {
            const higher = visible.has(token)
                ? undefined
                : above.find((other) => other.defaults.has(token));
            if (higher) {
                failures.push(
                    `${file} reads ${token}, which only ${higher.sheet} defaults; move it to ${home}`,
                );
            } else if (
                pkg.bareReads.has(token) &&
                ![...below, pkg].some((declaring) => declaring.declared.has(token)) &&
                !visible.has(token) &&
                !runtimeTokens.has(token)
            ) {
                failures.push(`${file} reads ${token}, which nothing defaults; add it to ${home}`);
            }
        }

        // A default nothing reads is stale: no sheet or script of this package or one
        // above it, and no other default's value.
        const readers = new Set([pkg, ...above].flatMap((reader) => [...reader.reads.keys()]));
        for (const reader of [pkg, ...above]) {
            for (const value of reader.defaults.values()) {
                for (const [, inner] of value.matchAll(cssVarCallPattern)) readers.add(inner);
            }
        }
        for (const [token, value] of pkg.defaults) {
            const lower = below.find((other) => other.defaults.has(token));
            if (lower) {
                failures.push(
                    `${pkg.sheet} defaults ${token}, which ${lower.sheet} already defaults`,
                );
            }
            if (!readers.has(token)) {
                failures.push(
                    `${pkg.sheet} defaults ${token}, which no package sheet or script reads`,
                );
            }
            // A value written as var(--other) needs --other defaulted here or below.
            for (const [, inner] of value.matchAll(cssVarCallPattern)) {
                if (!visible.has(inner) && !runtimeTokens.has(inner)) {
                    failures.push(
                        `${pkg.sheet} defaults ${token} as ${value}, but ${inner} is defaulted nowhere it sees`,
                    );
                }
            }
        }
    });
    return failures;
}

/** A top-level statement that is a call: `Tabulator.registerModule(…)`, `customElements.define(…)`. */
const topLevelCallPattern =
    /^(?!(?:export|import|const|let|var|function|class|async|if|for|while|return)\b)[A-Za-z_$][\w$.]*\(/m;
/** A bare import of a package script, made for its side effect. */
const bareScriptImportPattern = /^import\s+['"](\.[^'"]+\.js)['"]/gm;

/**
 * Every package script that runs something at import time — a top-level call, or a
 * script other package files import bare — is named in its package's `sideEffects`, and
 * every entry there still matches a file: a bundler drops an unlisted script whose
 * exports go unused, and with it what it registered (Tabulator's optional modules). An
 * entry without a slash matches a file name anywhere, as bundlers read it.
 * @param {Repo} repo
 * @returns {string[]}
 */
function checkPackageSideEffects(repo) {
    /** @type {string[]} */
    const failures = [];
    for (const { dir, manifest, roots } of workspacePackages(repo)) {
        const patterns = manifest.sideEffects ?? [];
        // Paths relative to the package, as its `sideEffects` entries are written.
        const files = roots
            .flatMap((root) => repo.listFiles(root))
            .map((filePath) => path.posix.relative(dir, filePath));
        /**
         * @param {string} rel - A path relative to the package.
         * @param {string} pattern - A sideEffects entry.
         * @returns {boolean} Whether the entry names the file.
         */
        const matches = (rel, pattern) =>
            path.posix.matchesGlob(pattern.includes('/') ? rel : path.posix.basename(rel), pattern);

        const scripts = new Map(
            files
                .filter((rel) => rel.endsWith('.js'))
                .map((rel) => [rel, repo.readText(`${dir}/${rel}`)]),
        );
        const importedBare = new Set();
        for (const [rel, text] of scripts) {
            for (const [, specifier] of text.matchAll(bareScriptImportPattern)) {
                importedBare.add(path.posix.join(path.posix.dirname(rel), specifier));
            }
        }
        for (const [rel, text] of scripts) {
            const runsOnImport = importedBare.has(rel) || topLevelCallPattern.test(text);
            if (runsOnImport && !patterns.some((pattern) => matches(rel, pattern))) {
                failures.push(
                    `${dir}/${rel} runs code on import but is not in ${dir}/package.json sideEffects`,
                );
            }
        }
        for (const pattern of patterns) {
            if (!files.some((rel) => matches(rel, pattern))) {
                failures.push(
                    `${dir}/package.json sideEffects lists ${pattern}, which matches no file`,
                );
            }
        }
    }
    return failures;
}

/**
 * A token that differs between the colour schemes is one `light-dark()` declaration,
 * which every element resolves by its own `color-scheme`. The one place a selector names
 * `data-color-scheme` is the hook in module-base's tokens.css that turns the attribute
 * into `color-scheme`; a rule keyed on it anywhere else would paint by `<html>`'s scheme
 * and miss a subtree that sets its own (paper under a dark page).
 * @param {Repo} repo
 * @returns {string[]}
 */
function checkSchemeTokens(repo) {
    return listCssFiles(repo)
        .filter(
            (filePath) =>
                filePath !== tokenDefaultsSheets['module-base'] &&
                /\[data-color-scheme\s*[\]~|^$*=]/.test(stripCssComments(repo.readText(filePath))),
        )
        .map(
            (filePath) =>
                `${filePath} keys a rule on data-color-scheme; declare the token as light-dark(<light>, <dark>) instead`,
        );
}

/** @type {StructureRule[]} */
export const structureRules = [
    { id: 'css-ownership', check: checkCssOwnership },
    { id: 'scheme-tokens', check: checkSchemeTokens },
    { id: 'package-side-effects', check: checkPackageSideEffects },
    { id: 'tracked-source-markers', check: checkCssMarkers },
    { id: 'comment-doc-references', check: checkCssDocReferences },
    { id: 'unit-header-ceiling', check: checkUnitHeaderCeiling },
    { id: 'icon-sources', check: checkIconSources },
    { id: 'no-knip-skip-tag', check: checkNoKnipSkipTag },
    { id: 'element-tag', check: checkElementTags },
    { id: 'module-doc', check: (repo) => readUnitDocs(repo).flatMap(unitDocFailures) },
    { id: 'token-defaults', check: checkTokenDefaults },
    { id: 'glossary-path-resolution', check: checkGlossaryPathResolution },
];

/**
 * @param {Repo} repo
 * @returns {Promise<{ rule: string, message: string }[]>} Every rule's failures, in rule order.
 */
export async function runStructureRules(repo) {
    /** @type {{ rule: string, message: string }[]} */
    const failures = [];
    for (const { id, check } of structureRules) {
        for (const message of await check(repo)) failures.push({ rule: id, message });
    }
    return failures;
}

if (import.meta.main) {
    const failures = await runStructureRules(diskRepo());
    if (failures.length > 0) {
        console.error('Structure checks failed:');
        for (const { rule, message } of failures) console.error(`- [${rule}] ${message}`);
        process.exitCode = 1;
    } else {
        console.log('Structure checks passed.');
    }
}
