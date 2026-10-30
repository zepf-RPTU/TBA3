// @vitest-browser
// The config lays out the card body (an SVG area and its key panel), which needs a DOM.
import { describe, it, expect, vi } from 'vitest';

import { enCompetenceLevelDistributionConfig } from '../../../../../src/en/modules/charts/competenceLevelDistribution/enCompetenceLevelDistributionConfig.js';
import { mountChart } from '../../../../support/chartHarness.js';
import { BOOKLET_PROPERTY, studentFields } from '../../../../support/competenceLevelGroups.js';
import { createSubjectContext } from '../../../../support/subjectContext.js';

/** @typedef {import('../../../../../src/common/data/schemas/competenceLevels.js').CompetenceLevelsValueGroup} CompetenceLevelsValueGroup */

const chartValueGroups = vi.hoisted(() => /** @type {CompetenceLevelsValueGroup[][]} */ ([]));

vi.mock(
    '../../../../../src/common/charts/competenceLevelDistribution/competenceLevelDistributionChart.js',
    () => ({
        // Records what it was built from; the host's lifecycle calls do nothing.
        CompetenceLevelDistributionChart: class {
            /** @type {Array<{id: string, label: string}>} */
            comparisonModeEntries = [];

            /**
             * @param {HTMLElement} _container
             * @param {{apiData: CompetenceLevelsValueGroup[]}} options
             */
            constructor(_container, options) {
                chartValueGroups.push(options.apiData);
            }

            create() {}

            destroy() {}

            refresh() {}

            measureIfStale() {
                return false;
            }

            drawMeasured() {}

            dataTable() {
                return null;
            }
        },
    }),
);

/**
 * An EN group whose domains carry ids other than the demo fixtures' `ho`/`le`.
 * @param {string[]} [domainIds]
 * @returns {Promise<import('../../../../../src/common/context/index.js').ModuleContext>}
 */
async function makeContext(domainIds = ['lv', 'sp']) {
    const domain = (/** @type {string} */ id) => ({
        id,
        name: id === 'lv' ? 'Hörverstehen' : 'Leseverstehen',
    });
    return createSubjectContext('en', {
        documents: {
            'students-competence-levels.json': domainIds.map((id) => ({
                id: 's1',
                type: 'student',
                name: 'Schüler 1',
                subject: { name: 'Englisch' },
                domain: domain(id),
                ...studentFields('8a', 'Schüler'),
                competenceLevels: [],
            })),
            'competence-levels.json': [
                ...domainIds.map((id) => ({
                    id: '8a',
                    type: 'group',
                    name: '8a',
                    domain: domain(id),
                    properties: [BOOKLET_PROPERTY],
                    competenceLevels: [],
                })),
                // A value group without a domain, which an undefined domain id would match.
                {
                    id: 'state',
                    type: 'state',
                    name: 'Landesschnitt',
                    properties: [BOOKLET_PROPERTY],
                    competenceLevels: [],
                },
            ],
        },
    });
}

/**
 * @param {string|undefined} domainId - Which of the payload's domains the chart shows.
 * @returns {Promise<Array<string|null|undefined>>} The domain ids of the value groups the chart was built from.
 */
async function domainsDrawnFor(domainId) {
    chartValueGroups.length = 0;
    await mountChart(enCompetenceLevelDistributionConfig, {
        context: await makeContext(),
        domainId,
    });
    return chartValueGroups[0].map((valueGroup) => valueGroup.domain?.id);
}

describe('EN competence-level distribution', () => {
    it("draws its own domain's value groups, whatever the ids", async () => {
        // Filtering the value groups on the literals 'ho' and 'le' would leave both
        // distribution charts empty for a payload with other domain ids.
        expect(await domainsDrawnFor('lv')).toEqual(['lv']);
        expect(await domainsDrawnFor('sp')).toEqual(['sp']);
    });

    it('refuses a host without a domain rather than drawing the value groups without one', async () => {
        // An undefined id matches every value group that carries no domain and would draw
        // it as if it were that domain's distribution.
        await expect(domainsDrawnFor(undefined)).rejects.toThrow(/no domainId option/);
    });
});
