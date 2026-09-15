/**
 * EN Scatter Point Adapter — Turns flat class-table student records into the
 * points the scatterplot draws, and one domain's Äquivalenztabelle into the
 * bands its axes classify them against.
 *
 * The renderer's interface is the drawn shape, not the table's column scheme:
 * the `{dataKey}Percentage` / `{dataKey}CompLevel` naming, the `"73.5%"` string
 * format and the "no usable percentage → not plotted" rule all live here.
 */
/**
 * The slice of a host's EN configuration this adapter reads. Stated here rather than
 * imported: a host builds its config however it likes, and what the package needs from
 * it is exactly this.
 * @typedef {object} EnPointConfig
 * @property {string[]} domainIds - The two domain ids, in display order.
 * @property {(domainId: string, suffix: string) => string|null} fieldName - The student-record column for one domain and field.
 * @property {{[domainId: string]: EquivalenceTable}} equivalenceTables - Per-domain Äquivalenztabelle. The map is required; a domain the payload carries none for is simply absent from it.
 */

/**
 * One domain's Äquivalenztabelle, as the payload delivers it.
 * @typedef {object} EquivalenceTable
 * @property {number} maxScore - Top of the band scale (last band's max).
 * @property {number} [itemCount] - Items of this domain on the booklet.
 * @property {number} [studentCount] - Scored students of the value-group on this booklet.
 * @property {Array<{nameShort: string, minScore: number, maxScore: number}>} bands - Ascending, boundaries inclusive.
 */

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Build scatterplot points from the flat student records the class table uses.
 *
 * A record whose percentage is missing or does not parse yields `NaN`, which fails both
 * `>= 0` comparisons and drops the student from the result. That is deliberate: a student
 * the payload gives no usable score for must be absent from the plot, never drawn
 * at an invented origin where a reader would take them for a zero.
 * @param {Array<object>|null|undefined} students - Flat student records from {@link module:enStudentDataAdapter}, or nothing.
 * @param {EnPointConfig} enConfig - Domain/field config supplying the column names.
 * @returns {Array<object>} One point per plottable student, in input order.
 */
export function toScatterPoints(students, enConfig) {
    if (!students) return [];
    const [d0, d1] = enConfig.domainIds;

    return students
        .map((student) => {
            const d0Result = student[enConfig.fieldName(d0, 'SummedResult') ?? ''] || 0;
            const d1Result = student[enConfig.fieldName(d1, 'SummedResult') ?? ''] || 0;

            const d0Percentage = parsePercentage(
                student[enConfig.fieldName(d0, 'Percentage') ?? ''],
            );
            const d1Percentage = parsePercentage(
                student[enConfig.fieldName(d1, 'Percentage') ?? ''],
            );

            return {
                studentId: student.studentId,
                lastName: student.lastName || '',
                firstName: student.firstName || '',
                d0Result,
                d1Result,
                d0Percentage,
                d1Percentage,
                d0Ger: student[enConfig.fieldName(d0, 'CompLevel') ?? ''] || 'N/A',
                d1Ger: student[enConfig.fieldName(d1, 'CompLevel') ?? ''] || 'N/A',
                gender: student.gender,
            };
        })
        .filter((d) => d.d0Percentage >= 0 && d.d1Percentage >= 0);
}

/**
 * Threshold shape consumed by the scatterplot — keyed by domain.id.
 *
 * Read from the payload's `Äquivalenztabelle` (`enConfig.equivalenceTables`, off the
 * class's own value-group per domain), so the bands follow whatever scale the state
 * publishes — `A1…C1`, `A1.1…B1.2` or `k.h.N.…KS 5` — rather than a fixed GER ladder.
 * A domain whose payload carries no table yields `null`; the renderer then draws no
 * bands for that axis, which is the honest outcome and the loud one.
 * @param {EnPointConfig} enConfig - Config carrying the class's own equivalence tables.
 * @returns {{[domainId: string]: {ks: string[], ksPercentageThresholds: string[]}|null}} Bands per domain; `null` where the payload shipped no table.
 */
export function getEnGerThresholds(enConfig) {
    /** @type {{[domainId: string]: {ks: string[], ksPercentageThresholds: string[]}|null}} */
    const thresholds = {};
    for (const domainId of enConfig.domainIds) {
        const table = enConfig.equivalenceTables[domainId];
        thresholds[domainId] = table?.bands?.length ? buildGerThresholds(table) : null;
    }
    return thresholds;
}

/**
 * @param {unknown} value - A `"73.5%"` column value, or nothing when the payload had no result.
 * @returns {number} The percentage; `NaN` when absent or unparseable.
 */
function parsePercentage(value) {
    return typeof value === 'string' ? parseFloat(value.replace('%', '')) : NaN;
}

/**
 * Convert one domain's equivalence table into the band layout the axes draw.
 *
 * The axes are percentage axes, and a point's position is
 * `Ergebnis.Richtig.mean × 100` — a share of the **items of that domain on the booklet**.
 * So the denominator is `itemCount`, not the top band's `maxScore`: a table's band scale
 * can stop short of the booklet's last item, and dividing by `maxScore` there would shift
 * every band relative to the points it is meant to classify. They are equal in every demo
 * fixture, which is why this can only be got wrong silently. `maxScore` is the fallback for a table that omits `itemCount`.
 *
 * Threshold lines sit at the midpoint between adjacent bands — on a contiguous table
 * that is the true inclusive boundary plus a half point, i.e. between the last score of
 * one band and the first of the next.
 * @param {EquivalenceTable} table - One domain's Äquivalenztabelle, as the payload delivers it.
 * @returns {{ks: string[], ksPercentageThresholds: string[]}} Band short names in scale order, plus the axis positions (percent, one decimal) of the lines between them.
 */
function buildGerThresholds(table) {
    const bands = table.bands;
    const denominator = table.itemCount ?? table.maxScore;
    return {
        ks: bands.map((band) => band.nameShort),
        ksPercentageThresholds: bands.slice(1).map((band, i) => {
            const midpoint = (bands[i].maxScore + band.minScore) / 2;
            return ((midpoint / denominator) * 100).toFixed(1);
        }),
    };
}
