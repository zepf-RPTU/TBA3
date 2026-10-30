import { describe, it, expect } from 'vitest';

import { DocumentShapeError, DocumentStore } from '../../../src/common/data/index.js';
import { dataset } from '../../../src/common/data/documentStore.js';
import { createDatasetRegistration } from '../../../src/common/services/datasetRegistration.js';
import { CompetenceLevelPalette } from '../../../src/common/context/index.js';
import {
    BOOKLET_PROPERTY,
    levelsValueGroup,
    studentFields,
} from '../../support/competenceLevelGroups.js';

/** @typedef {import('../../../src/common/data/index.js').DatasetRequest} DatasetRequest */
/** @typedef {{[file: string]: unknown}} Answers */

/** Distinct level names so no other suite's scale can satisfy the assertion. */
const SCALE_LEVELS = ['T1', 'T2', 'T3', 'T4', 'T5'];
/** A group's own value group of a competence-levels answer, trimmed to what scale registration reads. */
const GROUP_LEVELS = {
    id: 'group-8a',
    type: 'group',
    name: 'Lerngruppe 8a',
    properties: [BOOKLET_PROPERTY],
    competenceLevels: SCALE_LEVELS.map((nameShort) => ({
        nameShort,
        name: nameShort,
        descriptiveStatistics: { total: 0, mean: 0, frequency: 0 },
    })),
};
const STUDENT = {
    id: 's1',
    type: 'student',
    name: 'S1',
    ...studentFields('Lerngruppe 8a', 'S1'),
    competenceLevels: [],
};
const ITEMS_ANSWER = [
    {
        id: 'group-8a',
        type: 'group',
        name: 'Lerngruppe 8a',
        domain: { id: 'le', name: 'Lesen' },
        items: [],
    },
    {
        id: 'school-avg',
        type: 'school',
        name: 'Schulschnitt',
        domain: { id: 'le', name: 'Lesen' },
        items: [],
    },
];
const INFO_BOXES = {
    meta: { locale: 'de', materialLinkLabel: 'Material', quotedLabel: 'Zitat' },
    sectionTypes: {},
    boxes: {},
};

/** @type {DatasetRequest} */
const LEVELS_REQUEST = {
    file: 'competence-levels.json',
    template: 'irrelevant',
    documents: ['competence-levels.json', 'students-competence-levels.json'],
};
/** @type {DatasetRequest} */
const ITEMS_REQUEST = {
    file: 'items.json',
    template: 'irrelevant',
    documents: ['items.json'],
};
/** @type {DatasetRequest} */
const BOXES_REQUEST = {
    file: 'info-boxes.json',
    site: 'data/sl/',
    documents: ['info-boxes.json'],
};

/** @type {Answers} */
const ANSWERS = {
    'competence-levels.json': [GROUP_LEVELS, STUDENT],
    'items.json': ITEMS_ANSWER,
    'info-boxes.json': INFO_BOXES,
};

/**
 * A loader that answers each request from `answers`, by its file, and records the calls.
 * @param {Answers} [answers]
 */
function createStubLoader(answers = ANSWERS) {
    /** @type {string[]} */
    const calls = [];
    const load = (/** @type {DatasetRequest} */ request) => {
        calls.push(request.file);
        return request.file in answers
            ? Promise.resolve(answers[request.file])
            : Promise.reject(new Error(`missing fixture '${request.file}'`));
    };
    return { load, calls };
}

/**
 * A store over the three requests, answered from `answers`.
 * @param {Answers} [answers]
 */
function createStore(answers) {
    const loader = createStubLoader(answers);
    const palette = new CompetenceLevelPalette();
    const store = new DocumentStore({
        requests: [LEVELS_REQUEST, ITEMS_REQUEST, BOXES_REQUEST],
        loadRequest: loader.load,
        onLand: createDatasetRegistration({
            palette,
            glossary: /** @type {any} */ ({ registerPayloadEntries() {} }),
        }),
    });
    return { store, calls: loader.calls, palette };
}

const ids = (/** @type {{id: string}[]} */ valueGroups) =>
    valueGroups.map((valueGroup) => valueGroup.id);

