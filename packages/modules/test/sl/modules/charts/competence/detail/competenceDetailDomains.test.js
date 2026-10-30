// @vitest-browser

/**
 * SL competence detail — a Fach with any number of Domänen. Grouped by Fach, each
 * Domäne is a cluster of its own: its bars together, the clusters in payload order with
 * one gap at every boundary and a Domäne label over each, and the data table lists the
 * bars in the order they are drawn.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { select } from 'd3';

import { CompetenceDetailRenderer } from '../../../../../../src/sl/modules/charts/competence/detail/competenceDetailRenderer.js';
import { buildCompetenceLevelIndex } from '../../../../../../src/sl/slCompetenceLevelIndex.js';
import { toDataTableList } from '../../../../../../src/common/charts/host/chartDataTable.js';
import { competenceValueGroup } from '../../../../../support/slValueGroupFactories.js';
import { createTestContext } from '../../../../../support/glossaryFixture.js';
import { makeVisibleChartContainer } from '../../../../../support/chartHarness.js';

/** @typedef {import('../../../../../../src/sl/modules/charts/competence/detail/competenceDetailData.js').CompetenceChartRow} CompetenceChartRow */

/**
 * The payload's Fächer and Domänen, in payload order — no alphabetical order matches it:
 * one, four, three and two Domänen. Englisch's Schreiben has no glossary entry.
 * @type {Array<{subject: string, domains: Array<{id: string|null, name: string|null}>}>}
 */
const SUBJECTS = [
    { subject: 'Mathematik', domains: [{ id: null, name: null }] },
    {
        subject: 'Deutsch',
        domains: [
            { id: 'le', name: 'Lesen' },
            { id: 'rs', name: 'Orthografie' },
            { id: 'sp', name: 'Sprachgebrauch' },
            { id: 'ho', name: 'Hören' },
        ],
    },
    {
        subject: 'Englisch',
        domains: [
            { id: 'le', name: 'Lesen' },
            { id: 'sc', name: 'Schreiben' },
            { id: 'ho', name: 'Hören' },
        ],
    },
    {
        subject: 'Französisch',
        domains: [
            { id: 'ho', name: 'Hören' },
            { id: 'le', name: 'Lesen' },
        ],
    },
];

/** Each bar of a cluster, in draw order: the group, the school, the Landesschnitt. */
const TRACKS = [
    { id: '8a', type: 'group', name: '8a', label: 'Lerngruppe 8a' },
    { id: 'schule', type: 'school', name: 'Schule', label: 'Schule' },
    { id: 'nw', type: 'state', name: 'Landesschnitt', label: 'Landesschnitt' },
];

/** One value group per track and Fach × Domäne, the group's per Domäne as its bucket. */
const BUCKETS = SUBJECTS.flatMap(({ subject, domains }) =>
    domains.map((domain) =>
        TRACKS.map((track) =>
            competenceValueGroup({
                id: track.id,
                type: track.type,
                name: track.name,
                subject,
                domainId: domain.id,
                domainName: domain.name,
                levels: { I: 4, II: 6 },
            }),
        ),
    ),
);

/** @type {HTMLDivElement} The container `beforeEach` mounts. */
let container;
/** @type {CompetenceDetailRenderer} The chart `beforeEach` draws into it. */
let chart;

/**
 * The Lerngruppe view of 8a over every Fach: grouped by Fach.
 * @returns {CompetenceDetailRenderer} The chart, drawn.
 */
function drawChart() {
    const drawn = new CompetenceDetailRenderer(
        container,
        BUCKETS.map((bucket) => bucket.filter((valueGroup) => valueGroup.type === 'group')),
        {
            context: createTestContext('sl'),
            autoResize: false,
            vizMode: 'stacked_bar',
            legend: 'side',
            groupName: '8a',
            index: buildCompetenceLevelIndex(BUCKETS.flat()),
        },
    );
    drawn.create();
    return drawn;
}

/**
 * The x-axis group of one Fach.
 * @param {string} subject
 * @returns {Element}
 */
function groupOf(subject) {
    const group = [...container.querySelectorAll('g.domain-group')].find(
        (node) => select(node).datum() === subject,
    );
    expect(group).toBeDefined();
    return /** @type {Element} */ (group);
}

/**
 * The left edge of a mark translated inside its group.
 * @param {Element} node
 * @returns {number}
 */
