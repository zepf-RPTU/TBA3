/**
 * Reads the SL Entwicklung view's timeline out of `history.json`.
 *
 * This is the seam that used to *invent* the timeline. It now only reads: the years,
 * which of them are measured, and each
 * year's numbers all come from the payload. The API generates the years it has no
 * cohort for and flags them (`comparison=year-<jahr>`), so nothing in the browser
 * fabricates a value it then plots.
 *
 * Provenance is `properties[simulated]`: a value-group carrying `"true"` is generated,
 * anything else is measured. The year is `properties[testPeriod]`, on measured and
 * generated rows alike — which is why the view no longer hardcodes a current year.
 *
 * Two granularities live in one document:
 *   - `type: 'school'` rows carry the Kompetenzstufen per (Fach, Domäne).
 *   - `type: 'student'` rows carry `tq_mean` / `sp_mean`. **Demo fixture only** — a
 *     scope without questionnaire data carries neither on its student rows, and the
 *     survey charts gate themselves off (`detectHistorySurveyScales`).
 */

const TEST_PERIOD_KEY = 'testPeriod';
const SIMULATED_KEY = 'simulated';

/**
 * One property's value off a value-group.
 * @param {object} entry - The value-group.
 * @param {string} key - The property key.
 * @returns {string|undefined} Its value, or undefined when absent.
 */
function property(entry, key) {
    return entry?.properties?.find((p) => p.key === key)?.value;
}

/**
 * The year a value-group belongs to.
 * @param {object} entry - The value-group.
 * @returns {string|undefined} Its `testPeriod`, or undefined when unstamped.
 */
function yearOf(entry) {
    return property(entry, TEST_PERIOD_KEY);
}

/**
 * Whether a value-group is measured rather than generated.
 * @param {object} entry - The value-group.
 * @returns {boolean} True unless the payload flags it as simulated.
 */
function isMeasured(entry) {
    return property(entry, SIMULATED_KEY) !== 'true';
}

/**
 * The timeline's x-axis: every year the document carries, oldest first.
 *
 * Sorted numerically rather than lexically — a four-digit year sorts the same either
 * way today, but the payload's order is the server's emission order, not a promise.
 * @param {Array<object>|null|undefined} history - Raw history.json.
 * @returns {string[]} The years, oldest first; empty when the document is absent.
 */
export function buildYearAxis(history) {
    const years = new Set();
    for (const entry of history ?? []) {
        const year = yearOf(entry);
        if (year) years.add(year);
    }
    return [...years].sort((a, b) => Number(a) - Number(b));
}

/**
 * The Kompetenzstufen timeline for one (Fach, Domäne).
 *
 * Percentages are derived as `frequency / total`, not read from the payload's `mean`:
 * `mean` is rounded to 4 dp at the source, and the charts stack these shares to 100 %.
 *
 * A year whose bands are all empty is dropped rather than plotted — it is "no result
 * for this domain", and a row of zeros renders as a confident flat line.
 * @param {Array<object>|null|undefined} history - Raw history.json.
 * @param {string} subject - The Fach, matched against `subject.name`.
 * @param {string|null} domainId - The Domäne, matched against `domain.id`; null for a Fach with no split.
 * @returns {Array<{year: string, measured: boolean, categories: {[level: string]: number}}>} One entry per year that has data, oldest first.
 */
export function buildKsHistory(history, subject, domainId) {
    const wanted = domainId ?? null;
    const rows = (history ?? []).filter(
        (entry) =>
            entry?.type === 'school' &&
            entry.subject?.name === subject &&
            (entry.domain?.id ?? null) === wanted,
    );

    const timeline = [];
    for (const entry of rows) {
        const year = yearOf(entry);
        if (!year) continue;

        const categories = /** @type {{[level: string]: number}} */ ({});
        let total = 0;
        let counted = 0;
        for (const level of entry.competenceLevels ?? []) {
            const stats = level.descriptiveStatistics ?? {};
            total = stats.total ?? total;
            counted += stats.frequency ?? 0;
            categories[level.nameShort] = stats.frequency ?? 0;
        }
        if (!(total > 0) || !(counted > 0)) continue;

        for (const level of Object.keys(categories)) {
            categories[level] = (categories[level] / total) * 100;
        }
        timeline.push({ year, measured: isMeasured(entry), categories });
    }

    return timeline.sort((a, b) => Number(a.year) - Number(b.year));
}

/**
 * The per-student survey values per year, for one measure.
 *
 * Returns raw values rather than statistics so every year goes through the same
 * `calculateRatingDistribution` / `calculateDetailedBoxPlotStats` the measured year always
 * used. The generator this replaced varied the *aggregate* and derived q1/q3 from
 * mean ± 0.675·SD, so only the measured year had true quartiles; now every year does.
 * @param {Array<object>|null|undefined} history - Raw history.json.
 * @param {'tq_mean'|'sp_mean'} propertyKey - Which measure to read.
 * @param {{subject?: string, studentIds?: Set<string>}} [filter] - Restrict to one Fach and/or a set of students.
 * @returns {Array<{year: string, measured: boolean, values: number[]}>} One entry per year that has values, oldest first.
 */
export function buildSurveyHistory(history, propertyKey, { subject, studentIds } = {}) {
    /** @type {Map<string, {year: string, measured: boolean, perStudent: Map<string, {sum: number, count: number}>}>} */
    const byYear = new Map();

    for (const entry of history ?? []) {
        if (entry?.type !== 'student') continue;
        if (subject !== undefined && entry.subject?.name !== subject) continue;
        if (studentIds && !studentIds.has(entry.id)) continue;

        const year = yearOf(entry);
        const raw = property(entry, propertyKey);
        if (!year || raw === undefined) continue;

        const value = parseFloat(raw);
        if (!Number.isFinite(value)) continue;

        let slice = byYear.get(year);
        if (!slice) {
            slice = { year, measured: isMeasured(entry), perStudent: new Map() };
            byYear.set(year, slice);
        }
        // Averaged per student first, then handed on as one value per student: a student
        // sitting several subjects would otherwise weigh more than one sitting one.
        let running = slice.perStudent.get(entry.id);
        if (!running) {
            running = { sum: 0, count: 0 };
            slice.perStudent.set(entry.id, running);
        }
        running.sum += value;
        running.count += 1;
    }

    return [...byYear.values()]
        .map(({ year, measured, perStudent }) => ({
            year,
            measured,
            values: [...perStudent.values()].map(({ sum, count }) => sum / count),
        }))
        .filter((slice) => slice.values.length > 0)
        .sort((a, b) => Number(a.year) - Number(b.year));
}

/**
 * Which survey timelines the document carries. The Verlauf cards and the header's
 * boxplot toggle gate on this, so a survey card exists exactly when it has a year to draw.
 * @param {Array<object>|null|undefined} history - Raw history.json.
 * @returns {{hasTeachingQuality: boolean, hasSelfEfficacy: boolean}} Whether any year carries `tq_mean` / `sp_mean`.
 */
export function detectHistorySurveyScales(history) {
    return {
        hasTeachingQuality: buildSurveyHistory(history, 'tq_mean').length > 0,
        hasSelfEfficacy: buildSurveyHistory(history, 'sp_mean').length > 0,
    };
}
