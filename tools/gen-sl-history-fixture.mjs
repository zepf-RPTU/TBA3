/**
 * Regenerate `public/data/sl/sl/history.json` — the demo school's longitudinal timeline.
 *
 *   node tools/gen-sl-history-fixture.mjs [--check]
 *
 * A live scope gets this document from the API, which answers
 * `?type=school,students&comparison=year` by generating the prior years it has no cohort
 * for. The demo fixture has no API, so the same years are derived here from what
 * `public/data/sl/sl/` already carries and committed.
 *
 * The band generator seeds every draw with SHA-256, varies each share by +/-15 % and
 * floors and reconciles back to integer headcounts; the seed spells a missing part as
 * `''`. The committed fixture is the reference.
 *
 * The survey rows (`tq_mean` / `sp_mean`) are **fixture-only**. That asymmetry already
 * exists — `students_competence-levels.json` carries the same two properties for the
 * current year.
 *
 * `--check` regenerates in memory and diffs against the committed file, so CI-style
 * checks can prove the fixture still matches its inputs.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateOrCheck } from './lib/generatedFile.mjs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SL_DIR = path.join(ROOT, 'public', 'data', 'sl', 'sl');
const OUT = path.join(SL_DIR, 'history.json');

// ── Constants ────────────────────────────────────────────────────────────────

/** The measured cycle, the test year the API reports for its own scopes. */
const CURRENT_YEAR = 2026;

/** How many cycles back the API's `comparison=year` answers with. */
const HISTORY_YEARS = 4;

/** Per-band multiplicative variation, ± half of this. */
const BAND_VARIATION = 0.3;

/** A varied share never reaches zero — a vanished band would read as a real change. */
const MIN_BAND_SHARE = 0.001;

/** Per-student multiplicative variation for the 1–5 survey scales, ± half of this. */
const SURVEY_VARIATION = 0.3;

/** The rating scales' bounds; a generated value never leaves them. */
const SURVEY_RANGE = [1, 5];

const TEST_PERIOD_KEY = 'testPeriod';
const SIMULATED_KEY = 'simulated';

/** Properties a generated group keeps. The rest is per-year-identical prose. */
const CARRIED_PROPERTIES = new Set(['schoolType', 'competenceScale']);

/**
 * Property key prefixes carried through as a group. `standardRank:<level id>` is what
 * tells the client which KMK standard each band reports — the client derives it from
 * nothing, so a generated year that dropped it would register a rankless scale and every
 * standard-based metric would read as unknown on the earlier years alone.
 */
const CARRIED_PROPERTY_PREFIXES = ['standardRank:'];

/**
 * Whether a measured property belongs on a generated row.
 * @param {{key?: string}} property - One entry of the measured row's `properties`.
 * @returns {boolean} True when the generated row must repeat it.
 */
function isCarriedProperty(property) {
    const key = String(property?.key ?? '');
    return (
        CARRIED_PROPERTIES.has(key) ||
        CARRIED_PROPERTY_PREFIXES.some((prefix) => key.startsWith(prefix))
    );
}

// ── Seeded draws ─────────────────────────────────────────────────────────────

/**
 * A stable value in [0, 1) for one seed. SHA-256 rather than a cheap string hash so the
 * draws do not depend on the runtime.
 * @param {string} seed - The full identity of the value being drawn.
 * @returns {number} A draw in [0, 1).
 */
function unit(seed) {
    const digest = createHash('sha256').update(seed, 'utf8').digest();
    return Number(digest.readBigUInt64BE(0)) / 2 ** 64;
}

/**
 * Join seed parts — a missing part is `''`, never the language's spelling of null.
 * @param {Array<string|number|null|undefined>} parts - The identity parts.
 * @returns {string} The seed.
 */
function seedOf(parts) {
    return parts.map((part) => (part === null || part === undefined ? '' : String(part))).join(':');
}

// ── Band history ─────────────────────────────────────────────────────────────

/**
 * Vary a band distribution, keeping `sum(frequency) === total` exactly.
 * @param {Array<object>} levels - The measured `competenceLevels[]`.
 * @param {string} seed - Identity of the (value-group, year) being generated.
 * @returns {Array<object>} The generated levels, description dropped.
 */
