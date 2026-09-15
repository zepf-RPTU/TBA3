import { describe, it, expect } from 'vitest';
import {
    getValidCategoryOptions,
    ensureValidCategory,
    resolveDefaultGroups,
    getGroupDisplayValue,
    buildGroupOptions,
    buildControlStateKey,
    buildChartTypeOptions,
} from '@tba3/modules/sl/modules/charts/groupComparison/groupComparisonControlModel.js';
import {
    CHART_TYPE_LABELS,
    getGenderLabel,
} from '@tba3/modules/sl/modules/charts/groupComparison/groupComparisonDataUtils.js';

const values = (arr) => arr.map((o) => o.value);

describe('getValidCategoryOptions', () => {
    it('offers Klasse + Geschlecht at school scope', () => {
        expect(values(getValidCategoryOptions({ scopeFilter: null, chartType: 'ks' }))).toEqual([
            'class',
            'gender',
        ]);
    });

    it('offers Geschlecht + Fach for a specific class (non-selfEfficacy)', () => {
        expect(values(getValidCategoryOptions({ scopeFilter: '8a', chartType: 'ks' }))).toEqual([
            'gender',
            'fach',
        ]);
        expect(
            values(getValidCategoryOptions({ scopeFilter: '8a', chartType: 'teachingQuality' })),
        ).toEqual(['gender', 'fach']);
    });

    it('drops Fach for selfEfficacy in a class (it has no subject dimension)', () => {
        expect(
            values(getValidCategoryOptions({ scopeFilter: '8a', chartType: 'selfEfficacy' })),
        ).toEqual(['gender']);
    });
});

describe('ensureValidCategory', () => {
    it('keeps a category that is valid for the context', () => {
        expect(ensureValidCategory('gender', { scopeFilter: null, chartType: 'ks' })).toBe(
            'gender',
        );
        expect(ensureValidCategory('fach', { scopeFilter: '8a', chartType: 'ks' })).toBe('fach');
    });

    it('recovers to the first valid option when the current one is no longer offered', () => {
        // WHY: switching scope/chart-type can strand the Kategorie control on an
        // option that no longer exists (e.g. 'fach' only exists inside a class).
        // Without recovery the chart would try to render an impossible selection.
        // 'fach' is invalid at school scope → first valid is 'class'
        expect(ensureValidCategory('fach', { scopeFilter: null, chartType: 'ks' })).toBe('class');
        // 'class' is invalid inside a class → first valid is 'gender'
        expect(ensureValidCategory('class', { scopeFilter: '8a', chartType: 'ks' })).toBe('gender');
        // 'fach' becomes invalid when switching to selfEfficacy in a class → 'gender'
        expect(ensureValidCategory('fach', { scopeFilter: '8a', chartType: 'selfEfficacy' })).toBe(
            'gender',
        );
    });
});

describe('resolveDefaultGroups', () => {
    it('prefers female + male, the spelling every dataset actually ships', () => {
        // WHY: measured, `covariates[].value` is `male`/`female`/`diverse` in all four
        // SL datasets — the single letters appear nowhere. Searching only for 'f'/'m'
        // found neither, so the default pairing silently degraded to "the first two
        // unique values", i.e. whatever order the payload happened to produce.
        expect(resolveDefaultGroups(['diverse', 'female', 'male'], { category: 'gender' })).toEqual(
            { group1: 'female', group2: 'male' },
        );
    });

    it('accepts the legacy letter spellings when the long forms are absent', () => {
        // WHY: the red/green group pairing must resolve to female-vs-male rather than
        // an arbitrary pair, whichever vocabulary a dataset encodes it in.
        expect(resolveDefaultGroups(['d', 'f', 'm'], { category: 'gender' })).toEqual({
            group1: 'f',
            group2: 'm',
        });
        expect(resolveDefaultGroups(['m', 'w'], { category: 'gender' })).toEqual({
            group1: 'w',
            group2: 'm',
        });
    });

    it('falls back to the first two values for gender when female+male are not both present', () => {
        expect(resolveDefaultGroups(['d', 'x'], { category: 'gender' })).toEqual({
            group1: 'd',
            group2: 'x',
        });
    });

    it('defaults fach to the current subject vs. the first other subject', () => {
        expect(
            resolveDefaultGroups(['Deutsch', 'Englisch', 'Mathe'], {
                category: 'fach',
                currentSubjectName: 'Englisch',
            }),
        ).toEqual({ group1: 'Englisch', group2: 'Deutsch' });
    });

    it('falls back to the first two subjects when the current subject is not among the values', () => {
        expect(
            resolveDefaultGroups(['Deutsch', 'Mathe'], {
                category: 'fach',
                currentSubjectName: 'Physik',
            }),
        ).toEqual({ group1: 'Deutsch', group2: 'Mathe' });
    });

    it('uses the first two values for any other category (e.g. class)', () => {
        expect(resolveDefaultGroups(['8a', '8b', '8c'], { category: 'class' })).toEqual({
            group1: '8a',
            group2: '8b',
        });
    });

    it('duplicates the sole value when only one exists', () => {
        expect(resolveDefaultGroups(['8a'], { category: 'class' })).toEqual({
            group1: '8a',
            group2: '8a',
        });
    });

    it('returns null for no values so the caller leaves the selection unchanged', () => {
        // WHY: an empty result must NOT blank out the current groups mid-interaction.
        expect(resolveDefaultGroups([], { category: 'gender' })).toBeNull();
    });
});

