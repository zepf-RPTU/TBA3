/**
 * The unit-doc contract, parsed in one place. A unit doc is the `<unitFile>.md` beside a
 * unit's source: an H1 naming its units, the `##` headings its kind feeds the generators,
 * and under `## Daten` the API-spec tables its kind requires. An app doc's
 * `## Views` and a view doc's `## Kinder` link the docs below it.
 */
import path from 'node:path';
import { listUnitSources } from './moduleUnits.mjs';

/** @typedef {import('./repo.mjs').Repo} Repo */
/** @typedef {import('./moduleUnits.mjs').ModuleUnit} ModuleUnit */

/**
 * @typedef {object} Markdown
 * @property {string[]} h1s - Every `# ` heading's text, in order.
 * @property {string[]} headings - The `## ` titles, trailing whitespace trimmed, each once,
 *   in order.
 * @property {Map<string, string>} sections - The body under each `## ` title up to the next
 *   `## `; the first, where a title repeats.
 */

/**
 * @typedef {object} MarkdownTable
 * @property {string[]} header - Its column titles.
 * @property {string[][]} rows - Each row's cells.
 */

/**
 * @typedef {object} UnitDoc
 * @property {string} path - The doc, repo-relative.
 * @property {string} sourcePath - The source whose units it documents.
 * @property {ModuleUnit[]} units
 * @property {Markdown | null} markdown - Null while the doc does not exist.
 */

/**
 * @typedef {object} FieldRow
 * @property {'required' | 'optional'} table - Which of the two field tables holds it.
 * @property {string[]} cells - Its three cells; an empty one repeats the cell above.
 * @property {string[]} endpoints - The endpoints its first cell names.
 */

/**
 * The headings the docs generators read: `Daten` feeds the endpoint-field page, `Views` and
 * `Kinder` the wiki sidebar and the module index. Every other section is the author's.
 */
const requiredHeadingsByKind = {
    content: ['Daten'],
    view: ['Kinder', 'Daten'],
    app: ['Views', 'Daten'],
};

/** The endpoint names a unit doc cites, in the order the endpoint-field page lists them. */
export const endpoints = ['competence-levels', 'items', 'aggregations'];

/** What a unit needs from an endpoint, and what it uses with a fallback. */
export const fieldTableColumns = {
    required: ['Endpunkt', 'Parameter', 'Felder'],
    optional: ['Endpunkt', 'Feld', 'Ohne das Feld'],
};
/** A view doc's `Endpunkt` table: which child a request goes to, no fields. */
const routingColumns = ['Endpunkt', 'Parameter', 'Geht an'];
/** An app doc's acquisition spec. */
const requestColumns = ['Anfrage', 'Parameter', 'Dokument', 'Schlüssel'];
const noApiDataPattern = /^Keine API-Daten\./m;

/**
 * @param {string} text
 * @returns {Markdown}
 */
