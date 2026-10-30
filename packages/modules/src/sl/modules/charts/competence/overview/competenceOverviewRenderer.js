/**
 * CompetenceOverviewRenderer — Overview mode competence distribution chart: grouped
 * bars per Fach/Domäne (comparisons / Schulschnitt / groups), an interactive legend
 * with show/hide toggles; every toggle redraws in place. Rows come from
 * competenceOverviewData.js, the marks from competenceOverviewBars.js, where they sit
 * from competenceOverviewLayout.js, the key from competenceOverviewLegend.js.
 */

import { PILLS, pillShown } from '../shared/competencePills.js';
import { ChartRenderer } from '../../../../../common/charts/renderers/chartRenderer.js';
import { prepareCompetenceLevelNames } from '../shared/competenceChartData.js';
import {
    closeShareFrame,
    competenceShareTable,
    competenceShareTooltip,
    openShareFrame,
    shareAxisSpace,
} from '../shared/competenceShareFrame.js';
import { appendCategoryAxis } from '../shared/competenceAxes.js';
import {
    OVERVIEW_GROUP_LABEL_GAP_PX,
    computeRequiredOverviewChartWidth,
    measureOverviewBottomAxisSpace,
    measureOverviewTopAxisSpace,
    overviewBandScales,
} from './competenceOverviewAxes.js';
import { buildLevelVisibility } from '../shared/competenceLegend.js';
import { prepareCompetenceOverviewData } from './competenceOverviewData.js';
import { createOverviewBars } from './competenceOverviewBars.js';
import { layoutOverview, solveOverviewLayout } from './competenceOverviewLayout.js';
import { buildOverviewKey, isSlotShown } from './competenceOverviewLegend.js';

/** @type {import('./competenceOverviewData.js').CompetenceOverviewData} */
const NO_OVERVIEW = { rows: [], slots: [], tracks: [], groupNames: [], subjects: [] };

export class CompetenceOverviewRenderer extends ChartRenderer {
    /** @type {import('../shared/competenceLegend.js').SeriesShown} */
    #isShown = (key, group) => this.isSeriesShown(key, group);

    /**
     * @param {HTMLElement} container
     * @param {import('../../../../slCompetenceLevelIndex.js').CompetenceLevelIndex} data
     * @param {import('../../../../../common/charts/renderers/chartRenderer.js').ChartRendererOptions} options
     */
    constructor(container, data, options) {
        super(container, {
            legend: 'side',
            ...options,
            layout: { padding: { top: 10 } },
        });

        /** Prepared once: it never changes for the renderer's life. */
        this.overview = data
            ? prepareCompetenceOverviewData(this.context.palette, data)
            : NO_OVERVIEW;
        /** The bands across every Fach, and how each is painted. */
        this.levels = prepareCompetenceLevelNames(this.context.palette, this.overview.rows);
    }

    /** @override */
    validateData() {
        return this.overview.rows.length > 0;
    }

    /**
     * The side panel's pills: Fächer, Vergleich, Lerngruppen and Kompetenzstufen.
     * @override
     * @returns {import('../../../../../common/charts/legend/htmlLegendPanel.js').ChartKey}
     */
    chartKey() {
        return buildOverviewKey(
            this.context.palette,
            this.overview,
            this.levels.competenceLevelNames,
            this.levels.scaleIdForLevel,
        );
    }

    /**
     * The tooltip of one segment: titled with the bar's Fach/Domäne, counted on the bar's
     * own row.
     * @override
     * @param {{row: import('./competenceOverviewData.js').OverviewBarRow, level: string}} segment
     * @param {{type?: string}} [context] - `type` is the bar's subtitle.
     * @returns {import('../../../../../common/services/cursorTooltip.js').TooltipContent}
     */
    formatTooltipContent({ row, level }, context = {}) {
        return competenceShareTooltip(this, row, level, {
            title: row.domain,
            subtitle: context.type,
        });
    }

    /**
     * The bars the pills leave on, as a table: per shown Fach/Domäne each shown bar, with
     * its headcount and per shown Kompetenzstufe its share with its count. A group that
     * did not sit a Fach has a row of empty cells, as its bar has a note instead.
     * @override
     * @returns {import('../../../../../common/charts/host/chartDataTable.js').ChartDataTable|null} `null` while no bar is shown.
     */
    dataTable() {
        const isShown = this.#isShown;
        const { competenceLevelNames, scaleIdForLevel } = this.levels;
        const isLevelShown = buildLevelVisibility(isShown, this.context.palette, scaleIdForLevel);
        const levels = competenceLevelNames.filter(isLevelShown);
        const bars = this.overview.rows
            .filter((row) => pillShown(isShown, PILLS.subject, row.subject))
            .flatMap((row) =>
                row.bars.filter((bar) => isSlotShown(bar, isShown)).map((bar) => ({ row, bar })),
            );
        if (bars.length === 0) return null;
        return competenceShareTable(
            bars.map(({ row, bar }) => ({
                area: row.domain,
                valueGroup: bar.subtitle,
                row: bar.row,
                ladder: row.competenceLevelNames,
            })),
            levels,
        );
    }

    /**
     * Draw the chart for the legend state, or bring the drawn one to it: the layout is
     * solved for the shown Fächer and bars, the marks join by Fach/Domäne and slot, and
     * a hidden Kompetenzstufe leaves every bar. A legend toggle redraws in place, so the
     * chart also opens where the viewer left their toggles.
     * @override
     */
    renderChart() {
        const { rows, slots, groupNames } = this.overview;
        const { competenceLevelNames, scaleIdForLevel } = this.levels;
        const durationMs = this.drawDurationMs;

        const leftAxis = shareAxisSpace(this);
        // Content-driven width: subjects × (tracks + school + groups) sub-bands, each wide
        // enough for its group label's longest line, since group names are drawn in
        // full. Past the container, the chart scrolls.
        this.fitContentWidth(
            leftAxis +
                computeRequiredOverviewChartWidth(this, rows.length, slots.length, groupNames),
        );

        const { g, width, height, yScale } = openShareFrame(
            this,
            {
                left: leftAxis,
                bottom: measureOverviewBottomAxisSpace(
                    this,
                    rows.map((row) => row.displayDomain),
                ),
                top: measureOverviewTopAxisSpace(this, groupNames),
            },
            { axis: true },
        );

        const solved = solveOverviewLayout(this.overview, this.#isShown, width);

        // With every slot shown the sub-band is narrowest, and the width solve made it
        // fit the widest group name; the fit keeps only half the gap, since testing
        // against `step - GAP` would sit on an exact boundary where sub-pixel measurement
        // noise ellipsizes a label the reserve made room for.
        const { sub } = overviewBandScales(
            rows.map((row) => row.domain),
            slots.map((slot) => slot.key),
            width,
        );
        const anyShown = solved.visibleRows.length > 0 && solved.visibleSlots.length > 0;
        createOverviewBars(this, g, rows, {
            levels: competenceLevelNames,
            isLevelShown: buildLevelVisibility(
                this.#isShown,
                this.context.palette,
                scaleIdForLevel,
            ),
            yScale,
            // With everything hidden the bars keep the width of every slot shown.
            barWidth: (anyShown ? solved.sub : sub).bandwidth(),
            labelSlot: Math.max(0, sub.step() - OVERVIEW_GROUP_LABEL_GAP_PX / 2),
            durationMs,
        });

        const xAxis = appendCategoryAxis(g, width, height);
        layoutOverview(this, { g, xAxis }, solved, durationMs);
        closeShareFrame(this, g, { axis: true });
        if (!anyShown) this.renderAllHiddenOverlay();
    }
}
