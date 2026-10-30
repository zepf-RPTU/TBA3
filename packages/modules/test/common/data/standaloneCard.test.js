// @vitest-browser
// (the card draws a real SVG into a live container)

import { describe, expect, it } from 'vitest';

import { simpleCompetenceLevelBarConfig } from '../../../src/ma/modules/charts/competenceLevelBar/simpleCompetenceLevelBarConfig.js';
import { GROUP_REQUESTS, apiRequestLoader } from '../../../src/common/data/index.js';
import { makeVisibleChartContainer } from '../../support/chartHarness.js';
import { BOOKLET_PROPERTY } from '../../support/competenceLevelGroups.js';
import { ChartHostModule } from '../../../src/common/charts/host/chartHostModule.js';
import { mountModule } from '../../support/dom.js';
import { createTestModuleOptions } from '../../support/glossaryFixture.js';

/**
 * A card mounted on its own — no app, no view — must fetch what it reads and
 * nothing else. The same store behind a whole dashboard sends each request once however
 * many cards ask; here one card asks, and only its own request may leave.
 */

const GROUP = {
    id: '3a',
    type: 'group',
    name: '3a',
    properties: [BOOKLET_PROPERTY],
    competenceLevels: ['I', 'II', 'III'].map((nameShort, index) => ({
        nameShort,
        name: nameShort,
        descriptiveStatistics: { total: 6, frequency: index + 1, mean: (index + 1) / 6 },
    })),
};

/** @type {string[]} The paths the card's store fetched. */
let requested;

/**
 * The card's options, over a context whose store sends the MA group requests of one API scope.
 * @returns {ReturnType<typeof createTestModuleOptions>}
 */
function apiOptions() {
    requested = [];
    return createTestModuleOptions('ma', {
        requests: GROUP_REQUESTS.ma,
        loadRequest: apiRequestLoader({
            baseUrl: 'http://api.test/',
            scope: 'groups/3a',
            fetchJson: (url) => {
                requested.push(url.pathname);
                return Promise.resolve([GROUP]);
            },
        }),
    });
}

describe('a card on its own', () => {
    it('fetches only the request that answers what it reads, and draws', async () => {
        const options = apiOptions();
        const store = options.context.documents;
        const host = await mountModule(
            ChartHostModule.createChart('competence-level-bar', simpleCompetenceLevelBarConfig, {
                ...options,
            }),
            undefined,
            makeVisibleChartContainer('competence-level-bar-frame'),
        );

        expect(requested).toEqual(['/groups/3a/competence-levels']);
        expect(host.querySelector('svg')).not.toBeNull();
        expect(() => store.get('items.json')).toThrow(/never ensured/);
    });
});
