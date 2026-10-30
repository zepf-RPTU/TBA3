// @vitest-browser

/**
 * ChartHostModule's data table: a chart type that names a `dataTable` gets a header
 * toggle that shows the table in place of the chart, and an export that offers the
 * table's data beside the image. The table follows what it reads (the ⌀ toggles) while
 * it shows. A capture shows the chart, and a plot-only header action reads that the
 * table shows. A fake renderer stands in for the chart; its table comes from a signal.
 */

import { describe, expect, it, vi } from 'vitest';
import { signal } from '@preact/signals-core';
import { headerActionButton } from '@tba3/module-base';

import { ChartHostModule } from '../../../../src/common/charts/host/chartHostModule.js';
import { makeFakeRenderer } from '../../../support/chartHarness.js';
import { mountModule } from '../../../support/dom.js';
import { required } from '../../../support/required.js';
import { createTestContext } from '../../../support/glossaryFixture.js';

/** @typedef {import('../../../../src/common/charts/renderers/chartRenderer.js').ChartRenderer} ChartRenderer */

const HOST_OPTIONS = {
    context: createTestContext(),
    showModuleTitle: true,
    title: 'Kompetenzstufen',
};

/**
 * A chart type whose renderer's table lists the groups the signal holds, each with its share.
 * @param {import('@preact/signals-core').Signal<Array<[string, number]>>} groups - Name and share per row.
 * @returns {import('../../../../src/common/charts/host/chartHostModule.js').ChartHostConfig}
 */
function tableConfig(groups) {
    return {
        createRenderer: () =>
            Object.assign(makeFakeRenderer(), {
                dataTable: () => ({
                    columns: [{ label: 'Gruppe' }, { label: 'Anteil (%)' }],
                    rows: groups.value.map(([name, share]) => [
                        { text: name },
                        { text: `${share} %`, values: [share] },
                    ]),
                }),
            }),
    };
}

/**
 * @param {ChartHostModule} host
 * @returns {HTMLButtonElement|null} Its data-table toggle, if any.
 */
function toggleOf(host) {
    return host.querySelector('[data-header-action-button="data-table-toggle"]');
}

/**
 * @param {ChartHostModule} host
 * @returns {string[]} The row heads of the table shown.
 */
function tableRows(host) {
    return [...host.querySelectorAll('.chart-host-table-area tbody th')].map(
        (th) => th.textContent ?? '',
    );
}