function translateX(node) {
    const match = /translate\(([^,]+),/.exec(node.getAttribute('transform') ?? '');
    return Number(match?.[1]);
}

/**
 * A Fach's bars, left to right.
 * @param {string} subject
 * @returns {Array<{row: CompetenceChartRow, x: number}>}
 */
function barsOf(subject) {
    return [...groupOf(subject).querySelectorAll(':scope > g.sub-bar-group')]
        .map((node) => ({
            row: /** @type {CompetenceChartRow} */ (select(node).datum()),
            x: translateX(node),
        }))
        .sort((a, b) => a.x - b.x);
}

/**
 * The Domäne labels over a Fach's clusters, left to right.
 * @param {string} subject
 * @returns {Array<{text: string, glossaryKey: string|null, x: number}>}
 */
function domainLabelsOf(subject) {
    return [...groupOf(subject).querySelectorAll(':scope > text.domain-label')]
        .map((node) => ({
            text: node.textContent ?? '',
            glossaryKey: /** @type {SVGTextElement} */ (node).dataset.glossaryKey ?? null,
            x: Number(node.getAttribute('x')),
        }))
        .sort((a, b) => a.x - b.x);
}

describe('SL competence detail — a Fach with three or four Domänen', () => {
    beforeEach(() => {
        container = makeVisibleChartContainer('sl-competence-domains-test', {
            widthPx: 1200,
            heightPx: 400,
        });
        chart = drawChart();
    });

    it('draws each Domäne as a cluster of its bars, the clusters in payload order', () => {
        for (const { subject, domains } of SUBJECTS.slice(1)) {
            expect(barsOf(subject).map(({ row }) => [row.domain, row.type])).toEqual(
                domains.flatMap((domain) =>
                    TRACKS.map((track) => [
                        domain.id,
                        track.type === 'state' ? 'comparison' : track.type,
                    ]),
                ),
            );
        }
    });

    it('opens one equal gap at every cluster boundary and none inside a cluster', () => {
        for (const { subject, domains } of SUBJECTS.slice(1)) {
            const xs = barsOf(subject).map((bar) => bar.x);
            const steps = xs.slice(1).map((x, i) => x - xs[i]);
            const pitch = Math.min(...steps);
            const boundaries = steps.filter((step) => step > pitch + 0.5);

            expect(steps.map((step) => step > pitch + 0.5)).toEqual(
                domains.flatMap((_, d) => [false, false, d < domains.length - 1]).slice(0, -1),
            );
            expect(boundaries).toHaveLength(domains.length - 1);
            boundaries.forEach((step) => expect(step).toBeCloseTo(boundaries[0]));
        }
    });

    it('labels every cluster with its Domäne, linked to its entry where it has one', () => {
        expect(
            domainLabelsOf('Deutsch').map(({ text, glossaryKey }) => [text, glossaryKey]),
        ).toEqual([
            ['LE', 'lesen'],
            ['OR', 'orthografie'],
            ['SP', 'sprachgebrauch'],
            ['HÖ', 'hören-deutsch'],
        ]);
        expect(
            domainLabelsOf('Englisch').map(({ text, glossaryKey }) => [text, glossaryKey]),
        ).toEqual([
            ['LE', 'leseverstehen'],
            ['SC', null],
            ['HÖ', 'hörverstehen'],
        ]);
        expect(
            domainLabelsOf('Französisch').map(({ text, glossaryKey }) => [text, glossaryKey]),
        ).toEqual([
            ['HÖ', 'hörverstehen'],
            ['LE', 'leseverstehen'],
        ]);
        expect(domainLabelsOf('Mathematik')).toEqual([]);

        // Each label sits over its own cluster: past its first bar, before the next one's.
        const bars = barsOf('Deutsch');
        domainLabelsOf('Deutsch').forEach((label, index) => {
            const cluster = bars.slice(index * TRACKS.length, (index + 1) * TRACKS.length);
            expect(label.x).toBeGreaterThan(cluster[0].x);
            expect(label.x).toBeLessThan(bars[(index + 1) * TRACKS.length]?.x ?? Infinity);
        });
    });

    it('lists the table rows in the order the bars are drawn', () => {
        const [table] = toDataTableList(chart.dataTable());

        expect(table.rows.map((row) => [row[0].text, row[1].text])).toEqual(
            SUBJECTS.flatMap(({ subject, domains }) =>
                domains.flatMap((domain) =>
                    TRACKS.map((track) => [
                        domain.name ? `${subject}: ${domain.name}` : subject,
                        track.label,
                    ]),
                ),
            ),
        );
    });
});
