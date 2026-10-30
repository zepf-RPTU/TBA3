import { describe, it, expect } from 'vitest';
import {
    getValidCategoryOptions,
    ensureValidCategory,
    resolveDefaultGroups,
    buildGroupOptions,
    buildChartTypeOptions,
} from '../../../../../src/sl/modules/charts/groupComparison/groupComparisonControlModel.js';
import { CHART_TYPE_LABELS } from '../../../../../src/sl/modules/charts/groupComparison/groupComparisonDataUtils.js';
import { groupLabelOf } from '../../../../../src/sl/modules/charts/groupComparison/groupComparisonChartTypes.js';

/** @typedef {import('../../../../../src/sl/modules/charts/groupComparison/groupComparisonChartTypes.js').GroupComparisonSources} GroupComparisonSources */

/** No payloads: the labels of a Kategorie other than a Fach/Domäne one need none. */
const NO_SOURCES = /** @type {GroupComparisonSources} */ ({
    subjectDomainList: [],
    comparisonSP: null,
    comparisonTQ: null,
    comparisonPoints: null,
});

/**
 * How a Kompetenzstufen group of the Kategorie reads.
 * @param {'gender'|'group'} category
 * @returns {(value: string) => string}
 */
const labelsOf = (category) => groupLabelOf(NO_SOURCES, { chartType: 'competenceLevel', category });

/**
 * @param {Array<{value: string}>} arr
 * @returns {string[]}
 */
const values = (arr) => arr.map((o) => o.value);

describe('getValidCategoryOptions', () => {
    it('offers Lerngruppe + Geschlecht at school scope', () => {
        expect(
            values(getValidCategoryOptions({ scopeFilter: null, chartType: 'competenceLevel' })),
        ).toEqual(['group', 'gender']);
    });

    it('offers Geschlecht + Fach for a specific group (non-selfEfficacy)', () => {
        expect(
            values(getValidCategoryOptions({ scopeFilter: '8a', chartType: 'competenceLevel' })),
        ).toEqual(['gender', 'subject']);
        expect(
            values(getValidCategoryOptions({ scopeFilter: '8a', chartType: 'teachingQuality' })),
        ).toEqual(['gender', 'subject']);
    });

    it('drops Fach for selfEfficacy in a group (it has no subject dimension)', () => {
        expect(
            values(getValidCategoryOptions({ scopeFilter: '8a', chartType: 'selfEfficacy' })),
        ).toEqual(['gender']);
    });
});

describe('ensureValidCategory', () => {
    it('keeps a category that is valid for the context', () => {
        expect(
            ensureValidCategory('gender', { scopeFilter: null, chartType: 'competenceLevel' }),
        ).toBe('gender');
        expect(
            ensureValidCategory('subject', { scopeFilter: '8a', chartType: 'competenceLevel' }),
        ).toBe('subject');
    });

    it('recovers to the first valid option when the current one is no longer offered', () => {
        // Switching scope or chart type can strand the Kategorie control on an
        // option the new context does not offer ('subject' exists only inside a group),
        // and the chart would try to render an impossible selection.
        expect(
            ensureValidCategory('subject', { scopeFilter: null, chartType: 'competenceLevel' }),
        ).toBe('group');
        expect(
            ensureValidCategory('group', { scopeFilter: '8a', chartType: 'competenceLevel' }),
        ).toBe('gender');
        expect(
            ensureValidCategory('subject', { scopeFilter: '8a', chartType: 'selfEfficacy' }),
        ).toBe('gender');
    });
});

describe('resolveDefaultGroups', () => {
    it('prefers female + male over payload order', () => {
        expect(resolveDefaultGroups(['diverse', 'female', 'male'], { category: 'gender' })).toEqual(
            { group1: 'female', group2: 'male' },
        );
    });

    it('falls back to the first two values for gender when female+male are not both present', () => {
        expect(resolveDefaultGroups(['d', 'x'], { category: 'gender' })).toEqual({
            group1: 'd',
            group2: 'x',
        });
    });

    it('defaults subjectName to the current subject vs. the first other subject', () => {
        expect(
            resolveDefaultGroups(['Deutsch', 'Englisch', 'Mathe'], {
                category: 'subject',
                currentSubject: 'Englisch',
            }),
        ).toEqual({ group1: 'Englisch', group2: 'Deutsch' });
    });

    it('falls back to the first two subjects when the current subject is not among the values', () => {
        expect(
            resolveDefaultGroups(['Deutsch', 'Mathe'], {
                category: 'subject',
                currentSubject: 'Physik',
            }),
        ).toEqual({ group1: 'Deutsch', group2: 'Mathe' });
    });

    it('leaves group 2 empty when only one value exists', () => {
        // Duplicating the sole value would compare the group with itself.
        expect(resolveDefaultGroups(['8a'], { category: 'group' })).toEqual({
            group1: '8a',
            group2: null,
        });
    });

    it('returns null for no values so the caller leaves the selection unchanged', () => {
        // An empty result must not blank out the current groups mid-interaction.
        expect(resolveDefaultGroups([], { category: 'gender' })).toBeNull();
    });
});

