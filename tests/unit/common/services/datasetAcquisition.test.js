import { describe, it, expect, beforeEach } from 'vitest';

import { acquireFromLoader } from '../../../../src/common/services/datasetAcquisition.js';
import { DataStore } from '../../../../src/common/services/dataStore.js';
import {
    getScaleLevelNames,
    resetCompetenceLevelPalette,
} from '@tba3/modules/common/services/competenceLevelPalette.js';

/**
 * A competence-levels.json payload trimmed to what scale registration reads.
 * Distinct level names so no other suite's scale can satisfy the assertion.
 */
const SCALE_LEVELS = ['T1', 'T2', 'T3', 'T4', 'T5'];
const COMPETENCE_LEVELS_DOC = [
    {
        competenceLevels: SCALE_LEVELS.map((nameShort) => ({
            nameShort,
            name: nameShort,
            description: null,
        })),
    },
];

/**
 * An items.json document exercising every branch of the value-group split:
 * the class (`group`), the two named comparison types (with the multi-state case
 * nw ships), an unknown comparison type, and a group missing `type` entirely.
 */
const ITEMS_DOC = [
    { id: 'klasse-8a', type: 'group', name: 'Klasse 8a' },
    { id: 'school-avg', type: 'school', name: 'Schulschnitt' },
    { id: 'nw-gy', type: 'state', name: 'Landesschnitt GY' },
    { id: 'nw-hsa', type: 'state', name: 'Landesschnitt HSA' },
    { id: 'bund', type: 'federal', name: 'Bundesschnitt' },
    { id: 'typeless', name: 'Ohne Typ' },
];

const STUDENTS_DOC = [{ id: 's1', type: 'student' }];

const FIXTURES = {
    'competence-levels.json': COMPETENCE_LEVELS_DOC,
    'items.json': ITEMS_DOC,
    'students_competence-levels.json': STUDENTS_DOC,
};

/** EN/MA shape: whole-document writes plus an items split. */
const SPLIT_SPEC = {
    endpoints: {},
    folderBase: 'irrelevant/',
    scaleDocument: 'competence-levels.json',
    storeKeys: {
        'competence-levels.json': 'test.competenceLevelsClass',
        'students_competence-levels.json': 'test.students',
    },
    itemsSplit: { document: 'items.json', classKey: 'test.items' },
};

/** SL shape: no split, the items document stored whole. */
const NO_SPLIT_SPEC = {
    endpoints: {},
    folderBase: 'irrelevant/',
    scaleDocument: 'competence-levels.json',
    storeKeys: {
        'competence-levels.json': 'test.competenceLevels',
        'items.json': 'test.items',
    },
};

function createStubLoader(fixtures = FIXTURES) {
    const calls = [];
    const load = (name) => {
        calls.push(name);
        return name in fixtures
            ? Promise.resolve(fixtures[name])
            : Promise.reject(new Error(`missing fixture '${name}'`));
    };
    return { load, calls };
}

const ids = (groups) => groups.map((g) => g.id);

beforeEach(() => {
    resetCompetenceLevelPalette();
});

