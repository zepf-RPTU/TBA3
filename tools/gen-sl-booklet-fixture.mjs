/**
 * Derive `public/data/sl/sl-testhefte/` from the demo school in `public/data/sl/sl/`:
 * the same school, whose groups sat different booklets in three of its Fächer.
 *
 *   node tools/gen-sl-booklet-fixture.mjs [--check]
 *
 * The SL views compare a raw Lösungsquote only within one booklet, and this dataset
 * shows them doing so: Deutsch, Englisch and Mathematik are split over two booklets,
 * Französisch stays on one as the control. Counts are left as they are; a competence
 * level is equated per booklet by the server, so only the `booklet` ids change.
 *
 * Group and student value groups take their group's booklet, the school and the
 * Landesschnitt the Fach's booklets comma-joined, as the API pools them. The earlier
 * years carry no booklet and are copied unchanged, as is `aggregations.json`.
 *
 * Run after `gen-sl-history-fixture.mjs`, which writes this script's input. `--check`
 * regenerates in memory and diffs against the committed files.
 */

import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
    COVARIATE_TYPE,
    PROPERTY_KEY,
    VALUE_GROUP_TYPE,
} from '../packages/modules/src/common/domain/apiValueMaps.js';
import {
    getPropertyText,
    readCovariate,
} from '../packages/modules/src/common/domain/studentIdentity.js';
import { generateOrCheck, serializeFixture } from './lib/generatedFile.mjs';
import { repoRoot } from './lib/repo.mjs';

const SOURCE_DIR = path.join(repoRoot, 'public', 'data', 'sl', 'sl');
const OUT_DIR = path.join(repoRoot, 'public', 'data', 'sl', 'sl-testhefte');

/**
 * The booklet number each group sat, per Fach. A Fach not listed keeps its one booklet.
 * @type {Record<string, Record<string, number>>}
 */
const BOOKLET_BY_GROUP = {
    Deutsch: { '8a': 1, '8b': 1, '8c': 2 },
    Englisch: { '8a': 1, '8b': 2, '8c': 2 },
    Mathematik: { '8a': 1, '8b': 1, '8c': 2, '8d': 2 },
};

/**
 * @typedef {{type: string, subject?: {name: string}, covariates?: Array<{type: string, value: string}>, properties?: Array<{key: string, value: string}>, name: string}} ValueGroup
 */

/**
 * @param {string} name - A file of the source dataset.
 * @returns {ValueGroup[]}
 */
function readSource(name) {
    return JSON.parse(readFileSync(path.join(SOURCE_DIR, name), 'utf8'));
}

/**
 * The booklet id with its trailing number replaced: `26-V8-DE-TH-1` → `26-V8-DE-TH-2`.
 * @param {string} bookletId - A single-booklet id.
 * @param {number} number
 * @returns {string}
 */
function bookletNumbered(bookletId, number) {
    return bookletId.replace(/\d+$/, String(number));
}

/**
 * One value group with its booklet rewritten, or unchanged when its Fach keeps one booklet
 * or it names none.
 * @param {ValueGroup} entry - A competence-levels value group.
 * @returns {ValueGroup}
 */
function rebooked(entry) {
    const groups = BOOKLET_BY_GROUP[entry.subject?.name ?? ''];
    const bookletId = getPropertyText(entry.properties, PROPERTY_KEY.BOOKLET);
    if (!groups || !bookletId) return entry;

    const groupName =
        entry.type === VALUE_GROUP_TYPE.STUDENT
            ? readCovariate(entry.covariates, COVARIATE_TYPE.GROUP)
            : entry.type === VALUE_GROUP_TYPE.GROUP
              ? entry.name
              : null;
    const numbers = groupName
        ? [groups[groupName]]
        : [...new Set(Object.values(groups))].sort((a, b) => a - b);
    if (numbers.some((number) => number === undefined)) {
        throw new Error(`no booklet for group ${groupName} in ${entry.subject?.name}`);
    }
    const value = numbers.map((number) => bookletNumbered(bookletId, number)).join(',');
    return {
        ...entry,
        properties: (entry.properties ?? []).map((property) =>
            property.key === PROPERTY_KEY.BOOKLET ? { ...property, value } : property,
        ),
    };
}

const competenceLevels = readSource('competence-levels.json').map(rebooked);

if (!process.argv.includes('--check')) mkdirSync(OUT_DIR, { recursive: true });
generateOrCheck({
    files: [
        {
            outPath: path.join(OUT_DIR, 'competence-levels.json'),
            content: serializeFixture(competenceLevels),
        },
        {
            outPath: path.join(OUT_DIR, 'aggregations.json'),
            content: serializeFixture(readSource('aggregations.json')),
        },
    ],
    staleMessage: `FAIL ${path.relative(repoRoot, OUT_DIR)} does not match its source — rerun without --check`,
    okMessage: `OK   ${path.relative(repoRoot, OUT_DIR)} matches its source`,
    wroteMessage: `wrote ${path.relative(repoRoot, OUT_DIR)}: ${competenceLevels.length} value-groups`,
});