function varyLevels(levels, seed) {
    const total = levels[0]?.descriptiveStatistics?.total ?? 0;
    const counted = levels.reduce(
        (sum, lvl) => sum + (lvl.descriptiveStatistics?.frequency ?? 0),
        0,
    );
    if (total <= 0 || counted <= 0) {
        return levels.map((lvl) =>
            generatedLevel(lvl, lvl.descriptiveStatistics?.frequency ?? 0, total),
        );
    }

    const varied = levels.map((lvl, index) => {
        const share = lvl.descriptiveStatistics.frequency / total;
        const factor = 1 + (unit(`${seed}:${index}`) - 0.5) * BAND_VARIATION;
        return Math.max(MIN_BAND_SHARE, share * factor);
    });

    const scale = varied.reduce((a, b) => a + b, 0);
    const frequencies = varied.map((value) => Math.floor((value / scale) * total));
    const remainder = total - frequencies.reduce((a, b) => a + b, 0);
    if (remainder) {
        frequencies[frequencies.indexOf(Math.max(...frequencies))] += remainder;
    }

    return levels.map((lvl, index) => generatedLevel(lvl, frequencies[index], total));
}

/**
 * One generated `competenceLevels[]` entry, without the band prose.
 * @param {object} level - The measured level it derives from.
 * @param {number} frequency - Its generated headcount.
 * @param {number} total - The cohort size.
 * @returns {object} The generated level.
 */
function generatedLevel(level, frequency, total) {
    return {
        id: level.id ?? null,
        name: level.name ?? null,
        nameShort: level.nameShort,
        descriptiveStatistics: {
            total,
            mean: total ? Number((frequency / total).toFixed(4)) : 0,
            frequency,
        },
    };
}

/**
 * One measured value-group, re-reported for `year` with varied statistics.
 * @param {object} entry - The measured school value-group.
 * @param {number} year - The year being generated.
 * @returns {object} The generated value-group.
 */
function generatedGroup(entry, year) {
    const seed = seedOf([entry.id, entry.type, entry.subject?.name, entry.domain?.id, year]);
    const carried = (entry.properties ?? []).filter(isCarriedProperty);
    return {
        id: entry.id ?? null,
        type: entry.type ?? null,
        name: entry.name,
        domain: entry.domain ?? null,
        subject: entry.subject ?? null,
        properties: [
            ...carried,
            { key: TEST_PERIOD_KEY, value: String(year) },
            { key: SIMULATED_KEY, value: 'true' },
        ],
        competenceLevels: varyLevels(entry.competenceLevels ?? [], seed),
    };
}

// ── Survey history (fixture-only; no API counterpart) ────────────────────────

/**
 * Vary one student's rating, clamped to the scale's bounds.
 *
 * Per **student**, not per aggregate: the box plot then reads real order statistics for
 * every year, where the generator this replaces derived q1/q3 from mean ± 0.675·SD and
 * only the measured year had true quartiles.
 * @param {number} value - The measured rating.
 * @param {string} seed - Identity of the (student, measure, year).
 * @returns {number} The generated rating, 4 dp.
 */
function varyRating(value, seed) {
    const [min, max] = SURVEY_RANGE;
    const varied = value * (1 + (unit(seed) - 0.5) * SURVEY_VARIATION);
    return Number(Math.min(max, Math.max(min, varied)).toFixed(4));
}

/**
 * The survey rows for one year: one per (student, subject), carrying both measures.
 *
 * Both measures ride on every row: the reader averages a student's rows before the
 * cohort average, and `sp_mean` is pinned per student above, so repeating it is exact.
 *
 * `competenceLevels` is empty by design: these rows exist to carry the two survey
 * properties, and the year's band distribution is already on the school rows. The
 * student ids are the measured year's, so the per-domain student filter in the teaching
 * quality chart keeps working across years.
 * @param {Array<object>} measured - One row per (student, subject) from the measured year.
 * @param {number} year - The year to emit.
 * @returns {Array<object>} The year's survey value-groups.
 */
function surveyRows(measured, year) {
    const simulated = year !== CURRENT_YEAR;
    return measured.map((row) => ({
        id: row.id,
        type: 'student',
        name: row.name,
        subject: row.subject,
        properties: [
            {
                key: 'tq_mean',
                value: simulated
                    ? String(varyRating(row.tq, seedOf([row.id, row.subject.name, 'tq', year])))
                    : row.tqRaw,
            },
            {
                key: 'sp_mean',
                value: simulated
                    ? String(varyRating(row.sp, seedOf([row.id, 'sp', year])))
                    : row.spRaw,
            },
            { key: TEST_PERIOD_KEY, value: String(year) },
            ...(simulated ? [{ key: SIMULATED_KEY, value: 'true' }] : []),
        ],
        competenceLevels: [],
    }));
}