describe('acquireFromLoader', () => {
    it('fetches every stored document plus the split source exactly once, deduped', async () => {
        // WHY: the fan-out is the whole acquisition; a document requested twice is a
        // doubled network round trip, and a missed one is an undefined store key.
        // SL will declare items.json as a whole-document write, and a spec that also
        // split it must not fetch it twice.
        const spec = {
            ...NO_SPLIT_SPEC,
            itemsSplit: { document: 'items.json', classKey: 'test.itemsClass' },
        };
        const { load, calls } = createStubLoader();

        const { documents } = await acquireFromLoader(load, spec, new DataStore());

        expect([...calls].sort()).toEqual(['competence-levels.json', 'items.json']);
        expect(documents['competence-levels.json']).toBe(COMPETENCE_LEVELS_DOC);
        expect(documents['items.json']).toBe(ITEMS_DOC);
    });

    it('stores each document under its declared key and only the class bucket of the split', async () => {
        // WHY: this pins the deletion of the dead itemsSchool/itemsState keys — the
        // comparison buckets are returned for app-local derivation, never stored.
        const { load } = createStubLoader();
        const dataStore = new DataStore();

        await acquireFromLoader(load, SPLIT_SPEC, dataStore);

        expect(dataStore.getRawData('test.competenceLevelsClass')).toBe(COMPETENCE_LEVELS_DOC);
        expect(dataStore.getRawData('test.students')).toBe(STUDENTS_DOC);
        expect(ids(dataStore.getRawData('test.items'))).toEqual(['klasse-8a']);
        expect(dataStore.getRawData('test.itemsSchool')).toBeUndefined();
        expect(dataStore.getRawData('test.itemsState')).toBeUndefined();
    });

    it('splits value groups by type, keeping every state group and never throwing on unknown or missing types', async () => {
        // WHY: the class side is the only enumerated one ('group'); an unknown
        // comparison population must land in otherItems, not be merged into the
        // class and silently shift its percentages. nw ships several state groups
        // (per-track Landesschnitte) — all must survive. A group without a type is
        // a comparison group here; the loud failure for that malformed payload
        // belongs downstream in resolveAverageRole, where it is consumed.
        const { load } = createStubLoader();

        const { items } = await acquireFromLoader(load, SPLIT_SPEC, new DataStore());

        expect(ids(items.classItems)).toEqual(['klasse-8a']);
        expect(ids(items.schoolItems)).toEqual(['school-avg']);
        expect(ids(items.stateItems)).toEqual(['nw-gy', 'nw-hsa']);
        expect(ids(items.otherItems)).toEqual(['bund', 'typeless']);
        expect(ids(items.comparisonItems)).toEqual([
            'school-avg',
            'nw-gy',
            'nw-hsa',
            'bund',
            'typeless',
        ]);
    });

    it('registers the scale document with the palette', async () => {
        // WHY: scale registration decides the band count and every KS color, and
        // must have happened by the time the app calls up into
        // super.initializeComponents() — so it is acquisition's job, not the app's.
        const { load } = createStubLoader();

        await acquireFromLoader(load, SPLIT_SPEC, new DataStore());

        expect(getScaleLevelNames('T1')).toEqual(SCALE_LEVELS);
    });

    it('rejects with a clear message when the scale document was not acquired', async () => {
        // WHY: a spec typo would otherwise register `undefined` and every KS color
        // downstream would degrade with no pointer back to the actual mistake.
        const spec = { ...SPLIT_SPEC, scaleDocument: 'aggregation.json' };
        const { load } = createStubLoader();

        await expect(acquireFromLoader(load, spec, new DataStore())).rejects.toThrow(
            "Scale document 'aggregation.json' is not among the acquired documents",
        );
    });

    it('rejects as a whole when one document fails, writing nothing', async () => {
        // WHY: errors must reach bootstrapDashboardApp's inline error untouched,
        // and a half-populated store would let views render from a partial dataset.
        const fixtures = { ...FIXTURES };
        delete fixtures['students_competence-levels.json'];
        const { load } = createStubLoader(fixtures);
        const dataStore = new DataStore();

        await expect(acquireFromLoader(load, SPLIT_SPEC, dataStore)).rejects.toThrow(
            "missing fixture 'students_competence-levels.json'",
        );

        expect(dataStore.getRawData('test.competenceLevelsClass')).toBeUndefined();
        expect(dataStore.getRawData('test.students')).toBeUndefined();
        expect(dataStore.getRawData('test.items')).toBeUndefined();
    });

    it('stores the items document whole when the spec declares no split', async () => {
        // WHY: SL splits school/class/state rows at read time; acquisition must not
        // impose the EN/MA split on it.
        const { load } = createStubLoader();
        const dataStore = new DataStore();

        const { items } = await acquireFromLoader(load, NO_SPLIT_SPEC, dataStore);

        expect(items).toBeUndefined();
        expect(dataStore.getRawData('test.items')).toBe(ITEMS_DOC);
    });

    it('acquires exactly what it fetched', async () => {
        // WHY: acquisition no longer narrows anything. Documents reach the DataStore and
        // the scale registry as fetched, so the scale registered is the one the payload
        // actually carries.
        const { load } = createStubLoader();

        const { documents } = await acquireFromLoader(load, NO_SPLIT_SPEC, new DataStore());

        expect(documents['competence-levels.json']).toBe(COMPETENCE_LEVELS_DOC);
    });
});