describe('getGroupDisplayValue', () => {
    it('passes non-gender values through unchanged (e.g. class names)', () => {
        expect(getGroupDisplayValue('8a', 'class')).toBe('8a');
    });

    it('delegates gender labels to the shared formatter, passing Fach names through', () => {
        expect(getGroupDisplayValue('female', 'gender')).toBe(getGenderLabel('female'));
        expect(getGroupDisplayValue('Deutsch', 'fach')).toBe('Deutsch');
    });

    it('translates the gender codes the payloads ship', () => {
        // WHY: this string is the group selector's option text and the chart's group
        // label. Untranslated, a German-language dashboard read "male" / "female" /
        // "diverse" on every dataset, including the demo fixture.
        expect(getGroupDisplayValue('female', 'gender')).toBe('Weiblich');
        expect(getGroupDisplayValue('male', 'gender')).toBe('Männlich');
        expect(getGroupDisplayValue('diverse', 'gender')).toBe('Divers');
    });
});

describe('buildGroupOptions', () => {
    it('excludes the value already chosen for the other group', () => {
        expect(buildGroupOptions(['8a', '8b', '8c'], '8b', 'class')).toEqual([
            { value: '8a', text: '8a' },
            { value: '8c', text: '8c' },
        ]);
    });

    it('falls back to the full list when excluding would leave no options', () => {
        // WHY: a group selector must never render empty — if the only value equals
        // the other group's value, still offer it rather than an empty dropdown.
        expect(buildGroupOptions(['8a'], '8a', 'class')).toEqual([{ value: '8a', text: '8a' }]);
    });
});

describe('buildControlStateKey', () => {
    const state = {
        chartType: 'ks',
        subjectIndex: 0,
        category: 'gender',
        scopeFilter: null,
        group1: 'f',
        group2: 'm',
    };

    it('is stable for identical state', () => {
        expect(buildControlStateKey(state)).toBe(buildControlStateKey({ ...state }));
    });

    it('changes when any selection field changes', () => {
        const base = buildControlStateKey(state);
        expect(buildControlStateKey({ ...state, chartType: 'points' })).not.toBe(base);
        expect(buildControlStateKey({ ...state, subjectIndex: 1 })).not.toBe(base);
        expect(buildControlStateKey({ ...state, scopeFilter: '8a' })).not.toBe(base);
        expect(buildControlStateKey({ ...state, group2: 'd' })).not.toBe(base);
    });
});

describe('buildChartTypeOptions', () => {
    const availability = {
        hasPoints: false,
        hasSelfEfficacy: false,
        hasTeachingQuality: false,
    };

    it('offers Kompetenzstufen alone when no optional payload is present', () => {
        expect(buildChartTypeOptions(availability)).toEqual([
            { value: 'ks', text: CHART_TYPE_LABELS.ks },
        ]);
    });

    it('adds each available measure', () => {
        expect(values(buildChartTypeOptions({ ...availability, hasPoints: true }))).toEqual([
            'ks',
            'points',
        ]);
        expect(values(buildChartTypeOptions({ ...availability, hasSelfEfficacy: true }))).toEqual([
            'ks',
            'selfEfficacy',
        ]);
        expect(
            values(buildChartTypeOptions({ ...availability, hasTeachingQuality: true })),
        ).toEqual(['ks', 'teachingQuality']);
    });

    it('keeps the strip order when everything is available', () => {
        expect(
            buildChartTypeOptions({
                hasPoints: true,
                hasSelfEfficacy: true,
                hasTeachingQuality: true,
            }),
        ).toEqual([
            { value: 'ks', text: CHART_TYPE_LABELS.ks },
            { value: 'points', text: CHART_TYPE_LABELS.points },
            { value: 'selfEfficacy', text: CHART_TYPE_LABELS.selfEfficacy },
            { value: 'teachingQuality', text: CHART_TYPE_LABELS.teachingQuality },
        ]);
    });
});
