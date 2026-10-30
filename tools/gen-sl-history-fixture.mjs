/**
 * Regenerate the earlier years in `public/data/sl/sl/competence-levels.json` — the demo
 * school's longitudinal timeline.
 *
 *   node tools/gen-sl-history-fixture.mjs [--check]
 *
 * A live scope gets them from the API's `comparison=year` answer, every value group
 * stamped with its `testPeriod`. The demo fixture has no API, so the file's current-year
 * value groups are stamped and the earlier years derived from them here, and the result
 * committed.
 *
 * Every series (a Bereich's bands, a Fach's Unterrichtsqualität, the school's
 * Selbstwirksamkeit) walks away from its measured value year by year, so the timeline
 * shows a development and not the measured year five times over.
 *
 * The generated survey value groups (`tq_mean` / `sp_mean`) are fixture-only: the
 * measured student value groups carry the two properties for the current year, which a
 * questionnaire-less API does not.
 *
 * `--check` regenerates in memory and diffs against the committed file, so CI-style
 * checks can prove the fixture still matches its inputs.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
    PROPERTY_KEY,
    VALUE_GROUP_TYPE,
} from '../packages/modules/src/common/domain/apiValueMaps.js';
import {
    getPropertyText,
    getPropertyValue,
} from '../packages/modules/src/common/domain/studentIdentity.js';
import { generateOrCheck, serializeFixture } from './lib/generatedFile.mjs';
import { repoRoot } from './lib/repo.mjs';

const SL_DIR = path.join(repoRoot, 'public', 'data', 'sl', 'sl');
const OUT = path.join(SL_DIR, 'competence-levels.json');

/** The measured cycle, the test year the API reports for its own scopes. */
const CURRENT_YEAR = 2026;

/** How many cycles back the API's `comparison=year` answers with. */
const HISTORY_YEARS = 4;

/** Per-band multiplicative variation, ± half of this. */
const BAND_VARIATION = 0.3;

/**
 * The largest step a Bereich's band tilt takes per year. The tilt moves the cohort up
 * (positive) or down the bands and accumulates backwards from the measured year.
 */
const BAND_TILT_STEP = 0.25;

/** A varied share never reaches zero — a vanished band would read as a real change. */
const MIN_BAND_SHARE = 0.001;

/**
 * Per-student variation for the 1–5 survey scales, ± half of this. Like the two below it
 * is in logits of the scale position: one logit is about one scale point mid-scale and
 * less and less towards either bound.
 */
const SURVEY_VARIATION = 0.9;

/** The largest step a survey series' level takes per year. */
const SURVEY_DRIFT_STEP = 0.3;

/** Per-year variation of a survey series' spread around its mean, ± half of this. */
const SURVEY_SPREAD_VARIATION = 0.6;

/** The rating scales' bounds; a generated value never reaches them. */
const SURVEY_RANGE = [1, 5];

/**
 * The largest step per year, in scale points, of how far short of a bound a generated
 * year's ratings stop; one walk per series and bound. A large cohort's measured ratings
 * span the whole scale, so without it every year's whiskers would end at the same two
 * values.
 */
const SURVEY_HEADROOM_STEP = 0.25;

/**
 * How close to a bound, as a share of the scale, a measured rating counts as: a rating on
 * the bound itself has no finite logit.
 */
const SURVEY_EDGE = 0.02;

/**
 * @typedef {{ key: string, value: string }} Property
 * @typedef {{ total?: number, frequency?: number, mean?: number }} LevelStatistics
 * @typedef {{ id?: string, name?: string, nameShort?: string, descriptiveStatistics?: LevelStatistics }} Level
 * @typedef {object} ValueGroup
 * @property {string} [id] - The scope or student id.
 * @property {string} [type] - `school`, `student`, ...
 * @property {string} [name]
 * @property {{ id?: string }} [domain] - The domain, when the value group is per domain.
 * @property {{ name?: string }} [subject]
 * @property {Property[]} [properties]
 * @property {Level[]} [competenceLevels] - The band distribution.
 * @typedef {{ id: string, name?: string, subject: { name?: string }, tq: number, sp: number }} SurveyRow
 * @typedef {{ middle: number, shift: number, spread: number, low: number, high: number }} SeriesEffect
 */

/**
 * The API's subject codes, as its booklet ids spell them (`26-V8-DE-TH-1`).
 * @type {{[subject: string]: string}}
 */
const SUBJECT_CODES = { Deutsch: 'DE', Englisch: 'EN', Mathematik: 'MA', Französisch: 'FR' };

