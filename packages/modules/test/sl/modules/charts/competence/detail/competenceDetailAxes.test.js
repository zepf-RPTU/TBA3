// @vitest-browser

/**
 * SL competence detail — the bottom axis labels.
 *
 * Measuring the height below the plot and drawing the labels into it both read
 * `buildDetailBottomAxisLabels`; these tests pin that model per grouping
 * mode and that the reserved height follows the lines the model actually produces.
 */

import { describe, expect, it } from 'vitest';
import { fontWeightToken } from '../../../../../../src/common/utils/fontTokens.js';

import {
    buildDetailBottomAxisLabels,
    measureDetailBottomAxisSpace,
} from '../../../../../../src/sl/modules/charts/competence/detail/competenceDetailAxes.js';
import { categoryAxisReserve } from '../../../../../../src/sl/modules/charts/competence/shared/competenceAxes.js';
import { LABEL_LINE_HEIGHT_EM } from '../../../../../../src/common/charts/chartLabelFit.js';
import { splitLabelLines } from '../../../../../../src/common/charts/chartLabelFit.js';

/** @typedef {import('../../../../../../src/sl/modules/charts/competence/detail/competenceDetailData.js').CompetenceChartRow} CompetenceChartRow */
/** @typedef {import('../../../../../../src/sl/modules/charts/competence/detail/competenceDetailGrouping.js').CompetenceGroupingConfig} CompetenceGroupingConfig */
/** @typedef {import('../../../../../../src/sl/modules/charts/competence/detail/competenceDetailRenderer.js').CompetenceDetailRenderer} CompetenceDetailRenderer */

/**
 * A prepared row carrying only the fields a case sets: the label model reads nothing else.
 * @param {Partial<CompetenceChartRow> & Pick<CompetenceChartRow, 'type' | 'name'>} fields
 * @returns {CompetenceChartRow}
 */
const chartRow = (fields) => /** @type {CompetenceChartRow} */ (fields);

/**
 * A grouping config carrying only the mode flags and accessors a case sets: the label
 * model reads nothing else.
 * @param {{groupBySubject: boolean, groupByDomain: boolean, getGroupKey?: (row: CompetenceChartRow) => string}} fields
 * @returns {CompetenceGroupingConfig}
 */
const grouping = (fields) =>
    /** @type {CompetenceGroupingConfig} */ (/** @type {unknown} */ (fields));

const BY_SUBJECT = grouping({ groupBySubject: true, groupByDomain: false });
const BY_DOMAIN = grouping({
    groupBySubject: false,
    groupByDomain: true,
    getGroupKey: (d) => `${d.subject}|${d.domain}`,
});
const BY_GROUP = grouping({ groupBySubject: false, groupByDomain: false });

/** One measured line's height, and the base text size, both fixed so the arithmetic is checkable. */
const LINE_HEIGHT_PX = 10;
const FONT_SIZE_PX = 20;

/**
 * A renderer stand-in: the label model needs only the prepared rows, the measurement
 * only the text measurer and the base text size. Records what it was asked to measure.
 * @param {CompetenceChartRow[]} chartData
 * @returns {CompetenceDetailRenderer & {measuredTexts: string[][]}} `measuredTexts` holds one entry per call.
 */
function rendererStub(chartData) {
    /** @type {string[][]} */
    const measuredTexts = [];
    const stub = {
        chartData,
        measuredTexts,
        resolveChartTextSize: () => FONT_SIZE_PX,
        /**
         * @param {string[]} texts
         * @returns {{maxHeight: number, maxWidth: number}} Their fixed size.
         */
        measureTexts(texts) {
            measuredTexts.push(texts);
            return { maxHeight: LINE_HEIGHT_PX, maxWidth: 120 };
        },
    };
    // The measurement reads only these members of the renderer.
    return /** @type {CompetenceDetailRenderer & {measuredTexts: string[][]}} */ (
        /** @type {unknown} */ (stub)
    );
}

