// @vitest-browser
// boxPlotFigure.js calls getThemeColors() at draw time for the surface fill.
import { describe, it, expect } from 'vitest';

import { calculateDetailedBoxPlotStats } from '@tba3/modules/sl/utils/slBoxPlotStats.js';
import { getDiamondPath } from '@tba3/modules/common/charts/markerSymbols.js';
import {
    BOX_FIGURE_COMPACT,
    BOX_FIGURE_STANDARD,
    drawBoxPlotFigure,
} from '@tba3/modules/sl/modules/charts/shared/boxPlotFigure.js';

/**
 * The three SL box plots each drew their own figure until this module existed, and the
 * differences were not cosmetic: the Unterrichtsqualität overlay put the *mean* on the
 * centre line where the other two put the median, and only one of the three drew
 * outliers at all. Same marks, different meanings, no cue to the reader.
 *
 * These tests pin which mark stands for which statistic. They run against a recording
 * stand-in for a D3 selection rather than a real one: the repo ships no d3 to the test
 * environment (see `tests/unit/support/chartHarness.js`), and a stub complete enough to
 * render would be larger than the module and would test itself.
 */

/** Records every mark appended to it, with the attributes finally set on each. */
function recordingSelection() {
    const marks = [];

    const makeMark = (tag, datum) => {
        const mark = { tag, datum, attrs: {}, styles: {} };
        const api = {
            attr(name, value) {
                mark.attrs[name] = typeof value === 'function' ? value(datum) : value;
                return api;
            },
            style(name, value) {
                mark.styles[name] = value;
                return api;
            },
            datum(value) {
                mark.datum = value;
                return api;
            },
        };
        marks.push(mark);
        return api;
    };

    const selection = {
        marks,
        append: (tag) => makeMark(tag, undefined),
        // The one join the figure uses, for the outlier points.
        selectAll: () => ({
            data: (values) => ({
                enter: () => ({
                    append: (tag) => {
                        const apis = values.map((value) => makeMark(tag, value));
                        return {
                            attr(name, value) {
                                apis.forEach((api) => api.attr(name, value));
                                return this;
                            },
                            style(name, value) {
                                apis.forEach((api) => api.style(name, value));
                                return this;
                            },
                            // `selection.datum(v)` sets __data__ on every node in the
                            // selection, which is how the figure rebinds its outliers.
                            datum(value) {
                                apis.forEach((api) => api.datum(value));
                                return this;
                            },
                        };
                    },
                }),
            }),
        }),
    };

    return selection;
}

const classesOf = (selection) => selection.marks.map((mark) => mark.attrs.class);
const markWith = (selection, className) =>
    selection.marks.find((mark) => mark.attrs.class === className);

const identityScale = (value) => value;

const geometry = (extra = {}) => ({
    centerX: 100,
    boxWidth: 40,
    capWidth: 20,
    yScale: identityScale,
    color: '#123456',
    ...extra,
});

