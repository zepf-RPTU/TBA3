/**
 * toScatterPoints tests — the step between the class table's flat student records and the
 * points the scatterplot plots.
 *
 * This rule was unreachable while it lived inside the renderer as a private method: it took
 * a mounted chart to run it, so the percent-string parsing, the `'N/A'` level fallback and
 * the "which students are plotted at all" filter were all untested. Getting any of them
 * wrong is invisible — the chart still draws a plausible cloud of points, just not one that
 * matches the class.
 */

import { describe, it, expect } from 'vitest';
import { toScatterPoints } from '@tba3/modules/en/modules/charts/scatterplot/scatterPointAdapter.js';

/**
 * Minimal stand-in for EnConfig — the adapter reads exactly these two members.
 * `dataKey` deliberately carries the `en-` subject prefix the real config builds, so a
 * hardcoded `hoPercentage` here would fail rather than pass by coincidence.
 */
function enConfig() {
    return {
        domainIds: ['ho', 'le'],
        fieldName: (domain, suffix) => `en-${domain}${suffix}`,
    };
}

/** One record in the shape `buildClassStudentRecords` produces. */
function student(overrides = {}) {
    return {
        studentId: 's1',
        firstName: 'Ada',
        lastName: 'Lovelace',
        gender: 'w',
        'en-hoSummedResult': 20,
        'en-hoPercentage': '51.3%',
        'en-hoCompLevel': 'KS 2',
        'en-leSummedResult': 30,
        'en-lePercentage': '76.9%',
        'en-leCompLevel': 'KS 4',
        ...overrides,
    };
}

describe('toScatterPoints', () => {
    it('reads the domain columns through the config, not by a fixed name', () => {
        // WHY: the column names are built from subject.id + domain.id at runtime, so they
        // differ per dataset. A point read from the wrong key is silently absent, not an error.
        const [point] = toScatterPoints([student()], enConfig());

        expect(point.d0Percentage).toBe(51.3);
        expect(point.d1Percentage).toBe(76.9);
        expect(point.d0Result).toBe(20);
        expect(point.d1Result).toBe(30);
    });

    it('carries identity through so a plotted point can be traced back to its student', () => {
        // WHY: the point is what click-to-select and the tooltip see; without studentId the
        // selection published to the event bus cannot name anyone.
        const [point] = toScatterPoints([student()], enConfig());

        expect(point).toMatchObject({
            studentId: 's1',
            firstName: 'Ada',
            lastName: 'Lovelace',
            gender: 'w',
            d0Ger: 'KS 2',
            d1Ger: 'KS 4',
        });
    });

    it('plots a genuine zero', () => {
        // WHY: 0 % is a result the class can actually have, and it must land on the axis —
        // the drop rule below must not swallow it.
        const points = toScatterPoints(
            [student({ 'en-hoPercentage': '0.0%', 'en-hoSummedResult': 0 })],
            enConfig(),
        );

        expect(points).toHaveLength(1);
        expect(points[0].d0Percentage).toBe(0);
        expect(points[0].d0Result).toBe(0);
    });

    it('drops a student whose percentage does not parse', () => {
        // WHY: an unparseable percentage yields NaN, which fails both `>= 0` comparisons.
        // That is the intended outcome: a student with no readable score must be absent from
        // the plot rather than drawn at an invented position a reader would take for a real one.
        const points = toScatterPoints(
            [student(), student({ studentId: 's2', 'en-lePercentage': 'k.A.' })],
            enConfig(),
        );

        expect(points.map((p) => p.studentId)).toEqual(['s1']);
    });

    it('names an absent competence level rather than inventing a band', () => {
        // WHY: 'N/A' misses the palette registry and paints the neutral unknown-value gray,
        // which is the honest, visible outcome. Substituting a real band would classify a
        // student the payload never classified.
        const [point] = toScatterPoints([student({ 'en-hoCompLevel': undefined })], enConfig());

        expect(point.d0Ger).toBe('N/A');
    });

    it('drops a student the payload carried no result for', () => {
        // WHY: `buildClassStudentRecords` omits the Percentage field when a student has no
        // `Richtig` aggregation for a domain. A `|| "0.0%"` fallback used to plot them on
        // the axis — a result the payload never reported, indistinguishable from a real 0 %.
        const points = toScatterPoints(
            [
                student(),
                student({
                    studentId: 's2',
                    'en-hoPercentage': undefined,
                    'en-hoSummedResult': undefined,
                }),
            ],
            enConfig(),
        );

        expect(points.map((p) => p.studentId)).toEqual(['s1']);
    });

    it('yields no points when there is no student data', () => {
        // WHY: the renderer's validateData() gates on the point count, so "nothing loaded yet"
        // has to arrive as an empty array, not a throw.
        expect(toScatterPoints(null, enConfig())).toEqual([]);
        expect(toScatterPoints([], enConfig())).toEqual([]);
    });
});