// ── Seeded draws ─────────────────────────────────────────────────────────────

/**
 * A stable value in [0, 1) for one seed. SHA-256 rather than a cheap string hash so the
 * draws do not depend on the runtime.
 * @param {string} seed - The full identity of the value being drawn.
 * @returns {number}
 */
function unit(seed) {
    const digest = createHash('sha256').update(seed, 'utf8').digest();
    return Number(digest.readBigUInt64BE(0)) / 2 ** 64;
}

/**
 * Join seed parts — a missing part is `''`, never the language's spelling of null.
 * @param {Array<string|number|null|undefined>} parts
 * @returns {string}
 */
function seedOf(parts) {
    return parts.map((part) => (part === null || part === undefined ? '' : String(part))).join(':');
}

/**
 * A series' offset in `year`: a random walk back from the measured year, where it is 0.
 * A walk, not one draw per year, so neighbouring years are related and the timeline
 * reads as a trend that ends at the measured value. Every step is at least half of
 * `step` long, either way, so no year repeats its neighbour.
 * @param {string} seed - Identity of the series.
 * @param {number} year
 * @param {number} step - The largest step per year.
 * @returns {number} The accumulated offset.
 */
function drift(seed, year, step) {
    let total = 0;
    for (let y = year; y < CURRENT_YEAR; y++) {
        const draw = unit(`${seed}:drift:${y}`) * 2 - 1;
        total += Math.sign(draw) * (0.5 + Math.abs(draw) / 2) * step;
    }
    return total;
}

// ── Band history ─────────────────────────────────────────────────────────────

/**
 * Vary a band distribution, keeping `sum(frequency) === total` exactly.
 * @param {Level[]} levels - The measured `competenceLevels[]`.
 * @param {string} seed - Identity of the (value-group, year) being generated.
 * @param {number} tilt - The year's shift along the bands, lowest band first.
 * @returns {Level[]} The generated levels, description dropped.
 */
function varyLevels(levels, seed, tilt) {
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
        const share = (lvl.descriptiveStatistics?.frequency ?? 0) / total;
        const factor = 1 + (unit(`${seed}:${index}`) - 0.5) * BAND_VARIATION;
        // −1 on the lowest band, +1 on the highest.
        const position = levels.length > 1 ? (index / (levels.length - 1)) * 2 - 1 : 0;
        return Math.max(MIN_BAND_SHARE, share * factor * (1 + tilt * position));
    });

    const scale = varied.reduce((a, b) => a + b, 0);
    const frequencies = varied.map((value) => Math.floor((value / scale) * total));
    const remainder = total - frequencies.reduce((a, b) => a + b, 0);
    if (remainder) {
        frequencies[frequencies.indexOf(Math.max(...frequencies))] += remainder;
    }

    return levels.map((lvl, index) => generatedLevel(lvl, frequencies[index] ?? 0, total));
}

/**
 * One generated `competenceLevels[]` entry, without the band prose.
 * @param {Level} level - The measured level it derives from.
 * @param {number} frequency - Its generated headcount.
 * @param {number} total - The cohort size.
 * @returns {Level}
 */