export function parseMarkdown(text) {
    /** @type {string[]} */
    const h1s = [];
    /** @type {Map<string, string[]>} */
    const bodies = new Map();
    /** @type {string[] | null} */
    let body = null;
    for (const line of text.split(/\r?\n/)) {
        const h1 = line.match(/^# (.*)$/);
        if (h1) h1s.push(h1[1]);
        if (line.startsWith('## ')) {
            const title = line.match(/^## (.+?)\s*$/)?.[1];
            body = title && !bodies.has(title) ? [] : null;
            if (title && body) bodies.set(title, body);
            continue;
        }
        body?.push(line);
    }
    return {
        h1s,
        headings: [...bodies.keys()],
        sections: new Map([...bodies].map(([title, lines]) => [title, lines.join('\n')])),
    };
}

/**
 * @param {string} line - A table row.
 * @returns {string[]} Its cells, trimmed; an escaped `\|` stays inside its cell.
 */
function cellsOf(line) {
    return line
        .trim()
        .replace(/^\||\|$/g, '')
        .split(/(?<!\\)\|/)
        .map((cell) => cell.trim());
}

/**
 * @param {string} section - A section's body.
 * @returns {MarkdownTable[]} Its tables, in order.
 */
function tablesOf(section) {
    /** @type {MarkdownTable[]} */
    const tables = [];
    /** @type {MarkdownTable | null} */
    let table = null;
    for (const line of section.split('\n')) {
        if (!line.trimStart().startsWith('|')) {
            table = null;
        } else if (!table) {
            table = { header: cellsOf(line), rows: [] };
            tables.push(table);
        } else if (!/^[\s|:-]+$/.test(line)) {
            table.rows.push(cellsOf(line));
        }
    }
    return tables;
}

/**
 * @param {string[]} header
 * @param {string[]} columns
 * @returns {boolean} Whether the header has exactly these columns.
 */
function hasColumns(header, columns) {
    return header.length === columns.length && header.every((cell, i) => cell === columns[i]);
}

/**
 * @param {Markdown} markdown - A doc's.
 * @param {string} docPath - Where the doc lives, repo-relative.
 * @param {string} heading - A `## ` title.
 * @returns {string[]} The `.md` files linked under that heading, repo-relative, each once,
 *   in order.
 */
export function linkedDocs(markdown, docPath, heading) {
    const directory = path.posix.dirname(docPath);
    /** @type {string[]} */
    const targets = [];
    const section = markdown.sections.get(heading) ?? '';
    for (const match of section.matchAll(/\]\(([^)#\s]+\.md)(?:#[^)]*)?\)/g)) {
        const target = path.posix.join(directory, match[1]);
        if (!targets.includes(target)) targets.push(target);
    }
    return targets;
}

/**
 * The page header and its controls are shell widgets, not cards: no data, no place in a
 * view tree. Their file header documents them.
 */
const undocumentedFolders = ['src/common/modules/header/', 'src/common/modules/controls/'];

/**
 * @param {Repo} repo
 * @returns {UnitDoc[]} One per source declaring units outside the shell-widget folders,
 *   in doc-path order.
 */
export function readUnitDocs(repo) {
    return (
        listUnitSources(repo)
            .filter(
                ({ sourcePath }) =>
                    !undocumentedFolders.some((folder) => sourcePath.startsWith(folder)),
            )
            .map(({ sourcePath, docPath, units }) => ({
                path: docPath,
                sourcePath,
                units,
                markdown: repo.exists(docPath) ? parseMarkdown(repo.readText(docPath)) : null,
            }))
            // Code-unit order: localeCompare would sort by the machine's locale.
            .sort((a, b) => (a.path < b.path ? -1 : 1))
    );
}

/**
 * The dashboards: each app unit's doc, keyed by its `src/<app>/` folder, in path order.
 * @param {UnitDoc[]} docs
 * @returns {{ id: string, doc: string }[]}
 */
export function listApps(docs) {
    return docs
        .filter((doc) =>
            doc.units.some((unit) => unit.kind === 'app' && unit.base === 'BaseAppModule'),
        )
        .map((doc) => ({ id: doc.path.split('/')[1], doc: doc.path }));
}

/**
 * The rows of a unit doc's two field tables under `## Daten`, and what there cannot be
 * placed: an `Endpunkt` table of neither shape, a row without three cells, or one naming no
 * known endpoint. A view's routing table and any table not keyed by `Endpunkt` (the
 * unit's own derivations) are no field tables.
 * @param {Markdown} markdown
 * @param {MarkdownTable[]} [tables] - The `## Daten` tables, when already parsed.
 * @returns {{ rows: FieldRow[], problems: string[] }}
 */
export function fieldRows(markdown, tables = tablesOf(markdown.sections.get('Daten') ?? '')) {
    /** @type {FieldRow[]} */
    const rows = [];
    /** @type {string[]} */
    const problems = [];
    for (const { header, rows: tableRows } of tables) {
        if (header[0] !== 'Endpunkt' || hasColumns(header, routingColumns)) continue;
        /** @type {FieldRow['table'] | null} */
        const table = hasColumns(header, fieldTableColumns.required)
            ? 'required'
            : hasColumns(header, fieldTableColumns.optional)
              ? 'optional'
              : null;
        if (!table) {
            problems.push(`has an Endpunkt table of unknown shape: | ${header.join(' | ')} |`);
            continue;
        }
        /** @type {string[]} */
        let previous = [];
        for (const row of tableRows) {
            if (row.length !== 3) {
                problems.push(`has a field-table row without 3 cells: | ${row.join(' | ')} |`);
                continue;
            }
            const cells = row.map((cell, index) => cell || (previous[index] ?? ''));
            previous = cells;
            const cited = endpoints.filter((endpoint) => cells[0].includes(`\`${endpoint}\``));
            if (cited.length === 0) {
                problems.push(`names no known endpoint in '${cells[0]}'`);
                continue;
            }
            rows.push({ table, cells, endpoints: cited });
        }
    }
    return { rows, problems };
}

/** @type {{[kind: string]: (section: string, tables: MarkdownTable[], unitNames: string[]) => boolean}} */
const dataSectionFormatByKind = {
    content: (section, tables) =>
        noApiDataPattern.test(section) ||
        (tables.some(({ header }) => hasColumns(header, fieldTableColumns.required)) &&
            (tables.some(({ header }) => hasColumns(header, fieldTableColumns.optional)) ||
                section.includes('Keine optionalen Felder.'))),
    view: (section, tables) =>
        noApiDataPattern.test(section) ||
        tables.some(({ header }) => hasColumns(header, routingColumns)),
    // BaseAppModule declares no requests of its own; every app subclass lists them.
    app: (_section, tables, unitNames) =>
        unitNames.includes('BaseAppModule') ||
        tables.some(({ header }) => hasColumns(header, requestColumns)),
};

/**
 * What a unit doc owes: it exists, names its units in an H1, carries the headings its kind
 * feeds the generators, and its `## Daten` holds the API-spec tables its kind requires or says it reads
 * none. Only the format is checked; the field paths are not validated against the spec.
 * @param {UnitDoc} doc
 * @returns {string[]} Each failure, naming the doc.
 */
export function unitDocFailures({ path: docPath, units, markdown }) {
    const unitNames = units.map((unit) => unit.name);
    if (!markdown) return [`${docPath} is missing; it must document ${unitNames.join(', ')}`];

    /** @type {string[]} */
    const failures = [];
    const requiredHeadings = new Set(units.flatMap((unit) => requiredHeadingsByKind[unit.kind]));
    for (const heading of requiredHeadings) {
        if (!markdown.headings.includes(heading)) {
            failures.push(`${docPath} lacks the required heading '## ${heading}'`);
        }
    }
    const dataSection = markdown.sections.get('Daten');
    if (dataSection !== undefined) {
        const tables = tablesOf(dataSection);
        for (const kind of new Set(units.map((unit) => unit.kind))) {
            if (!dataSectionFormatByKind[kind](dataSection, tables, unitNames)) {
                failures.push(
                    `${docPath} has a '## Daten' that is neither the API-spec tables its kind (${kind}) requires nor 'Keine API-Daten.'`,
                );
            }
        }
        for (const problem of fieldRows(markdown, tables).problems) {
            failures.push(`${docPath} ${problem}`);
        }
    }
    for (const name of unitNames) {
        if (!markdown.h1s.some((line) => new RegExp(String.raw`\b${name}\b`).test(line))) {
            failures.push(`${docPath} has no H1 naming ${name}`);
        }
    }
    return failures;
}
