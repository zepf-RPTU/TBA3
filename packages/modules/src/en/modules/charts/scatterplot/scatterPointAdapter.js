/**
 * Turns the group's student records into the points the
 * scatterplot draws, and one domain's Äquivalenztabelle into the bands its axes
 * classify them against. Which domain sits on which axis and the "no usable
 * percentage → not plotted" rule live here.
 */
/**
 * The slice of a host's EN configuration this adapter reads.
 * @typedef {object} EnPointConfig
 * @property {string[]} domainIds - The two domain ids, in display order.
 * @property {{[domainId: string]: EquivalenceTable|null}} equivalenceTables - Per-domain Äquivalenztabelle; null (or absent) for a domain the payload carries none for.
 */

/**
 * One plotted student.
 * @typedef {object} ScatterPoint
 * @property {string} studentId
 * @property {string} lastName - Empty when absent.
 * @property {string} firstName - Empty when absent.
 * @property {number} xPercentage - Percentage on the x-axis domain.
 * @property {number} yPercentage - Percentage on the y-axis domain.
 * @property {string|null} xGer - Level name on the x-axis domain, `null` when absent.
 * @property {string|null} yGer - Level name on the y-axis domain, `null` when absent.
 */

/** @typedef {import('../../../../common/domain/competenceScale.js').EquivalenceTable} EquivalenceTable */

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Build scatterplot points from the group's student records.
 *
 * A student without a percentage on either axis is dropped, never drawn at the
 * origin, where they would read as a zero.
 * @param {import('../../../utils/enStudentDataAdapter.js').EnStudentRecord[]|null|undefined} students
 * @param {Pick<EnPointConfig, 'domainIds'>} enConfig
 * @returns {ScatterPoint[]} In input order.
 */
export function toScatterPoints(students, enConfig) {
    if (!students) return [];
    const [xDomain, yDomain] = axisDomainIds(enConfig);

    return students.flatMap((student) => {
        const x = student.domains[xDomain];
        const y = student.domains[yDomain];
        if (x?.percentage === undefined || y?.percentage === undefined) return [];
        return [
            {
                studentId: student.studentId,
                lastName: student.lastName,
                firstName: student.firstName,
                xPercentage: x.percentage,
                yPercentage: y.percentage,
                xGer: x.competenceLevelName || null,
                yGer: y.competenceLevelName || null,
            },
        ];
    });
}

/**
 * Which domain each axis plots: the second domain on x, the first on y.
 * @param {Pick<EnPointConfig, 'domainIds'>} enConfig
 * @returns {[string, string]} The x-axis domain id, then the y-axis domain id.
 */
export function axisDomainIds(enConfig) {
    const [d0, d1] = enConfig.domainIds;
    return [d1, d0];
}

/**
 * Threshold shape consumed by the scatterplot — keyed by domain.id.
 *
 * Read from the payload's `Äquivalenztabelle` (`enConfig.equivalenceTables`, off the
 * group's own value-group per domain), so the bands follow whatever scale the state
 * publishes — `A1…C1`, `A1.1…B1.2` or `k.h.N.…KS 5` — rather than a fixed GER ladder.
 * A domain whose payload carries no table yields `null`; the renderer then draws no
 * bands for that axis.
 * @param {EnPointConfig} enConfig
 * @returns {{[domainId: string]: {competenceLevelNames: string[], competenceLevelPercentageThresholds: number[]}|null}}
 */
export function getEnGerThresholds(enConfig) {
    /** @type {{[domainId: string]: {competenceLevelNames: string[], competenceLevelPercentageThresholds: number[]}|null}} */
    const thresholds = {};
    for (const domainId of enConfig.domainIds) {
        const table = enConfig.equivalenceTables[domainId];
        thresholds[domainId] = table?.bands?.length ? buildGerThresholds(table) : null;
    }
    return thresholds;
}

/**
 * Convert one domain's equivalence table into the band layout the axes draw.
 *
 * The axes are percentage axes, and a point's position is
 * `result.Richtig.mean × 100` — a share of the items of that domain on the booklet.
 * So the denominator is `itemCount`, not the top band's `maxScore`: a table's band scale
 * can stop short of the booklet's last item, and dividing by `maxScore` there would shift
 * every band relative to the points it classifies.
 *
 * Threshold lines sit at the midpoint between adjacent bands — on a contiguous table
 * that is the true inclusive boundary plus a half point, i.e. between the last score of
 * one band and the first of the next.
 * @param {EquivalenceTable} table
 * @returns {{competenceLevelNames: string[], competenceLevelPercentageThresholds: number[]}} Band short names in scale order, plus the axis positions (percent, rounded to one decimal) of the lines between them.
 */
function buildGerThresholds(table) {
    const bands = table.bands;
    const denominator = table.itemCount;
    return {
        competenceLevelNames: bands.map((band) => band.nameShort),
        competenceLevelPercentageThresholds: bands.slice(1).map((band, i) => {
            const midpoint = (bands[i].maxScore + band.minScore) / 2;
            return Math.round((midpoint / denominator) * 1000) / 10;
        }),
    };
}