function generatedLevel(level, frequency, total) {
    return {
        id: level.id,
        name: level.name,
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
 * @param {ValueGroup} entry - The measured school value-group.
 * @param {number} year
 * @returns {ValueGroup}
 */
function generatedGroup(entry, year) {
    const series = seedOf([entry.id, entry.type, entry.subject?.name, entry.domain?.id]);
    const tilt = drift(series, year, BAND_TILT_STEP);
    return {
        id: entry.id,
        type: entry.type,
        name: entry.name,
        domain: entry.domain,
        subject: entry.subject,
        properties: [{ key: PROPERTY_KEY.TEST_PERIOD, value: String(year) }],
        competenceLevels: varyLevels(entry.competenceLevels ?? [], `${series}:${year}`, tilt),
    };
}

// ── Survey history (fixture-only; no API counterpart) ────────────────────────

/**
 * @param {number} rating - A rating on the scale.
 * @returns {number} The logit of its position on the scale, kept `SURVEY_EDGE` off the bounds.
 */
function logit(rating) {
    const [min, max] = SURVEY_RANGE;
    const position = (rating - min) / (max - min);
    const inside = Math.min(1 - SURVEY_EDGE, Math.max(SURVEY_EDGE, position));
    return Math.log(inside / (1 - inside));
}

/**
 * Vary one student's rating within the scale's bounds.
 *
 * Per **student**, not per aggregate: the box plot then reads real order statistics for
 * every year, not q1/q3 derived from mean ± 0.675·SD.
 *
 * Varied as a logit of the scale position, not as a rating: the measured values already
 * reach both bounds, so varying the rating and clamping it piles a year's top and bottom
 * values onto 5 and 1, and every whisker ends on the bound.
 * @param {number} value - The measured rating.
 * @param {string} seed - Identity of the (student, measure, year).
 * @param {SeriesEffect} effect - What the year does to the student's whole series.
 * @returns {number} The generated rating, 4 dp.
 */
function varyRating(value, seed, { middle, shift, spread, low, high }) {
    const noised = logit(value) + (unit(seed) - 0.5) * SURVEY_VARIATION;
    const varied = middle + (noised - middle) * spread + shift;
    return Number((low + (high - low) / (1 + Math.exp(-varied))).toFixed(4));
}

/**
 * What `year` does to one survey series: its level drifts, its spread varies and its
 * ratings stop short of the bounds by a varying margin.
 * @param {string} series - Identity of the series.
 * @param {number} center - The series' measured mean.
 * @param {number} year
 * @returns {SeriesEffect}
 */
function seriesEffect(series, center, year) {
    const [min, max] = SURVEY_RANGE;
    return {
        middle: logit(center),
        low: min + Math.abs(drift(`${series}:low`, year, SURVEY_HEADROOM_STEP)),
        high: max - Math.abs(drift(`${series}:high`, year, SURVEY_HEADROOM_STEP)),
        shift: drift(series, year, SURVEY_DRIFT_STEP),
        spread: 1 + (unit(`${series}:spread:${year}`) - 0.5) * SURVEY_SPREAD_VARIATION,
    };
}

/**
 * @param {number[]} values - At least one.
 * @returns {number}
 */
function mean(values) {
    return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * The survey value groups for one generated year: one per (student, subject), carrying both
 * measures.
 *
 * Both measures ride on every value group: the reader averages a student's value groups before the
 * cohort average, and `sp_mean` is one value per student, so repeating it is exact.
 *
 * `competenceLevels` is empty by design: these value groups exist to carry the two survey
 * properties, and the year's band distribution is already on the school value groups. They
 * carry no Domäne, so each stands for its whole Fach in every Bereich of it.
 *
 * Unterrichtsqualität is one series per Fach, as the charts scope it, so each Fach shows
 * its own development; Selbstwirksamkeit is one series for the school.
 * @param {SurveyRow[]} measured - One row per (student, subject) from the measured year.
 * @param {number} year - The year to emit.
 * @returns {ValueGroup[]} The year's survey value-groups.
 */
function surveyValueGroups(measured, year) {
    const spByStudent = new Map(measured.map((row) => [row.id, row.sp]));
    const sp = seriesEffect('sp', mean([...spByStudent.values()]), year);
    const tqBySubject = new Map(
        [...new Set(measured.map((row) => row.subject.name))].map((subject) => {
            const ratings = measured.filter((row) => row.subject.name === subject);
            return [
                subject,
                seriesEffect(seedOf(['tq', subject]), mean(ratings.map((row) => row.tq)), year),
            ];
        }),
    );

    return measured.map((row) => ({
        id: row.id,
        type: VALUE_GROUP_TYPE.STUDENT,
        name: row.name,
        subject: row.subject,
        properties: [
            {
                key: PROPERTY_KEY.TEACHING_QUALITY_MEAN,
                value: String(
                    varyRating(
                        row.tq,
                        seedOf([row.id, row.subject.name, 'tq', year]),
                        /** @type {SeriesEffect} */ (tqBySubject.get(row.subject.name)),
                    ),
                ),
            },
            {
                key: PROPERTY_KEY.SELF_EFFICACY_MEAN,
                value: String(varyRating(row.sp, seedOf([row.id, 'sp', year]), sp)),
            },
            { key: PROPERTY_KEY.TEST_PERIOD, value: String(year) },
        ],
        competenceLevels: [],
    }));
}

/**
 * One row per (student, subject) with both survey values, in payload order: the base
 * each generated year varies.
 * @param {ValueGroup[]} students - The measured student value groups.
 * @returns {SurveyRow[]} The measured survey values.
 */
function measuredSurveyRows(students) {
    // Selbstwirksamkeit is asked of the student, not of the student *per Fach*: one value
    // per id, repeated on that student's value groups.
    const spByStudent = new Map();
    for (const entry of students) {
        if (spByStudent.has(entry.id)) continue;
        const value = getPropertyValue(entry.properties, PROPERTY_KEY.SELF_EFFICACY_MEAN);
        if (value !== null) spByStudent.set(entry.id, value);
    }

    const seen = new Set();
    const rows = [];
    for (const entry of students) {
        const { id, subject } = entry;
        const key = `${id}|${subject?.name}`;
        if (!id || !subject?.name || seen.has(key)) continue;
        // A missing rating, or one that is no number (`k. A.`), has no history; it would
        // also turn its series' mean, and with it every rating generated from it, into NaN.
        const tq = getPropertyValue(entry.properties, PROPERTY_KEY.TEACHING_QUALITY_MEAN);
        const sp = spByStudent.get(id) ?? null;
        if (tq === null || sp === null) continue;
        seen.add(key);
        rows.push({ id, name: entry.name, subject, tq, sp });
    }
    return rows;
}

// ── Build ────────────────────────────────────────────────────────────────────

/**
 * Read one of the demo fixture's documents.
 * @param {string} name - Its file name.
 * @returns {ValueGroup[]}
 */
function readFixture(name) {
    // A BOM is tolerated: `fetch().json()` in the browser copes with one, `JSON.parse`
    // does not.
    const text = readFileSync(path.join(SL_DIR, name), 'utf8');
    return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
}

/**
 * Stamp a measured value-group as the API does: the current year, and the booklet its
 * Fach was tested with (one VERA-8 booklet per Fach). Each is appended, and left alone
 * when the value group already carries it. The generated earlier years carry no booklet, as the
 * API's do not.
 * @param {ValueGroup} entry - A measured value-group.
 * @returns {ValueGroup} The entry itself when nothing was appended.
 */
function stamped(entry) {
    const properties = [...(entry.properties ?? [])];
    /**
     * @param {string} key
     * @returns {boolean} Whether the value group already carries it.
     */
    const has = (key) => properties.some((p) => p.key === key);
    if (!has(PROPERTY_KEY.TEST_PERIOD)) {
        properties.push({ key: PROPERTY_KEY.TEST_PERIOD, value: String(CURRENT_YEAR) });
    }
    const subjectCode = SUBJECT_CODES[entry.subject?.name ?? ''];
    if (subjectCode && !has(PROPERTY_KEY.BOOKLET)) {
        properties.push({
            key: PROPERTY_KEY.BOOKLET,
            value: `${String(CURRENT_YEAR).slice(-2)}-V8-${subjectCode}-TH-1`,
        });
    }
    return properties.length === (entry.properties?.length ?? 0) ? entry : { ...entry, properties };
}

/**
 * The whole competence-levels answer, in the order the endpoint reports it: the measured
 * value groups first, then one block per generated year, oldest first.
 * @returns {Array<object>}
 */
function build() {
    // One answer holds the school, group, Landesschnitt and student value groups, and — once this
    // has run — the generated years, which are regenerated rather than kept.
    const measured = readFixture('competence-levels.json')
        .filter((entry) => {
            const period = getPropertyText(entry.properties, PROPERTY_KEY.TEST_PERIOD);
            return period === null || Number(period) === CURRENT_YEAR;
        })
        .map(stamped);
    const students = measured.filter((entry) => entry.type === VALUE_GROUP_TYPE.STUDENT);

    const schools = measured.filter((entry) => entry.type === VALUE_GROUP_TYPE.SCHOOL);
    if (schools.length === 0)
        throw new Error('no type="school" value groups in competence-levels.json');

    const survey = measuredSurveyRows(students);
    const years = Array.from({ length: HISTORY_YEARS }, (_, i) => CURRENT_YEAR - HISTORY_YEARS + i);

    return [
        ...measured,
        ...years.flatMap((year) => [
            ...schools.map((entry) => generatedGroup(entry, year)),
            ...surveyValueGroups(survey, year),
        ]),
    ];
}

/** @type {ValueGroup[]} */
const document = build();
const years = [
    ...new Set(document.map((g) => getPropertyText(g.properties, PROPERTY_KEY.TEST_PERIOD))),
];

generateOrCheck({
    files: [{ outPath: OUT, content: serializeFixture(document) }],
    staleMessage: `FAIL ${path.relative(repoRoot, OUT)} does not match its inputs — rerun without --check`,
    okMessage: `OK   ${path.relative(repoRoot, OUT)} matches its inputs (${document.length} value-groups)`,
    wroteMessage: `wrote ${path.relative(repoRoot, OUT)}: ${document.length} value-groups, years ${years.join(', ')}`,
});
