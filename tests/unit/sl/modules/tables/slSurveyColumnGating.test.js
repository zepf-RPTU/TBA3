// @vitest-browser
// (transitive: slBaseTableModule.js -> tableModule.js touches the DOM on construction)

import { describe, it, expect } from 'vitest';
import { SlBaseTableModule } from '@tba3/modules/sl/modules/tables/slBaseTableModule.js';
import {
    defineSlDatasets,
    getSurveyRows,
    getSurveyScales,
} from '../../../../../src/sl/slDataService.js';
import { SL_DATA_KEYS } from '../../../../../src/sl/slDataKeys.js';
import {
    buildSelfEfficacyByClass,
    buildSelfEfficacySchool,
    buildTeachingQualityByClassSubject,
    detectSurveyScales,
} from '../../../../../src/sl/slSurveyDerivation.js';
import { DataStore } from '../../../../../src/common/services/dataStore.js';

/**
 * Whether the Unterrichtsqualität / Selbstwirksamkeit columns get built at all.
 *
 * Both are per-student survey scales (`tq_mean`, `sp_mean`) that only the demo fixture
 * ships; a state export has no source for them. The columns used to be added
 * unconditionally, and the cell formatter returns `''` per cell — so every dataset
 * without the survey carried two permanently blank columns in two tables. Blank is not the same as absent: it reads as a table that failed to render.
 *
 * The trap this pins is the shape of "no data": the builders return an empty *array*,
 * which is truthy, so `if (this._teachingQuality)` — the obvious guard, and the one
 * used elsewhere in these modules — is true for a dataset that has nothing.
 */

/** Student rows in the export shape: no `sp_mean`, no `tq_mean` in `properties[]`. */
const EXPORT_STUDENTS = [
    {
        id: 's1',
        subject: { id: 'de', name: 'Deutsch' },
        domain: { id: 'le', name: 'Lesen' },
        properties: [
            { key: 'competenceScale', value: 'nw-de-le' },
            { key: 'booklet', value: 'TH01' },
        ],
        covariates: [{ type: 'group', value: '8a' }],
    },
];

/** The demo fixture's shape: both scales present on every student. */
const FIXTURE_STUDENTS = [
    {
        id: 's1',
        subject: { id: 'de', name: 'Deutsch' },
        domain: { id: 'le', name: 'Lesen' },
        properties: [
            { key: 'sp_mean', value: 3.4 },
            { key: 'tq_mean', value: 2.8 },
        ],
        covariates: [{ type: 'group', value: '8a' }],
    },
];

function moduleFor(studentsData) {
    const container = document.createElement('div');
    container.id = 'sl-survey-gating-host';
    document.body.appendChild(container);

    const module = new SlBaseTableModule('sl-survey-gating-host', container, {});
    module._storeCommonRenderData({
        levelDefinitions: new Map(),
        teachingQuality: buildTeachingQualityByClassSubject(studentsData),
        selfEfficacyByClass: buildSelfEfficacyByClass(studentsData),
        selfEfficacySchool: buildSelfEfficacySchool(studentsData),
    });

    return module;
}

describe('SL survey-column gating', () => {
    it('reports both measures absent for an export that ships neither scale', () => {
        const module = moduleFor(EXPORT_STUDENTS);

        // The guard has to survive the empty array the builders return, not just null.
        expect(module._teachingQuality).toEqual([]);
        expect(module._selfEfficacyByClass).toEqual([]);

        expect(module._hasTeachingQualityData()).toBe(false);
        expect(module._hasSelfEfficacyData()).toBe(false);
    });

    it('reports both measures present for the fixture that does ship them', () => {
        // WHY: the features are hidden when a dataset lacks `tq_mean`/`sp_mean`, not
        // removed. A gate that read "false"
        // everywhere would silently delete a working part of the demo dashboard.
        const module = moduleFor(FIXTURE_STUDENTS);

        expect(module._hasTeachingQualityData()).toBe(true);
        expect(module._hasSelfEfficacyData()).toBe(true);
    });
});

/**
 * The same question asked of the raw payload rather than of a built table, because the
 * header controls have to answer it before any view has rendered.
 *
 * What rides on it is a control that looks operable and is not: Balken/Boxplot switches
 * nothing but Unterrichtsqualität and Selbstwirksamkeit geometry, so on a dataset with
 * neither it depresses, redraws, and changes nothing a reader can see.
 */