describe('DocumentStore documents', () => {
    it('sends each request once across overlapping ensures', async () => {
        // N cards on one page read the same documents; each request must cross the
        // network once, not once per card.
        const { store, calls } = createStore();

        await store.ensure(['competence-levels.json']);
        await store.ensure(['students-competence-levels.json', 'items.json']);
        await store.ensure(['competence-levels.json', 'items.json']);

        expect(calls).toEqual(['competence-levels.json', 'items.json']);
    });

    it('shares one pending request between concurrent ensures', async () => {
        // Cards hydrate in parallel; two asking before the first answer arrives
        // must still cause one request.
        const { store, calls } = createStore();

        await Promise.all([
            store.ensure(['competence-levels.json']),
            store.ensure(['students-competence-levels.json']),
        ]);

        expect(calls).toEqual(['competence-levels.json']);
    });

    it('sends nothing for a document it was never asked for', async () => {
        // A standalone card fetches its own share of the dataset, not all of it.
        const { store, calls } = createStore();

        await store.ensure(['items.json']);

        expect(calls).toEqual(['items.json']);
        expect(() => store.get('competence-levels.json')).toThrow(/never ensured/);
    });

    it('rejects a document name no request declares', async () => {
        const { store } = createStore();

        const undeclared =
            /** @type {import('../../../src/common/data/documentStore.js').DocumentList} */ (
                /** @type {unknown} */ (['history.json'])
            );
        await expect(store.ensure(undeclared)).rejects.toThrow(
            "no request declares the document 'history.json'",
        );
    });

    it('splits a bundled answer into its documents by value-group bucket', async () => {
        // One request carries the group and the student value groups; a student value group left
        // in the group document would be read as a comparison population.
        const { store } = createStore();

        await store.ensureAll();

        expect(ids(store.get('competence-levels.json'))).toEqual(['group-8a']);
        expect(ids(store.get('students-competence-levels.json'))).toEqual(['s1']);
    });

    it('declares an empty document when the answer has no value group of its bucket', async () => {
        // A group without students is a valid answer; readers get [].
        const { store } = createStore({ ...ANSWERS, 'competence-levels.json': [GROUP_LEVELS] });

        await store.ensure(['students-competence-levels.json']);

        expect(store.get('students-competence-levels.json')).toEqual([]);
    });

    it('rejects an answer carrying a value group none of its documents takes', async () => {
        // Dropping it would lose data silently, and filing it under `own` would
        // make every reader of that document treat it as a comparison population.
        const { store } = createStore({ ...ANSWERS, 'items.json': [...ITEMS_ANSWER, STUDENT] });

        await expect(store.ensure(['items.json'])).rejects.toThrow(
            "The answer to 'items.json' carries a students value group (type 'student') none of its documents takes",
        );
    });

    it('files an earlier year under its own document, whatever its type', async () => {
        // A `comparison=year` answer stamps every value group with its `testPeriod` and answers
        // the current year first; a value group stamped otherwise is an earlier year. Filed by
        // type it would join the current year's documents. A value group without a
        // `testPeriod` counts as current.
        const priorSchool = levelsValueGroup({
            id: 'schule',
            type: 'school',
            properties: [{ key: 'testPeriod', value: '2025' }],
        });
        const currentSchool = levelsValueGroup({
            id: 'schule',
            type: 'school',
            properties: [{ key: 'testPeriod', value: '2026' }],
        });
        /** @type {DatasetRequest} */
        const request = {
            ...LEVELS_REQUEST,
            documents: [...LEVELS_REQUEST.documents, 'prior-years.json'],
        };
        const store = new DocumentStore({
            requests: [request],
            loadRequest: () => Promise.resolve([currentSchool, GROUP_LEVELS, STUDENT, priorSchool]),
        });

        await store.ensureAll();

        expect(store.get('competence-levels.json')).toEqual([currentSchool, GROUP_LEVELS]);
        expect(store.get('prior-years.json')).toEqual([priorSchool]);
    });

    it('takes the current year from the first value group, not from the latest stamp', async () => {
        // The answer's order names the current year; how the stamps sort does not. A later
        // stamp behind the first block (a mistyped year, a `YYYY-MM` beside a `YYYY`) is
        // still an earlier year's value group.
        const current = levelsValueGroup({
            id: 'schule',
            type: 'school',
            properties: [{ key: 'testPeriod', value: '2025' }],
        });
        const other = levelsValueGroup({
            id: 'schule',
            type: 'school',
            properties: [{ key: 'testPeriod', value: '2026' }],
        });
        const store = new DocumentStore({
            requests: [
                { ...LEVELS_REQUEST, documents: [...LEVELS_REQUEST.documents, 'prior-years.json'] },
            ],
            loadRequest: () => Promise.resolve([current, other]),
        });

        await store.ensureAll();

        expect(store.get('competence-levels.json')).toEqual([current]);
        expect(store.get('prior-years.json')).toEqual([other]);
    });

    it('files an earlier year by type in a request that asks for no years', async () => {
        // Only a `comparison=year` request declares an earlier-years document; an
        // older value group in any other answer (a Landesschnitt from the previous cycle) is
        // still that population, not a reason to fail the whole load.
        const priorState = levelsValueGroup({
            id: 'land',
            type: 'state-average',
            properties: [{ key: 'testPeriod', value: '2025' }],
        });
        const currentClass = {
            ...GROUP_LEVELS,
            properties: [{ key: 'testPeriod', value: '2026' }, BOOKLET_PROPERTY],
        };
        const store = new DocumentStore({
            requests: [LEVELS_REQUEST],
            loadRequest: () => Promise.resolve([currentClass, priorState]),
        });

        await store.ensureAll();

        expect(store.get('competence-levels.json')).toEqual([currentClass, priorState]);
    });

    it('takes a whole-document answer as it is', async () => {
        // Info-boxes.json is an object of templates, not an array of value groups.
        const { store } = createStore();

        await store.ensure(['info-boxes.json']);

        expect(store.get('info-boxes.json')).toEqual(INFO_BOXES);
    });

    it('sends a failed request again on the next ensure', async () => {
        // The error must reach bootstrapDashboardApp's inline error untouched, and a
        // card mounted on its own after a dropped connection must be able to load;
        // a kept rejection would fail every later card that reads the same request.
        const answers = { ...ANSWERS };
        delete answers['items.json'];
        const { store, calls } = createStore(answers);

        await expect(store.ensure(['items.json'])).rejects.toThrow("missing fixture 'items.json'");
        answers['items.json'] = ITEMS_ANSWER;
        await store.ensure(['items.json']);

        expect(calls).toEqual(['items.json', 'items.json']);
        expect(ids(store.get('items.json'))).toEqual(['group-8a', 'school-avg']);
    });

    it('registers the scale document with the palette when it lands', async () => {
        // Scale registration decides every competence-level colour, and must have happened
        // before any card renders a level.
        const { store, palette } = createStore();

        await store.ensure(['competence-levels.json']);

        expect(palette.getScaleLevelNames('T1')).toEqual(SCALE_LEVELS);
    });

    it('refuses a document two requests declare', () => {
        expect(() => new DocumentStore({ requests: [ITEMS_REQUEST, ITEMS_REQUEST] })).toThrow(
            "Document 'items.json' is declared by more than one request",
        );
    });
});