describe('drawBoxPlotFigure', () => {
    it('puts the median on the centre line and the mean on its own mark', () => {
        // WHY: the Unterrichtsqualität overlay used to draw the *mean* as the line inside
        // the box and no median at all, while the other two charts drew the median there
        // and the mean as a diamond. One position, two statistics, depending on the view.
        const stats = calculateDetailedBoxPlotStats([1, 2, 3, 4, 100]);
        const selection = recordingSelection();

        drawBoxPlotFigure(selection, stats, geometry());

        expect(markWith(selection, 'median-line').attrs.y1).toBe(stats.median);
        expect(markWith(selection, 'mean-point').attrs.transform).toContain(`,${stats.mean}`);
        expect(markWith(selection, 'mean-point').tag).toBe('path');
        // The shared diamond every other chart and legend draws, centred on the transform.
        expect(markWith(selection, 'mean-point').attrs.d).toBe(
            getDiamondPath(0, 0, BOX_FIGURE_STANDARD.meanSize * Math.sqrt(1.25)),
        );
        expect(stats.median).not.toBe(stats.mean);
    });

    it('draws the marks back to front, so the box does not hide the whisker', () => {
        const stats = calculateDetailedBoxPlotStats([1, 2, 3, 4, 5]);
        const selection = recordingSelection();

        drawBoxPlotFigure(selection, stats, geometry());

        expect(classesOf(selection)).toEqual([
            'whisker-line',
            'whisker-cap',
            'whisker-cap',
            'box',
            'median-line',
            'mean-point',
        ]);
    });

    it('draws one point per outlier, beyond the whisker caps', () => {
        // WHY: outliers used to be drawn by exactly one of the three charts, so in the
        // other two a whisker end looked like the extreme of the data when it was not.
        const stats = calculateDetailedBoxPlotStats([1, 2, 3, 4, 100]);
        const selection = recordingSelection();

        drawBoxPlotFigure(selection, stats, geometry());

        const outliers = selection.marks.filter((mark) => mark.attrs.class === 'outlier');
        expect(outliers).toHaveLength(1);
        expect(outliers[0].attrs.cy).toBe(100);
        expect(markWith(selection, 'whisker-line').attrs.y2).toBe(stats.whiskerMax);
        expect(stats.whiskerMax).toBeLessThan(100);
    });

    it('spans the box from q1 to q3 and the whisker between the whisker ends', () => {
        const stats = calculateDetailedBoxPlotStats([1, 2, 3, 4, 5]);
        const selection = recordingSelection();

        drawBoxPlotFigure(selection, stats, geometry());

        const box = markWith(selection, 'box');
        expect(box.attrs.y).toBe(Math.min(stats.q1, stats.q3));
        expect(box.attrs.height).toBe(Math.abs(stats.q1 - stats.q3));
        expect(box.attrs.x).toBe(80);
        expect(box.attrs.width).toBe(40);

        const whisker = markWith(selection, 'whisker-line');
        expect(whisker.attrs.y1).toBe(stats.whiskerMin);
        expect(whisker.attrs.y2).toBe(stats.whiskerMax);
    });

    it('draws the same marks at overlay weight under the compact style', () => {
        // The compact preset is a weight, not a different figure: an overlay squeezed
        // beside grouped bars must not read as another bar, but it still means the same.
        const stats = calculateDetailedBoxPlotStats([1, 2, 3, 4, 5]);
        const standard = recordingSelection();
        const compact = recordingSelection();

        drawBoxPlotFigure(standard, stats, geometry({ style: BOX_FIGURE_STANDARD }));
        drawBoxPlotFigure(compact, stats, geometry({ style: BOX_FIGURE_COMPACT }));

        expect(classesOf(compact)).toEqual(classesOf(standard));
        expect(markWith(compact, 'box').attrs['stroke-width']).toBeLessThan(
            markWith(standard, 'box').attrs['stroke-width'],
        );
        expect(markWith(compact, 'box').attrs.opacity).toBe(0.7);
        expect(markWith(standard, 'box').attrs.opacity).toBeUndefined();
    });

    it("binds the caller's datum to every mark, so per-element tooltips can be wired", () => {
        // WHY the outlier is in this set: the join needs the outlier's own value as
        // datum to place it in y, so it is the one mark that can end up still carrying
        // a bare number. A caller that wires one tooltip over the whole figure reads
        // the figure's context off that datum, and a number there is a TypeError on
        // hover - which is exactly what the longitudinal chart does with `outliers`.
        const stats = calculateDetailedBoxPlotStats([1, 2, 3, 4, 100]);
        const selection = recordingSelection();
        const tooltipData = { year: '2026' };

        drawBoxPlotFigure(selection, stats, geometry({ datum: tooltipData }));

        expect(selection.marks.some((mark) => mark.attrs.class === 'outlier')).toBe(true);
        expect(selection.marks.every((mark) => mark.datum === tooltipData)).toBe(true);
    });

    it('still places each outlier at its own value, despite the rebound datum', () => {
        // The rebinding has to happen after `cy` is resolved, or every outlier lands
        // on the same y.
        const stats = calculateDetailedBoxPlotStats([1, 2, 3, 4, 5, 6, 7, 8, 100, 120]);
        const selection = recordingSelection();

        drawBoxPlotFigure(selection, stats, geometry({ datum: { year: '2026' } }));

        const outliers = selection.marks.filter((mark) => mark.attrs.class === 'outlier');
        expect(outliers.map((mark) => mark.attrs.cy)).toEqual([100, 120]);
    });
});