/**
 * One row per (student, subject) with both survey values, in payload order.
 * @param {Array<object>} students - Raw students_competence-levels.json.
 * @returns {Array<object>} The measured survey rows.
 */
function measuredSurveyRows(students) {
    // Selbstwirksamkeit is asked of the student, not of the student *per Fach*, so one
    // value is pinned per id and repeated on that student's rows. The source document
    // varies it row to row, which is an artefact of how the demo data was written; the
    // reader this feeds averages a student's rows, and averaging a value that is
    // supposed to be a single measurement would quietly move it. First row wins, which
    // is also what the deleted `buildSelfEfficacyArrayFromJson` did.
    const spByStudent = new Map();
    for (const entry of students) {
        if (spByStudent.has(entry.id)) continue;
        const value = entry.properties?.find((p) => p.key === 'sp_mean')?.value;
        if (value !== undefined) spByStudent.set(entry.id, value);
    }

    const seen = new Set();
    const rows = [];
    for (const entry of students) {
        const subject = entry.subject?.name;
        const key = `${entry.id}|${subject}`;
        if (!subject || seen.has(key)) continue;
        const tqRaw = entry.properties?.find((p) => p.key === 'tq_mean')?.value;
        const spRaw = spByStudent.get(entry.id);
        if (tqRaw === undefined || spRaw === undefined) continue;
        seen.add(key);
        rows.push({
            id: entry.id,
            name: entry.name,
            subject: entry.subject,
            tq: Number(tqRaw),
            sp: Number(spRaw),
            tqRaw,
            spRaw,
        });
    }
    return rows;
}

// ── Build ────────────────────────────────────────────────────────────────────

/**
 * Read one of the demo fixture's documents.
 * @param {string} name - Its file name.
 * @returns {any} The parsed document.
 */
function readFixture(name) {
    // Two of the demo documents are UTF-8 with a BOM, two without; `fetch().json()` in
    // the browser copes with either, `JSON.parse` does not.
    const text = readFileSync(path.join(SL_DIR, name), 'utf8');
    return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
}

/**
 * The whole history document, in the order the endpoint reports it: the measured rows
 * first, then one block per generated year, oldest first.
 * @returns {Array<object>} The value-groups.
 */
function build() {
    const levels = readFixture('competence-levels.json');
    const students = readFixture('students_competence-levels.json');

    const schoolRows = levels.filter((entry) => entry.type === 'school');
    if (schoolRows.length === 0) throw new Error('no type="school" rows in competence-levels.json');

    const survey = measuredSurveyRows(students);
    const years = Array.from({ length: HISTORY_YEARS }, (_, i) => CURRENT_YEAR - HISTORY_YEARS + i);

    // The measured year, carried at the same shape as the generated ones — one document,
    // one read path, no "current year comes from somewhere else" branch in the client.
    const measured = schoolRows.map((entry) => ({
        id: entry.id ?? null,
        type: entry.type,
        name: entry.name,
        domain: entry.domain ?? null,
        subject: entry.subject ?? null,
        properties: [
            ...(entry.properties ?? []).filter(isCarriedProperty),
            { key: TEST_PERIOD_KEY, value: String(CURRENT_YEAR) },
        ],
        competenceLevels: (entry.competenceLevels ?? []).map((lvl) =>
            generatedLevel(
                lvl,
                lvl.descriptiveStatistics.frequency,
                lvl.descriptiveStatistics.total,
            ),
        ),
    }));

    return [
        ...measured,
        ...surveyRows(survey, CURRENT_YEAR),
        ...years.flatMap((year) => [
            ...schoolRows.map((entry) => generatedGroup(entry, year)),
            ...surveyRows(survey, year),
        ]),
    ];
}

const document = build();
const years = [
    ...new Set(document.map((g) => g.properties.find((p) => p.key === TEST_PERIOD_KEY)?.value)),
];

generateOrCheck({
    files: [{ outPath: OUT, content: `${JSON.stringify(document, null, 2)}\n` }],
    staleMessage: `FAIL ${path.relative(ROOT, OUT)} does not match its inputs — rerun without --check`,
    okMessage: `OK   ${path.relative(ROOT, OUT)} matches its inputs (${document.length} value-groups)`,
    wroteMessage: `wrote ${path.relative(ROOT, OUT)}: ${document.length} value-groups, years ${years.join(', ')}`,
});