describe('DocumentStore validation', () => {
    const malformedLevels = () => {
        const levels = structuredClone(GROUP_LEVELS.competenceLevels);
        // Malformed on purpose: the schema requires a level's nameShort.
        /** @type {{nameShort: string|null}} */ (levels[2]).nameShort = null;
        return [{ ...GROUP_LEVELS, competenceLevels: levels }, STUDENT];
    };

    it('rejects a malformed answer naming the request, document, value group and field', async () => {
        // A malformed value group failing deep inside a chart names nothing; the reader of
        // the console needs to know which answer to take to the API's owners.
        const { store } = createStore({ ...ANSWERS, 'competence-levels.json': malformedLevels() });

        const error = await store.ensure(['competence-levels.json']).catch((e) => e);

        expect(error).toBeInstanceOf(DocumentShapeError);
        expect(error.message).toMatch(
            /^Document 'competence-levels\.json' \(answer to 'irrelevant'\) is malformed: value group 0 \(group 'group-8a'\) competenceLevels\.2\.nameShort: /,
        );
        // Exactly one issue: no second one listed, none summarised.
        expect(error.message).not.toMatch(/; |\(\+\d+ more\)/);
    });

    it('does not send a malformed request again: later ensures reject with the same error', async () => {
        // A retry cannot fix the data; every view switch would download and validate
        // the whole answer again and raise another failure toast.
        const { store, calls } = createStore({
            ...ANSWERS,
            'competence-levels.json': malformedLevels(),
        });

        const first = await store.ensure(['competence-levels.json']).catch((e) => e);
        const second = await store.ensure(['competence-levels.json']).catch((e) => e);

        expect(second).toBe(first);
        expect(calls).toEqual(['competence-levels.json']);
    });

    it('does not send a request again whose answer cannot be split', async () => {
        const { store, calls } = createStore({
            ...ANSWERS,
            'items.json': [...ITEMS_ANSWER, STUDENT],
        });

        const first = await store.ensure(['items.json']).catch((e) => e);
        const second = await store.ensure(['items.json']).catch((e) => e);

        expect(second).toBe(first);
        expect(calls).toEqual(['items.json']);
    });

    it('lands nothing of a request whose second document is malformed, and tells onLand nothing', async () => {
        // A half-landed request would serve the group's value groups with no students and
        // register a scale for data the dashboard then refuses to show.
        /** @type {string[][]} */
        const landed = [];
        const store = new DocumentStore({
            requests: [LEVELS_REQUEST],
            loadRequest: async () => [GROUP_LEVELS, { ...STUDENT, name: '' }],
            onLand: (documents) => landed.push(Object.keys(documents)),
        });

        await expect(store.ensureAll()).rejects.toThrow(/students-competence-levels\.json/);
        expect(() => store.get('competence-levels.json')).toThrow(/never ensured/);
        expect(landed).toEqual([]);
    });

    it('refuses a document name it has no shape for', async () => {
        const store = new DocumentStore({
            requests: [
                {
                    file: 'rows.json',
                    template: 'irrelevant',
                    documents: [/** @type {any} */ ('rows.json')],
                },
            ],
            loadRequest: async () => [],
        });

        await expect(store.ensureAll()).rejects.toThrow("'rows.json' is not a document TBA3 reads");
    });

    it('freezes what lands, and leaves the caller its own objects', async () => {
        // Every card gets the same object; one that wrote into it would change what
        // every other card shows.
        const answer = [GROUP_LEVELS];
        const { store } = createStore({ 'competence-levels.json': answer });
        await store.ensure(['competence-levels.json']);

        const [valueGroup] = store.get('competence-levels.json');
        expect(Object.isFrozen(valueGroup.competenceLevels[0].descriptiveStatistics)).toBe(true);
        expect(Object.isFrozen(answer)).toBe(false);
        expect(Object.isFrozen(GROUP_LEVELS)).toBe(false);
    });
});