describe('detectSurveyScales', () => {
    it('reports neither scale for an export that ships no questionnaire', () => {
        expect(detectSurveyScales(EXPORT_STUDENTS)).toEqual({
            hasTeachingQuality: false,
            hasSelfEfficacy: false,
        });
    });

    it('reports both scales for the demo fixture', () => {
        expect(detectSurveyScales(FIXTURE_STUDENTS)).toEqual({
            hasTeachingQuality: true,
            hasSelfEfficacy: true,
        });
    });

    it('reports the two scales independently', () => {
        // WHY the flags cannot collapse into one "has survey data" boolean: the two
        // gates want different answers from a half-populated dataset. Balken/Boxplot
        // stays if *either* scale is there — it still has a column to redraw. The
        // Verlauf boxplot needs *both*, because it is one combined chart that hides the
        // Selbstwirksamkeit card while active, and with one scale missing it would draw
        // half a chart and pocket the card that still had data.
        const teachingQualityOnly = [
            { ...FIXTURE_STUDENTS[0], properties: [{ key: 'tq_mean', value: 2.8 }] },
        ];
        const selfEfficacyOnly = [
            { ...FIXTURE_STUDENTS[0], properties: [{ key: 'sp_mean', value: 3.4 }] },
        ];

        expect(detectSurveyScales(teachingQualityOnly)).toEqual({
            hasTeachingQuality: true,
            hasSelfEfficacy: false,
        });
        expect(detectSurveyScales(selfEfficacyOnly)).toEqual({
            hasTeachingQuality: false,
            hasSelfEfficacy: true,
        });
    });

    it('survives the shapes a partial payload actually arrives in', () => {
        // Students with no `properties` at all are real: the array is optional in the
        // spec, and an unguarded `entry.properties.some(...)` throws on the first one —
        // during header construction, which takes the whole dashboard down rather than
        // one control.
        expect(detectSurveyScales([{ id: 's1' }, { id: 's2', properties: null }])).toEqual({
            hasTeachingQuality: false,
            hasSelfEfficacy: false,
        });
        expect(detectSurveyScales([])).toEqual({
            hasTeachingQuality: false,
            hasSelfEfficacy: false,
        });
        expect(detectSurveyScales(undefined)).toEqual({
            hasTeachingQuality: false,
            hasSelfEfficacy: false,
        });
    });
});

describe('the two survey-gate levels agree where they must', () => {
    // WHY: the Balken/Boxplot switch redraws only the survey columns, and those are
    // built iff an aggregate row exists. The header used to ask "ships the scale"
    // (getSurveyScales) while the tables asked "has rows" — a payload that carries the
    // `tq_mean` key on every student but no parseable value made the switch appear over
    // columns that were never built. The table predicates and the header's
    // `getSurveyRows` now ask through the one `hasSurveyRows` (slSurveyRows.js in
    // @tba3/modules; code review item 13, closed 2026-08-17).
    const KEY_WITHOUT_VALUE = [
        {
            id: 's1',
            subject: { id: 'de', name: 'Deutsch' },
            properties: [
                { key: 'tq_mean', value: null },
                { key: 'sp_mean', value: 'n/a' },
            ],
            covariates: [{ type: 'group', value: '8a' }],
        },
    ];

    function storeFor(studentsData) {
        const store = new DataStore();
        defineSlDatasets(store);
        store.setRawData(SL_DATA_KEYS.STUDENTS_COMPETENCE_LEVELS, studentsData);
        return store;
    }

    it('a key with no parseable value ships the scale but has no rows — and the columns follow the rows', () => {
        const store = storeFor(KEY_WITHOUT_VALUE);
        expect(getSurveyScales(store)).toEqual({ hasTeachingQuality: true, hasSelfEfficacy: true });
        expect(getSurveyRows(store)).toEqual({ hasTeachingQuality: false, hasSelfEfficacy: false });

        const module = moduleFor(KEY_WITHOUT_VALUE);
        expect(module._hasTeachingQualityData()).toBe(getSurveyRows(store).hasTeachingQuality);
        expect(module._hasSelfEfficacyData()).toBe(getSurveyRows(store).hasSelfEfficacy);
    });

    it('the fixture answers yes on both levels, the export no on both', () => {
        expect(getSurveyRows(storeFor(FIXTURE_STUDENTS))).toEqual({
            hasTeachingQuality: true,
            hasSelfEfficacy: true,
        });
        expect(getSurveyRows(storeFor(EXPORT_STUDENTS))).toEqual({
            hasTeachingQuality: false,
            hasSelfEfficacy: false,
        });
        expect(getSurveyScales(storeFor(EXPORT_STUDENTS))).toEqual({
            hasTeachingQuality: false,
            hasSelfEfficacy: false,
        });
    });
});