describe('ChartHostModule data table', () => {
    it('offers no toggle and exports an image only for a renderer that draws no table', async () => {
        const host = await mountModule(
            ChartHostModule.createChart(
                'plain-host',
                { createRenderer: () => makeFakeRenderer() },
                HOST_OPTIONS,
            ),
            {},
        );

        expect(toggleOf(host)).toBeNull();
        expect(host._getExportType()).toBe('visual');
        expect(host.getExportDataText('csv')).toEqual([]);
        // The body is split all the same: whether a renderer has a table is known only
        // once it drew.
        expect(host.chartArea.parentElement).toBe(host.contentContainer);
        expect(host.chartArea.classList.contains('chart-host-chart-area')).toBe(true);
    });

    it('draws a thumbnail into its body, without a table area', async () => {
        const host = await mountModule(
            ChartHostModule.createChart(
                'thumbnail-host',
                tableConfig(signal(/** @type {Array<[string, number]>} */ ([['8a', 12.5]]))),
                { ...HOST_OPTIONS, thumbnail: true },
            ),
            {},
        );

        expect(host.chartArea).toBe(host.contentContainer);
        expect(host.querySelector('.chart-host-table-area')).toBeNull();
        expect(toggleOf(host)).toBeNull();
    });

    it('shows the table in place of the chart, following what it reads, and back', async () => {
        const groups = signal(/** @type {Array<[string, number]>} */ ([['8a', 12.5]]));
        const host = await mountModule(
            ChartHostModule.createChart('table-host', tableConfig(groups), HOST_OPTIONS),
            {},
        );
        const body = host.contentContainer;
        const chartArea = host.chartArea;
        const tableArea = /** @type {HTMLElement} */ (host.querySelector('.chart-host-table-area'));
        expect([chartArea.hidden, tableArea.hidden]).toEqual([false, true]);
        expect(required(toggleOf(host)).getAttribute('aria-pressed')).toBe('false');

        required(toggleOf(host)).click();
        await host.updateComplete;

        expect([chartArea.hidden, tableArea.hidden]).toEqual([true, false]);
        expect(required(toggleOf(host)).getAttribute('aria-pressed')).toBe('true');
        expect(tableRows(host)).toEqual(['8a']);
        expect(host.querySelector('.chart-host-table-area caption')?.textContent?.trim()).toBe(
            'Kompetenzstufen',
        );

        // A ⌀ toggle adds a row to the chart, and so to the table.
        groups.value = [
            ['8a', 12.5],
            ['Landesschnitt', 40],
        ];
        expect(tableRows(host)).toEqual(['8a', 'Landesschnitt']);

        const drawMeasured = vi.mocked(required(host.chart).drawMeasured);
        drawMeasured.mockClear();
        required(toggleOf(host)).click();
        await host.updateComplete;

        expect([chartArea.hidden, tableArea.hidden]).toEqual([false, true]);
        expect(tableRows(host)).toEqual([]);
        // The chart draws what it skipped behind the table at once.
        expect(drawMeasured).toHaveBeenCalledOnce();
        // The chart keeps its own area, which a renderer may empty.
        expect(host.chartArea.parentElement).toBe(body);
    });

    it('shows the failure sentence, not an empty table area, when a cycle fails', async () => {
        const groups = signal(/** @type {Array<[string, number]>} */ ([['8a', 12.5]]));
        const config = tableConfig(groups);
        const createRenderer = config.createRenderer;
        let fail = false;
        config.createRenderer = (host) => {
            if (fail) throw new Error('boom');
            return createRenderer(host);
        };
        const host = await mountModule(
            ChartHostModule.createChart('failing-host', config, HOST_OPTIONS),
            {},
        );
        required(toggleOf(host)).click();
        await host.updateComplete;
        expect(host.chartArea.hidden).toBe(true);

        fail = true;
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        await host.rerender();
        consoleError.mockRestore();

        const tableArea = /** @type {HTMLElement} */ (host.querySelector('.chart-host-table-area'));
        expect([host.chartArea.hidden, tableArea.hidden]).toEqual([false, true]);
        expect(host.chartArea.textContent).not.toBe('');
    });

    it('exports the table as CSV and JSON beside the image', async () => {
        const groups = signal(/** @type {Array<[string, number]>} */ ([['8a', 12.5]]));
        const host = await mountModule(
            ChartHostModule.createChart('export-host', tableConfig(groups), HOST_OPTIONS),
            {},
        );

        expect(host._getExportType()).toBe('chart');
        // An untitled table goes by the card's title.
        expect(host.getExportDataText('csv')).toEqual([
            { title: host.cardTitle, text: 'Gruppe;Anteil (%)\n8a;12,5' },
        ]);
        expect(JSON.parse(host.getExportDataText('json')[0].text)).toEqual([
            { Gruppe: '8a', 'Anteil (%)': 12.5 },
        ]);
    });

    it('shows and exports every table a config builds itself, each under its title', async () => {
        /** @type {import('../../../../src/common/charts/host/chartDataTable.js').ChartDataTable} */
        const bars = {
            title: 'Kompetenzstufen',
            columns: [{ label: 'Gruppe' }, { label: 'Anteil (%)' }],
            rows: [[{ text: '8a' }, { text: '12,5 %', values: [12.5] }]],
        };
        const boxes = {
            title: 'Unterrichtsqualität',
            columns: [{ label: 'Gruppe' }, { label: 'Median', digits: 2 }],
            rows: [[{ text: '8a' }, { text: '2,35', values: [2.345] }]],
        };
        const host = await mountModule(
            ChartHostModule.createChart(
                'grid-host',
                { createRenderer: () => makeFakeRenderer(), dataTable: () => [bars, boxes] },
                HOST_OPTIONS,
            ),
            {},
        );

        expect(host.getExportDataText('csv')).toEqual([
            { title: 'Kompetenzstufen', text: 'Gruppe;Anteil (%)\n8a;12,5' },
            { title: 'Unterrichtsqualität', text: 'Gruppe;Median\n8a;2,35' },
        ]);
        required(toggleOf(host)).click();
        await host.updateComplete;
        expect(
            [...host.querySelectorAll('.chart-host-table-area .chart-data-table-title')].map(
                (heading) => heading.textContent,
            ),
        ).toEqual(['Kompetenzstufen', 'Unterrichtsqualität']);
    });

    it('offers no toggle while the chart draws nothing, and falls back to the chart', async () => {
        const groups = signal(/** @type {Array<[string, number]>} */ ([['8a', 12.5]]));
        const config = tableConfig(groups);
        const createRenderer = config.createRenderer;
        // A chart that draws nothing now (a message instead) has no table.
        config.createRenderer = (host) => {
            const chart = /** @type {ChartRenderer} */ (createRenderer(host));
            const dataTable = chart.dataTable.bind(chart);
            chart.dataTable = () => (groups.value.length ? dataTable() : null);
            return chart;
        };
        const host = await mountModule(
            ChartHostModule.createChart('empty-host', config, HOST_OPTIONS),
            {},
        );
        required(toggleOf(host)).click();
        await host.updateComplete;
        expect(host.chartArea.hidden).toBe(true);

        const drawMeasured = vi.mocked(required(host.chart).drawMeasured);
        drawMeasured.mockClear();
        groups.value = [];
        await host.updateComplete;

        expect(host.chartArea.hidden).toBe(false);
        expect(toggleOf(host)).toBeNull();
        expect(host.showsTable).toBe(false);
        expect(drawMeasured).toHaveBeenCalledOnce();
        // No CSV or JSON to offer either: the export is the image alone.
        expect(host._getExportType()).toBe('visual');

        // Rows again: the toggle is back, the table waits for it.
        groups.value = [['8a', 12.5]];
        await host.updateComplete;
        expect(required(toggleOf(host)).getAttribute('aria-pressed')).toBe('false');
        expect(host.chartArea.hidden).toBe(false);
        expect(host._getExportType()).toBe('chart');
    });

    it('captures the chart while the table shows, and shows the table again after', async () => {
        const groups = signal(/** @type {Array<[string, number]>} */ ([['8a', 12.5]]));
        const host = await mountModule(
            ChartHostModule.createChart('capture-host', tableConfig(groups), HOST_OPTIONS),
            {},
        );
        required(toggleOf(host)).click();
        await host.updateComplete;
        const tableArea = /** @type {HTMLElement} */ (host.querySelector('.chart-host-table-area'));
        const drawMeasured = vi.mocked(required(host.chart).drawMeasured);
        drawMeasured.mockClear();

        const restore = host.prepareExportCapture();
        await host.whenSettled();
        expect([host.chartArea.hidden, tableArea.hidden]).toEqual([false, true]);
        // The chart catches up on what it skipped behind the table before the clone.
        expect(drawMeasured).toHaveBeenCalledOnce();

        restore();
        expect([host.chartArea.hidden, tableArea.hidden]).toEqual([true, false]);
    });

    it('makes the table area a Tab stop only while its table overflows it', async () => {
        const groups = signal(/** @type {Array<[string, number]>} */ ([['8a', 12.5]]));
        const host = await mountModule(
            ChartHostModule.createChart('scroll-host', tableConfig(groups), HOST_OPTIONS),
            {},
        );
        const tableArea = /** @type {HTMLElement} */ (host.querySelector('.chart-host-table-area'));
        // A short card: forty rows overflow it, one does not.
        tableArea.style.maxHeight = '160px';
        required(toggleOf(host)).click();
        await host.updateComplete;
        expect(tableArea.hasAttribute('tabindex')).toBe(false);

        groups.value = Array.from({ length: 40 }, (_, i) => [`Gruppe ${i}`, i]);
        expect(tableArea.getAttribute('tabindex')).toBe('0');
        expect(tableArea.getAttribute('role')).toBe('region');

        groups.value = [['8a', 12.5]];
        expect(tableArea.hasAttribute('tabindex')).toBe(false);
    });

    it('lets a plot-only header action read that the table shows', async () => {
        const groups = signal(/** @type {Array<[string, number]>} */ ([['8a', 12.5]]));
        const host = await mountModule(
            ChartHostModule.createChart(
                'inactive-host',
                {
                    ...tableConfig(groups),
                    headerActions: (chartHost) =>
                        headerActionButton({
                            name: 'plot-only',
                            ariaLabel: 'Zoom',
                            onClick: () => {},
                            inactive: chartHost.showsTable,
                        }),
                },
                HOST_OPTIONS,
            ),
            {},
        );
        const plotAction = () =>
            required(host.querySelector('[data-header-action-button="plot-only"]'));
        expect(plotAction().hasAttribute('aria-disabled')).toBe(false);

        required(toggleOf(host)).click();
        await host.updateComplete;
        expect(plotAction().getAttribute('aria-disabled')).toBe('true');

        required(toggleOf(host)).click();
        await host.updateComplete;
        expect(plotAction().hasAttribute('aria-disabled')).toBe(false);
    });

    it('re-renders its header only when there comes or goes a table, not on every change', async () => {
        const groups = signal(/** @type {Array<[string, number]>} */ ([['8a', 12.5]]));
        const config = tableConfig(groups);
        const createRenderer = config.createRenderer;
        // No rows, no table.
        config.createRenderer = (host) => {
            const chart = /** @type {ChartRenderer} */ (createRenderer(host));
            const dataTable = chart.dataTable.bind(chart);
            chart.dataTable = () => (groups.value.length ? dataTable() : null);
            return chart;
        };
        const host = await mountModule(
            ChartHostModule.createChart('header-host', config, HOST_OPTIONS),
            {},
        );
        const headerActions = vi.spyOn(host, '_headerActions');

        // A ⌀ toggle adds a row: the table changes, whether there is one does not.
        groups.value = [
            ['8a', 12.5],
            ['Landesschnitt', 40],
        ];
        await host.updateComplete;
        expect(headerActions).not.toHaveBeenCalled();

        groups.value = [];
        await host.updateComplete;
        expect(headerActions).toHaveBeenCalled();
        expect(toggleOf(host)).toBeNull();
    });

    it('offers no table on a thumbnail', async () => {
        const groups = signal(/** @type {Array<[string, number]>} */ ([['8a', 12.5]]));
        const host = await mountModule(
            ChartHostModule.createChart('thumbnail-host', tableConfig(groups), {
                ...HOST_OPTIONS,
                thumbnail: true,
            }),
            {},
        );

        expect(host.chartArea).toBe(host.contentContainer);
        expect(host._getExportType()).toBe('visual');
        expect(host.getExportDataText('csv')).toEqual([]);
    });
});