describe('DocumentStore datasets', () => {
    it('ensuring a dataset key fetches the documents its definition reads', async () => {
        // Cards declare datasets, not the documents behind them; the catalog's
        // wiring must not be restated per card.
        const { store, calls } = createStore();
        const students = dataset('t.students', {
            inputs: ['students-competence-levels.json'],
            build: (/** @type {unknown[]} */ valueGroups) => valueGroups,
        });
        const count = dataset('t.count', {
            inputs: [students],
            build: (/** @type {unknown[]} */ valueGroups) => valueGroups.length,
        });

        await store.ensure([count]);

        expect(calls).toEqual(['competence-levels.json']);
        expect(store.getDataset(count)).toBe(1);
    });

    it('computes a dataset from its inputs, in declared order, with the context last', async () => {
        const context = { name: 'context' };
        const store = new DocumentStore({
            requests: [LEVELS_REQUEST],
            loadRequest: async () => [
                levelsValueGroup({
                    id: 'b1',
                    type: 'student',
                    ...studentFields('a1', 'B1'),
                }),
                levelsValueGroup({ id: 'a1', type: 'group' }),
                levelsValueGroup({ id: 'a2', type: 'group' }),
            ],
            datasetContext: context,
        });
        await store.ensureAll();
        const joined = dataset('t.joined', {
            inputs: ['competence-levels.json', 'students-competence-levels.json'],
            build: (
                /** @type {{id: string}[]} */ a,
                /** @type {{id: string}[]} */ b,
                /** @type {unknown} */ handed,
            ) => ({ ids: ids([...a, ...b]), handed }),
        });

        expect(store.getDataset(joined)).toEqual({ ids: ['a1', 'a2', 'b1'], handed: context });
    });

    it('builds once per store and serves the cache afterwards', async () => {
        let builds = 0;
        const derived = dataset('t.derived', {
            inputs: ['items.json'],
            build: () => {
                builds += 1;
                return {};
            },
        });
        const itemsStore = async () => {
            const { store } = createStore({ 'items.json': [] });
            await store.ensure(['items.json']);
            return store;
        };
        const store = await itemsStore();

        const first = store.getDataset(derived);

        expect(store.getDataset(derived)).toBe(first);
        expect(builds).toBe(1);
        (await itemsStore()).getDataset(derived);
        expect(builds).toBe(2);
    });

    it('builds a parameterised dataset once per distinct key, the arguments after the context', async () => {
        // A selection reads like a dataset; `null` and `undefined` select different things.
        const context = { name: 'context' };
        const store = new DocumentStore({
            requests: [LEVELS_REQUEST],
            loadRequest: async () => [levelsValueGroup({ id: 'a1', type: 'group' })],
            datasetContext: context,
        });
        await store.ensureAll();
        /** @type {unknown[][]} */
        const builds = [];
        const selected = dataset('t.selected', {
            inputs: ['competence-levels.json'],
            params: (/** @type {string|null|undefined} */ id, /** @type {string[]} */ tags) => [
                id,
                [...tags].sort(),
            ],
            build: (
                /** @type {{id: string}[]} */ valueGroups,
                /** @type {unknown} */ handed,
                /** @type {string|null|undefined} */ id,
            ) => {
                builds.push([ids(valueGroups), handed, id]);
                return { id };
            },
        });

        const first = store.getDataset(selected, 'a', ['y', 'x']);

        expect(store.getDataset(selected, 'a', ['x', 'y'])).toBe(first);
        expect(builds).toEqual([[['a1'], context, 'a']]);
        store.getDataset(selected, null, []);
        store.getDataset(selected, undefined, []);
        store.getDataset(selected, /** @type {any} */ (Symbol('all')), []);
        expect(builds).toHaveLength(4);
    });

    it('hands a parameterised input to its reader as a memoised reader', async () => {
        const { store } = createStore({ 'items.json': [] });
        await store.ensure(['items.json']);
        let builds = 0;
        const doubled = dataset('t.doubled', {
            inputs: ['items.json'],
            params: (/** @type {number} */ n) => [n],
            build: (
                /** @type {unknown} */ _items,
                /** @type {unknown} */ _context,
                /** @type {number} */ n,
            ) => {
                builds += 1;
                return n * 2;
            },
        });
        const sum = dataset('t.sum', {
            inputs: [doubled],
            build: (/** @type {(n: number) => number} */ doubledOf) => doubledOf(1) + doubledOf(2),
        });

        expect(store.getDataset(sum)).toBe(6);
        expect(store.getDataset(doubled, 2)).toBe(4);
        expect(builds).toBe(2);
    });

    it('refuses arguments to a dataset without params', async () => {
        const { store } = createStore({ 'items.json': [] });
        await store.ensure(['items.json']);
        const items = dataset('t.items', { inputs: ['items.json'], build: () => [] });

        expect(() => store.getDataset(/** @type {any} */ (items), 'x')).toThrow(
            /'t\.items' takes no arguments/,
        );
    });

    it('throws when an input has not landed', () => {
        const { store } = createStore();
        const items = dataset('t.items', {
            inputs: ['items.json'],
            build: (/** @type {unknown} */ valueGroups) => valueGroups,
        });

        expect(() => store.getDataset(items)).toThrow(/'items\.json' was never ensured/);
    });
});