describe('buildGroupOptions', () => {
    it('translates the gender codes the payloads ship', () => {
        // This string is the group selector's option text. Untranslated, the
        // German dashboard would read "male" / "female" / "diverse".
        expect(buildGroupOptions(['female', 'male', 'diverse'], null, labelsOf('gender'))).toEqual([
            { value: 'female', text: 'Weiblich' },
            { value: 'male', text: 'Männlich' },
            { value: 'diverse', text: 'Divers' },
        ]);
    });

    it('excludes the value already chosen for the other group', () => {
        expect(buildGroupOptions(['8a', '8b', '8c'], '8b', labelsOf('group'))).toEqual([
            { value: '8a', text: '8a' },
            { value: '8c', text: '8c' },
        ]);
    });

    it('falls back to the full list when excluding would leave no options', () => {
        // A group selector must never render empty — if the only value equals
        // the other group's value, still offer it rather than an empty dropdown.
        expect(buildGroupOptions(['8a'], '8a', labelsOf('group'))).toEqual([
            { value: '8a', text: '8a' },
        ]);
    });
});

describe('buildChartTypeOptions', () => {
    /**
     * @param {Partial<import('../../../../../src/sl/modules/charts/groupComparison/groupComparisonChartTypes.js').GroupComparisonSources>} [overrides] - The payloads present.
     * @returns {import('../../../../../src/sl/modules/charts/groupComparison/groupComparisonChartTypes.js').GroupComparisonSources}
     */
    const sources = (overrides = {}) => ({
        subjectDomainList: [
            {
                key: 'Deutsch|LV',
                subjectName: 'Deutsch',
                domainId: 'LV',
                domainName: null,
                results: [],
            },
        ],
        comparisonSP: [],
        comparisonTQ: [],
        comparisonPoints: [],
        ...overrides,
    });
    const rating = [{ studentId: 's1', gender: null, groupName: '8a', mean: 3, subject: null }];
    const points = [
        {
            studentId: 's1',
            gender: null,
            groupName: '8a',
            subject: 'Deutsch',
            domainId: 'LV',
            domainName: 'LV',
            rawPoints: 1,
            maxPoints: 2,
            solutionRatePercent: 50,
        },
    ];
    const singleBooklet = { pointsMixedBooklets: false };

    it('offers Kompetenzstufen alone when no optional payload is present', () => {
        expect(buildChartTypeOptions(sources(), singleBooklet)).toEqual([
            { value: 'competenceLevel', text: CHART_TYPE_LABELS.competenceLevel, disabled: false },
        ]);
    });

    it('keeps the strip order when everything is available', () => {
        expect(
            buildChartTypeOptions(
                sources({ comparisonPoints: points, comparisonSP: rating, comparisonTQ: rating }),
                singleBooklet,
            ),
        ).toEqual([
            { value: 'competenceLevel', text: CHART_TYPE_LABELS.competenceLevel, disabled: false },
            { value: 'points', text: CHART_TYPE_LABELS.points, disabled: false },
            { value: 'selfEfficacy', text: CHART_TYPE_LABELS.selfEfficacy, disabled: false },
            { value: 'teachingQuality', text: CHART_TYPE_LABELS.teachingQuality, disabled: false },
        ]);
    });

    it('keeps the Lösungsquote listed but disabled for a pair on different booklets', () => {
        expect(
            buildChartTypeOptions(sources({ comparisonPoints: points }), {
                pointsMixedBooklets: true,
            }),
        ).toEqual([
            { value: 'competenceLevel', text: CHART_TYPE_LABELS.competenceLevel, disabled: false },
            { value: 'points', text: CHART_TYPE_LABELS.points, disabled: true },
        ]);
    });
});
