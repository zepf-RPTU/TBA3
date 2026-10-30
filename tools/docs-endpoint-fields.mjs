/**
 * The generated per-endpoint view of what the units read.
 *
 *   node tools/docs-endpoint-fields.mjs [--check]
 *
 * Every unit doc states under `## Daten` which fields it needs (`Endpunkt | Parameter |
 * Felder`) and which it uses with a fallback (`Endpunkt | Feld | Ohne das Feld`). The unit
 * docs stay the source; this script regroups their rows by endpoint into
 * `docs/endpoint-fields.md`, cells verbatim but for relative links, which are rebased onto
 * docs/, each row linked back to its unit doc. A row
 * whose endpoint cell names several endpoints is listed under each.
 *
 * The structure check's `module-doc` rule fails an `Endpunkt` table or a row this page
 * cannot place, so a unit doc cannot drop out of it unnoticed. `--check` regenerates in
 * memory and fails when the committed file differs.
 */
import path from 'node:path';
import { diskRepo, repoRoot } from './lib/repo.mjs';
import {
    endpoints,
    fieldRows,
    fieldTableColumns,
    listApps,
    readUnitDocs,
} from './lib/unitDocs.mjs';
import { generateOrCheck } from './lib/generatedFile.mjs';

/** @typedef {import('./lib/unitDocs.mjs').UnitDoc} UnitDoc */

/**
 * @typedef {object} EndpointRow
 * @property {string} app - The app's id upper-cased (`EN`), or `–` for a shared unit.
 * @property {string} unit - The unit doc's link, relative to docs/.
 * @property {string[]} cells - The row's cells as the unit doc has them.
 */

/**
 * @param {UnitDoc[]} docs
 * @param {string[]} appIds
 * @returns {Map<string, { required: EndpointRow[], optional: EndpointRow[] }>} Per
 *   endpoint, the rows of every unit doc that cites it.
 */
function collectRows(docs, appIds) {
    const byEndpoint = new Map(
        endpoints.map((endpoint) => [
            endpoint,
            {
                required: /** @type {EndpointRow[]} */ ([]),
                optional: /** @type {EndpointRow[]} */ ([]),
            },
        ]),
    );
    const apps = new Set(appIds);
    for (const { path: docPath, units, markdown } of docs) {
        if (!markdown) continue;
        // A package card under `src/<app>/` belongs to that app as much as tba3's own.
        const folder = /(?:^|\/)src\/([^/]+)\//.exec(docPath)?.[1];
        const app = folder && apps.has(folder) ? folder.toUpperCase() : '–';
        const names = units.map(({ name }) => name).join(', ');
        const unit = `[${names}](${path.posix.relative('docs', docPath)}#daten)`;
        const directory = path.posix.dirname(docPath);
        /**
         * @param {string} cell - A field-table cell of the unit doc.
         * @returns {string} The cell with its relative links pointing from docs/.
         */
        const rebase = (cell) =>
            cell.replace(
                /\]\((?![a-z]+:|#|\/)([^)\s]+)\)/g,
                (_, target) =>
                    `](${path.posix.relative('docs', path.posix.join(directory, target))})`,
            );
        for (const { table, cells, endpoints: cited } of fieldRows(markdown).rows) {
            for (const endpoint of cited) {
                byEndpoint.get(endpoint)?.[table].push({ app, unit, cells: cells.map(rebase) });
            }
        }
    }
    return byEndpoint;
}

/**
 * @param {string[]} appLabels - The apps' labels, in page order.
 * @param {string[]} columns - The column titles after `App` and `Unit`.
 * @param {EndpointRow[]} rows - The rows, in unit-doc order.
 * @returns {string[]} The table's lines, rows sorted by app.
 */
function renderTable(appLabels, columns, rows) {
    if (rows.length === 0) return ['Keine.'];
    const order = [...appLabels, '–'];
    return [
        `| App | Unit | ${columns.join(' | ')} |`,
        `|---|---|${columns.map(() => '---|').join('')}`,
        ...[...rows]
            .sort((a, b) => order.indexOf(a.app) - order.indexOf(b.app))
            .map(({ app, unit, cells }) => `| ${app} | ${unit} | ${cells.join(' | ')} |`),
    ];
}

/**
 * @param {UnitDoc[]} docs
 * @returns {string} docs/endpoint-fields.md.
 */
function renderEndpointFields(docs) {
    const appIds = listApps(docs).map(({ id }) => id);
    const appLabels = appIds.map((id) => id.toUpperCase());
    const sections = [...collectRows(docs, appIds)].flatMap(
        ([endpoint, { required, optional }]) => [
            `## \`${endpoint}\``,
            '',
            '**Benötigt**',
            '',
            ...renderTable(appLabels, fieldTableColumns.required, required),
            '',
            '**Optional genutzt**',
            '',
            ...renderTable(appLabels, fieldTableColumns.optional, optional),
            '',
        ],
    );
    return [
        '# Felder je Endpunkt',
        '',
        'Generiert von `node tools/docs-endpoint-fields.mjs` aus den `## Daten`-Tabellen der',
        'Unit-Docs; `npm run check` prüft, dass die Datei aktuell ist. Nicht von Hand bearbeiten —',
        'die Unit-Doc ist die Quelle, der Link in der Spalte „Unit“ führt zu ihr.',
        '',
        'Je Endpunkt: welche Unit welche Felder **benötigt** und welche sie **optional nutzt**.',
        '¹ markiert ein Feld, das `tba3-spec.yml` optional lässt und die Unit trotzdem braucht;',
        'was ohne es geschieht, steht in der Fußnote der Unit-Doc. Wie die Zellen zu lesen sind',
        '(Feldpfade, Parameter), steht in',
        '[datenvertrag.md](../packages/modules/docs/datenvertrag.md#wie-eine-unit-doc-die-spezifikation-zitiert).',
        '',
        'Nicht in dieser Seite, weil keine Unit-Doc sie wiederholt:',
        '',
        '- die Felder, die das Paket für **jede** Unit liest (Kompetenzstufen- und',
        '  Aufgabenniveau-Skala, `type`, `covariates[trait]`, `covariates[gender]`) —',
        '  [Globale Lesezugriffe](../packages/modules/docs/datenvertrag.md#globale-lesezugriffe);',
        '- was die Schemas beim Laden von jedem Dokument verlangen, und wo TBA3 dabei von der',
        '  Spezifikation abweicht — [datenvertrag.md](../packages/modules/docs/datenvertrag.md#bekannte-abweichungen-von-tba3-spec-yml).',
        '',
        ...sections,
    ].join('\n');
}

if (import.meta.main) {
    generateOrCheck({
        files: [
            {
                outPath: path.join(repoRoot, 'docs', 'endpoint-fields.md'),
                content: renderEndpointFields(readUnitDocs(diskRepo())),
            },
        ],
        staleMessage:
            'docs/endpoint-fields.md is stale; run `node tools/docs-endpoint-fields.mjs`.',
        okMessage: 'docs/endpoint-fields.md is current.',
        wroteMessage: 'wrote docs/endpoint-fields.md',
    });
}