describe('buildDetailBottomAxisLabels', () => {
    it('names subject groups by their Fach, in tick order', () => {
        const chartData = [
            chartRow({ subject: 'Englisch', name: '8a', type: 'group' }),
            chartRow({ subject: 'Mathematik', name: '8a', type: 'group' }),
        ];

        expect(
            buildDetailBottomAxisLabels(chartData, ['Mathematik', 'Englisch'], BY_SUBJECT),
        ).toEqual([
            { key: 'Mathematik', text: 'Mathematik', fontWeight: 'normal', slotted: false },
            { key: 'Englisch', text: 'Englisch', fontWeight: 'normal', slotted: false },
        ]);
    });

    it('drops a tick no row carries', () => {
        const chartData = [chartRow({ subject: 'Englisch', name: '8a', type: 'group' })];

        expect(buildDetailBottomAxisLabels(chartData, ['Englisch', 'Deutsch'], BY_SUBJECT)).toEqual(
            [{ key: 'Englisch', text: 'Englisch', fontWeight: 'normal', slotted: false }],
        );
    });

    it('appends the Domäne to the subject in domain mode, and omits it when there is none', () => {
        const chartData = [
            chartRow({
                subject: 'Englisch',
                domain: 'hoe',
                domainLabel: 'Hörverstehen',
                displayDomainLabel: 'Hören',
                name: '8a',
                type: 'group',
            }),
            chartRow({ subject: 'Mathematik', domain: '', name: '8a', type: 'group' }),
        ];

        expect(
            buildDetailBottomAxisLabels(chartData, ['Englisch|hoe', 'Mathematik|'], BY_DOMAIN).map(
                (l) => l.text,
            ),
        ).toEqual(['Englisch: Hören', 'Mathematik']);
    });

    it('bolds aggregate rows and slots group names in group mode', () => {
        const chartData = [
            chartRow({ subject: 'en', name: '8a', type: 'group' }),
            chartRow({ subject: 'en', name: 'Schule', type: 'school' }),
            chartRow({ subject: 'en', name: 'Landesschnitt', type: 'comparison' }),
        ];

        expect(
            buildDetailBottomAxisLabels(chartData, ['8a', 'Schule', 'Landesschnitt'], BY_GROUP),
        ).toEqual([
            { key: '8a', text: '8a', fontWeight: 'normal', slotted: true },
            { key: 'Schule', text: 'Schule', fontWeight: fontWeightToken('bold'), slotted: true },
            {
                key: 'Landesschnitt',
                text: 'Landesschnitt',
                fontWeight: fontWeightToken('bold'),
                slotted: true,
            },
        ]);
    });
});

describe('measureDetailBottomAxisSpace', () => {
    /**
     * @param {CompetenceChartRow[]} chartData
     * @param {string[]} xDomain
     * @param {CompetenceGroupingConfig} [groupingConfig]
     * @returns {ReturnType<typeof buildDetailBottomAxisLabels>}
     */
    const labelsOf = (chartData, xDomain, groupingConfig = BY_GROUP) =>
        buildDetailBottomAxisLabels(chartData, xDomain, groupingConfig);

    it('measures exactly the lines the label model is drawn as', () => {
        const chartData = [
            chartRow({ subject: 'en', name: 'D_E_08a_ABCD', type: 'group' }),
            chartRow({ subject: 'en', name: 'Schule', type: 'school' }),
        ];
        const renderer = rendererStub(chartData);
        const labels = labelsOf(chartData, ['D_E_08a_ABCD', 'Schule']);

        measureDetailBottomAxisSpace(renderer, labels);

        const modelLines = labels.flatMap((label) => splitLabelLines(label.text));
        expect(modelLines).toEqual(['D_E_', '08a_ABCD', 'Schule']);
        expect(renderer.measuredTexts).toEqual([modelLines]);
    });

    it('measures controlled Fach/Domäne labels unsplit, as they are drawn', () => {
        const chartData = [
            chartRow({
                subject: 'Englisch',
                domain: 'hoe',
                domainLabel: 'Hörverstehen',
                displayDomainLabel: 'Hörverstehen',
                name: '8a',
                type: 'group',
            }),
        ];
        const renderer = rendererStub(chartData);

        measureDetailBottomAxisSpace(renderer, labelsOf(chartData, ['Englisch|hoe'], BY_DOMAIN));

        expect(renderer.measuredTexts).toEqual([['Englisch: Hörverstehen']]);
    });

    it('reserves one extra line step for a label that breaks over two lines', () => {
        const oneLine = [chartRow({ subject: 'en', name: '8a', type: 'group' })];
        const twoLines = [chartRow({ subject: 'en', name: 'D_E_08a_ABCD', type: 'group' })];

        const flat = measureDetailBottomAxisSpace(rendererStub(oneLine), labelsOf(oneLine, ['8a']));
        const wrapped = measureDetailBottomAxisSpace(
            rendererStub(twoLines),
            labelsOf(twoLines, ['D_E_08a_ABCD']),
        );

        expect(flat).toBe(categoryAxisReserve(LINE_HEIGHT_PX));
        expect(wrapped).toBe(
            categoryAxisReserve(LINE_HEIGHT_PX + FONT_SIZE_PX * LABEL_LINE_HEIGHT_EM),
        );
    });

    it('reserves nothing when the model is empty', () => {
        const renderer = rendererStub([chartRow({ subject: 'en', name: '8a', type: 'group' })]);

        expect(measureDetailBottomAxisSpace(renderer, [])).toBe(0);
        expect(renderer.measuredTexts).toEqual([]);
    });
});
