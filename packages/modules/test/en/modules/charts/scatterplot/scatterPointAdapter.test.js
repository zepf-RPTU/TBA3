// A wrong axis assignment, level or plotted-students filter is invisible on screen: the
// chart still draws a plausible cloud of points, just not one that matches the group.

import { describe, it, expect } from 'vitest';
import { toScatterPoints } from '../../../../../src/en/modules/charts/scatterplot/scatterPointAdapter.js';

/** @typedef {import('../../../../../src/en/utils/enStudentDataAdapter.js').EnStudentRecord} EnStudentRecord */
/** @typedef {import('../../../../../src/en/utils/enStudentDataAdapter.js').EnStudentDomain} EnStudentDomain */

/**
 * Minimal stand-in for EnConfig — the adapter reads only the domain ids.
 * @returns {{domainIds: string[]}}
 */
function enConfig() {
    return { domainIds: ['ho', 'le'] };
}

/**
 * One record in the shape `buildGroupStudentRecords` produces.
 * @param {Partial<EnStudentRecord>} [overrides] - Top-level fields to replace.
 * @param {{ho?: EnStudentDomain, le?: EnStudentDomain}} [domains] - Per-domain fields to replace.
 * @returns {EnStudentRecord}
 */
function student(overrides = {}, domains = {}) {
    return {
        studentId: 's1',
        firstName: 'Ada',
        lastName: 'Lovelace',
        gender: 'female',
        traits: new Set(),
        itemResults: new Map(),
        domains: {
            ho: { percentage: 51.3, competenceLevelName: 'KS 2', ...domains.ho },
            le: { percentage: 76.9, competenceLevelName: 'KS 4', ...domains.le },
        },
        ...overrides,
    };
}

describe('toScatterPoints', () => {
    it("reads each axis from its domain's values", () => {
        const [point] = toScatterPoints([student()], enConfig());

        expect(point.yPercentage).toBe(51.3);
        expect(point.xPercentage).toBe(76.9);
    });

    it('carries identity through so a plotted point can be traced back to its student', () => {
        // The point is what click-to-select and the tooltip see; without studentId the
        // selection cannot name anyone.
        const [point] = toScatterPoints([student()], enConfig());

        expect(point).toMatchObject({
            studentId: 's1',
            firstName: 'Ada',
            lastName: 'Lovelace',
            xGer: 'KS 4',
            yGer: 'KS 2',
        });
    });

    it('plots a genuine zero', () => {
        // 0 % is a result the group can actually have, and it must land on the axis —
        // the drop rule below must not swallow it.
        const points = toScatterPoints([student({}, { ho: { percentage: 0 } })], enConfig());

        expect(points).toHaveLength(1);
        expect(points[0].yPercentage).toBe(0);
    });

    it('drops a student without a row in one domain', () => {
        // A student with no score on one axis must be absent from the plot rather
        // than drawn at an invented position a reader would take for a real one.
        const points = toScatterPoints(
            [student(), { ...student({ studentId: 's2' }), domains: { ho: { percentage: 40 } } }],
            enConfig(),
        );

        expect(points.map((p) => p.studentId)).toEqual(['s1']);
    });

    it('leaves an absent competence level empty rather than inventing a band', () => {
        // The tooltip prints the missing-value dash for it. Substituting a real band
        // would classify a student the payload never classified.
        const [point] = toScatterPoints(
            [student({}, { ho: { competenceLevelName: undefined } })],
            enConfig(),
        );

        expect(point.yGer).toBeNull();
    });

    it('drops a student the payload carried no result for', () => {
        // `buildGroupStudentRecords` omits the Percentage field when a student has no
        // `Richtig` aggregation for a domain. A `|| "0.0%"` fallback would plot them on
        // the axis — a result the payload never reported, indistinguishable from a real 0 %.
        const points = toScatterPoints(
            [student(), student({ studentId: 's2' }, { ho: { percentage: undefined } })],
            enConfig(),
        );

        expect(points.map((p) => p.studentId)).toEqual(['s1']);
    });

    it('yields no points when there is no student data', () => {
        // The renderer's validateData() gates on the point count, so "nothing loaded yet"
        // has to arrive as an empty array, not a throw.
        expect(toScatterPoints(null, enConfig())).toEqual([]);
        expect(toScatterPoints([], enConfig())).toEqual([]);
    });
});
