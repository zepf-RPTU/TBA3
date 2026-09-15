// @vitest-browser

/**
 * SL competency detail — the bottom axis labels.
 *
 * Measuring the height below the plot and drawing the labels into it used to be two
 * copies of the same dispatch, agreeing only while both were edited together. Both
 * now read `buildDetailBottomAxisLabels`; these tests pin that model per grouping
 * mode and that the reserved height follows the lines the model actually produces.
 */

import { describe, expect, it } from 'vitest';

import {
    buildDetailBottomAxisLabels,
    measureDetailBottomAxisSpace,
} from '@tba3/modules/sl/modules/charts/competency/detail/competencyDetailAxes.js';
import { LABEL_LINE_HEIGHT } from '@tba3/modules/common/charts/chartLabelFit.js';
import { splitLabelLines } from '@tba3/modules/common/charts/chartLabelFit.js';

const BY_SUBJECT = { groupBySubject: true, groupByDomain: false };
const BY_DOMAIN = {
    groupBySubject: false,
    groupByDomain: true,
    getGroupKey: (d) => `${d.subject}|${d.domain}`,
};
const BY_CLASS = { groupBySubject: false, groupByDomain: false };

/** One measured line's height, and the base text size, both fixed so the arithmetic is checkable. */
const LINE_HEIGHT = 10;
const FONT_SIZE = 20;

/**
 * A renderer stand-in: the label model needs only the prepared rows, the measurement
 * only the text measurer and the base text size. Records what it was asked to measure.
 * @param {Array<object>} chartData - The prepared rows.
 * @returns {object} The stand-in, with `measuredTexts` holding one entry per call.
 */
function rendererStub(chartData) {
    return {
        chartData,
        measuredTexts: [],
        getChartFont: () => 'TestFont',
        resolveChartTextSize: () => FONT_SIZE,
        measureTexts(texts) {
            this.measuredTexts.push(texts);
            return { maxHeight: LINE_HEIGHT, maxWidth: 120 };
        },
    };
}

describe('buildDetailBottomAxisLabels', () => {
    it('names subject groups by their label, in tick order', () => {
        const chartData = [
            { subject: 'en', subjectLabel: 'Englisch', name: '8a', type: 'class' },
            { subject: 'ma', name: '8a', type: 'class' },
        ];

        expect(buildDetailBottomAxisLabels(chartData, ['ma', 'en'], BY_SUBJECT)).toEqual([
            { key: 'ma', text: 'MA', fontWeight: 'normal', slotted: false },
            { key: 'en', text: 'Englisch', fontWeight: 'normal', slotted: false },
        ]);
    });

    it('drops a tick no row carries', () => {
        const chartData = [{ subject: 'en', subjectLabel: 'Englisch', name: '8a', type: 'class' }];

        expect(buildDetailBottomAxisLabels(chartData, ['en', 'de'], BY_SUBJECT)).toEqual([
            { key: 'en', text: 'Englisch', fontWeight: 'normal', slotted: false },
        ]);
    });

    it('appends the Domäne to the subject in domain mode, and omits it when there is none', () => {
        const chartData = [
            {
                subject: 'en',
                subjectLabel: 'Englisch',
                domain: 'hoe',
                domainLabel: 'Hörverstehen',
                displayDomainLabel: 'Hören',
                name: '8a',
                type: 'class',
            },
            { subject: 'ma', domain: '', name: '8a', type: 'class' },
        ];

        expect(
            buildDetailBottomAxisLabels(chartData, ['en|hoe', 'ma|'], BY_DOMAIN).map((l) => l.text),
        ).toEqual(['Englisch: Hören', 'MA']);
    });

    it('bolds aggregate rows and slots class names in class mode', () => {
        const chartData = [
            { subject: 'en', name: '8a', type: 'class' },
            { subject: 'en', name: 'Schule', type: 'school' },
            { subject: 'en', name: 'Landesschnitt', type: 'landesschnitt' },
        ];

        expect(
            buildDetailBottomAxisLabels(chartData, ['8a', 'Schule', 'Landesschnitt'], BY_CLASS),
        ).toEqual([
            { key: '8a', text: '8a', fontWeight: 'normal', slotted: true },
            { key: 'Schule', text: 'Schule', fontWeight: 'bold', slotted: true },
            { key: 'Landesschnitt', text: 'Landesschnitt', fontWeight: 'bold', slotted: true },
        ]);
    });

    it('has nothing to label without ticks', () => {
        expect(buildDetailBottomAxisLabels([{ name: '8a', type: 'class' }], [], BY_CLASS)).toEqual(
            [],
        );
    });
});

describe('measureDetailBottomAxisSpace', () => {
    it('measures exactly the lines the label model is drawn as', () => {
        const chartData = [
            { subject: 'en', name: 'D_E_08a_ABCD', type: 'class' },
            { subject: 'en', name: 'Schule', type: 'school' },
        ];
        const renderer = rendererStub(chartData);
        const xDomain = ['D_E_08a_ABCD', 'Schule'];

        measureDetailBottomAxisSpace(renderer, xDomain, BY_CLASS);

        const modelLines = buildDetailBottomAxisLabels(chartData, xDomain, BY_CLASS).flatMap(
            (label) => splitLabelLines(label.text),
        );
        expect(modelLines).toEqual(['D_E_', '08a_ABCD', 'Schule']);
        expect(renderer.measuredTexts).toEqual([modelLines]);
    });

    it('reserves one extra line step for a label that breaks over two lines', () => {
        const oneLine = [{ subject: 'en', name: '8a', type: 'class' }];
        const twoLines = [{ subject: 'en', name: 'D_E_08a_ABCD', type: 'class' }];

        const flat = measureDetailBottomAxisSpace(rendererStub(oneLine), ['8a'], BY_CLASS);
        const wrapped = measureDetailBottomAxisSpace(
            rendererStub(twoLines),
            ['D_E_08a_ABCD'],
            BY_CLASS,
        );

        expect(wrapped - flat).toBe(FONT_SIZE * LABEL_LINE_HEIGHT);
        expect(flat).toBeGreaterThan(LINE_HEIGHT);
    });

    it('reserves nothing when the model is empty', () => {
        const renderer = rendererStub([{ subject: 'en', name: '8a', type: 'class' }]);

        expect(measureDetailBottomAxisSpace(renderer, [], BY_CLASS)).toBe(0);
        expect(renderer.measuredTexts).toEqual([]);
    });
});
