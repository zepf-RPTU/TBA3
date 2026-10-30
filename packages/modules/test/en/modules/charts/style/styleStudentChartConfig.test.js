// @vitest-browser

// The card keeps both renderers and flips which one shows. The lollipop reports its
// minimum height only when it changes, so the card keeps the height while the spider
// shows and applies it again once the lollipop is back.

import { describe, expect, it, vi } from 'vitest';
import { signal } from '@preact/signals-core';

import { ChartHostModule } from '../../../../../src/common/charts/host/chartHostModule.js';
import { styleStudentChartConfig } from '../../../../../src/en/modules/charts/style/styleStudentChartConfig.js';
import { EN_DATASETS } from '../../../../../src/en/enDatasets.js';
import { makeVisibleChartContainer } from '../../../../support/chartHarness.js';
import { mountModule } from '../../../../support/dom.js';
import { enConfig, groupAverages } from '../../../../support/enStyleFixture.js';
import { createSubjectContext } from '../../../../support/subjectContext.js';

const styleAverages = {
    groupName: '8a',
    groupAverages,
    groupDomainAverages: {},
    comparisonGroups: [],
};

const studentRecords = [
    {
        studentId: 's1',
        firstName: 'A',
        lastName: 'L',
        gender: '',
        traits: new Set(),
        itemResults: new Map(),
        domains: {
            ho: { styles: { global: 50, detailliert: 30 } },
            le: { styles: { global: 80, detailliert: 60 } },
        },
    },
    {
        studentId: 's2',
        firstName: 'B',
        lastName: 'M',
        gender: '',
        traits: new Set(),
        itemResults: new Map(),
        domains: {
            ho: { styles: { global: 20, detailliert: 40 } },
            le: { styles: { global: 70, detailliert: 90 } },
        },
    },
];

/**
 * The card over a store that answers its three datasets, in a frame with a box.
 * @param {import('@preact/signals-core').Signal<string>} mode - The Domäne switch.
 * @param {string} [studentId]
 * @returns {Promise<import('../../../../../src/en/modules/charts/style/styleStudentChartConfig.js').StyleStudentHost>} Drawn.
 */
async function mountCard(mode, studentId = 's1') {
    const host = ChartHostModule.createChart('style-student-card', styleStudentChartConfig, {
        // The datasets the card reads, as its store would derive them.
        context: await createSubjectContext('en', {
            datasets: [
                [EN_DATASETS.CONFIG, enConfig],
                [EN_DATASETS.STYLE_AVERAGES, styleAverages],
                [EN_DATASETS.STUDENT_RECORDS, studentRecords],
            ],
        }),
        domainMode: mode,
        studentId,
    });
    host.style.display = 'block';
    host.style.height = '100%';
    return mountModule(
        host,
        {},
        makeVisibleChartContainer('style-student-frame', { widthPx: 640, heightPx: 520 }),
    );
}

describe('EN student style card — minimum height', () => {
    it('drops the lollipop floor for the spider and has it again when the lollipop is back', async () => {
        // A card that cleared the floor for the spider would get none back on the
        // return, and the grid row would squeeze the lollipop's rows below their minimum.
        const mode = signal('ho');
        const host = await mountCard(mode);
        const floor = () => parseFloat(getComputedStyle(host).minHeight) || 0;
        const lollipopFloor = floor();
        expect(lollipopFloor).toBeGreaterThan(0);

        mode.value = 'all';
        await vi.waitFor(() => expect(floor()).toBe(0));

        mode.value = 'ho';
        await vi.waitFor(() => expect(floor()).toBe(lollipopFloor));
    });
});

describe('EN student style card — renderers', () => {
    it('draws the spider in mode `all` and the lollipop for a Domäne, one at a time', async () => {
        const mode = signal('all');
        const host = await mountCard(mode);
        expect(host.charts.map((chart) => chart.constructor.name)).toEqual(['StyleSpiderChart']);

        mode.value = 'ho';
        await vi.waitFor(() =>
            expect(host.charts.map((chart) => chart.constructor.name)).toEqual([
                'StyleLollipopChart',
            ]),
        );
    });

    it('never redraws the lollipop in mode `all` while the spider replaces it', async () => {
        // The lollipop shares the mode signal; still on screen through the spider's
        // layout wait, it would animate into its grouped `all` layout there.
        const mode = signal('ho');
        const host = await mountCard(mode);
        const lollipop =
            /** @type {import('../../../../../src/en/modules/charts/style/styleLollipopChart.js').StyleLollipopChart} */ (
                host.chart
            );
        const draws = vi.spyOn(lollipop, 'renderChart');

        mode.value = 'all';
        await vi.waitFor(() =>
            expect(host.charts.map((chart) => chart.constructor.name)).toEqual([
                'StyleSpiderChart',
            ]),
        );

        expect(draws).not.toHaveBeenCalled();
    });

    it('replaces the drawing on a re-render rather than stacking a second one', async () => {
        const host = await mountCard(signal('all'));
        const svgs = () => host.querySelectorAll('svg.chart-root').length;
        const drawn = svgs();
        expect(drawn).toBe(1);

        await host.rerender();
        expect(svgs()).toBe(drawn);
    });
});

describe('EN student style card — the selected student', () => {
    it("names the selected student's own record, not another's", async () => {
        // The card resolves the id against `en.studentRecords` itself; a lookup that
        // picked the wrong record would put another student's name on the spider.
        const host = await mountCard(signal('all'), 's2');
        expect(host.textContent).toContain('M, B');
        expect(host.textContent).not.toContain('L, A');
    });
});
