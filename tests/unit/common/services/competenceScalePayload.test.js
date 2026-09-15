import { describe, it, expect } from 'vitest';
import {
    buildScaleEntries,
    collectItemScaleLevels,
    collectMaximalScales,
    deriveBandKey,
    isContiguousRun,
    normalizeLevelKey,
    scopeLevelKey,
} from '@tba3/modules/common/services/competenceScalePayload.js';
import { itemPayloadRows, scalePayloadRow } from '../../support/competenceScaleFixture.js';

/**
 * The pure half of scale registration: rows in, scales and entries out. Everything here
 * used to be reachable only through the registry and its colour lookups.
 */

const NW_LEVELS = ['k.h.N.', 'KS 1', 'KS 2', 'KS 3', 'KS 4', 'KS 5'];

/**
 * A row for a ladder that names no standard.
 * @param {string[]} levelNames - The ladder, lowest first.
 * @param {Array<{key: string, value: string}>} [extraProperties] - Row properties to add.
 * @returns {{properties: Array<object>, competenceLevels: Array<object>}} The row.
 */
function row(levelNames, extraProperties = []) {
    return scalePayloadRow(
        levelNames.map((nameShort) => ({ nameShort, rank: null })),
        extraProperties,
    );
}

describe('collectMaximalScales', () => {
    it('folds a truncated run into the ladder that contains it', () => {
        // WHY: NRW reports a domain's scale as only the part the domain reached. Kept
        // separate, `KS 3` would get a different band index in each and the last one
        // registered would repaint it for every domain on the page.
        const scales = collectMaximalScales([
            row(['KS 2', 'KS 3', 'KS 4', 'KS 5']),
            row(NW_LEVELS),
            row(['KS 1', 'KS 2', 'KS 3', 'KS 4', 'KS 5']),
        ]);

        expect(scales.map((scale) => scale.scaleId)).toEqual([NW_LEVELS.join('|')]);
        expect(scales[0].levels.map((level) => level.nameShort)).toEqual(NW_LEVELS);
    });

    it('keeps two ladders apart when neither is a run of the other', () => {
        const scales = collectMaximalScales([
            row(NW_LEVELS),
            row(['k.h.N.', 'KS 1a', 'KS 1b', 'KS 2', 'KS 3', 'KS 4', 'KS 5']),
        ]);

        expect(scales.map((scale) => scale.levels.length)).toEqual([7, 6]);
    });

    it('fills colour and rank gaps from the folded row without mutating the input', () => {
        // WHY: a truncated row is often the only row that ships a level's colour or
        // standard; dropping it silently turns the metric it feeds into "unknown".
        const full = row(NW_LEVELS);
        const truncated = scalePayloadRow(
            [
                { nameShort: 'KS 3', rank: 3 },
                { nameShort: 'KS 4', rank: 4 },
            ],
            [{ key: 'levelColor:1', value: '#2e74b5' }],
        );
        const snapshot = JSON.stringify([full, truncated]);

        const [scale] = collectMaximalScales([truncated, full]);
        const ks3 = scale.levels.find((level) => level.nameShort === 'KS 3');

        expect(ks3).toMatchObject({
            shippedColor: '#2e74b5',
            shippedRank: 3,
        });
        expect(JSON.stringify([full, truncated])).toBe(snapshot);
    });

    it('lets the container keep its own values where it has them', () => {
        const container = scalePayloadRow([
            { nameShort: 'A1', rank: 2 },
            { nameShort: 'A2', rank: null },
        ]);
        const run = scalePayloadRow([{ nameShort: 'A1', rank: 3 }]);

        const [scale] = collectMaximalScales([container, run]);

        expect(scale.levels[0]).toMatchObject({ shippedRank: 2 });
    });

    it('attaches the row colour by level id, not by position', () => {
        const [scale] = collectMaximalScales([
            row(['A1', 'A2', 'B1'], [{ key: 'levelColor:3', value: '#1f4e78' }]),
        ]);

        expect(scale.levels.map((level) => level.shippedColor)).toEqual([null, null, '#1f4e78']);
    });

    it('collects every distinct scale description and lets the container prose win', () => {
        // WHY: NRW's Deutsch and Englisch share one ladder but describe it differently;
        // a truncated run's prose lists only the bands that domain reached.
        const text = (value) => [{ key: 'competenceScaleDescription', value }];
        const scales = collectMaximalScales([
            row(['KS 2', 'KS 3', 'KS 4', 'KS 5'], text('nur ein Teil')),
            row(NW_LEVELS, text('Deutsch')),
            row(NW_LEVELS, text('Englisch')),
            row(NW_LEVELS, text('Deutsch')),
        ]);

        expect([...scales[0].scaleDescriptions]).toEqual(['Deutsch', 'Englisch']);
    });

    it('takes the absorbed run prose only when the container described itself not at all', () => {
        const scales = collectMaximalScales([
            row(NW_LEVELS),
            row(['KS 2', 'KS 3'], [{ key: 'competenceScaleDescription', value: 'nur ein Teil' }]),
        ]);

        expect([...scales[0].scaleDescriptions]).toEqual(['nur ein Teil']);
    });

    it('skips rows and levels without a nameShort', () => {
        expect(
            collectMaximalScales([
                { competenceLevels: [{ id: '1', nameShort: '' }] },
                null,
                { properties: null },
            ]),
        ).toEqual([]);
    });
});

describe('collectItemScaleLevels', () => {
    it('orders the ladder by id and keeps the rank, dropping colour and description', () => {
        // WHY: an item level's `description` is the state's own hex, but item marks are
        // painted from the reporting ramp so they match the student charts beside them.
        const rows = itemPayloadRows([
            { nameShort: 'II', color: '#c67f14' },
            { nameShort: 'Ia', color: '#d64550' },
        ]);
        rows[0].items.reverse();

        const scale = collectItemScaleLevels(rows);

        expect(scale?.scaleId).toBe('item:II|Ia');
        expect(scale?.levels).toEqual([
            expect.objectContaining({
                id: '1',
                nameShort: 'II',
                description: null,
                shippedColor: null,
                shippedRank: 2,
            }),
            expect.objectContaining({ id: '2', nameShort: 'Ia', shippedRank: 1 }),
        ]);
    });

    it('takes each level once, from the first item that carries it', () => {
        const rows = itemPayloadRows(['Ia', 'II']);
        rows[0].items.push({ ...rows[0].items[0], id: 'item-3' });

        expect(collectItemScaleLevels(rows)?.levels).toHaveLength(2);
    });

    it('returns null for a document without item levels', () => {
        expect(collectItemScaleLevels([])).toBeNull();
        expect(collectItemScaleLevels([{ items: [{ parameters: {} }] }])).toBeNull();
    });

    it('refuses a ladder whose ids are missing, non-numeric or shared', () => {
        // WHY: `id` is the scale position. Two subjects' ladders in one document reuse
        // ids, and would otherwise interleave into one ladder that still paints.
        const withId = (id) => [
            {
                items: [
                    { parameters: { competenceLevel: { id, nameShort: 'Ia' } } },
                    { parameters: { competenceLevel: { id: '2', nameShort: 'II' } } },
                ],
            },
        ];

        expect(collectItemScaleLevels(withId(null))).toBeNull();
        expect(collectItemScaleLevels(withId(''))).toBeNull();
        expect(collectItemScaleLevels(withId('erste'))).toBeNull();
        expect(collectItemScaleLevels(withId('2'))).toBeNull();
        expect(collectItemScaleLevels(withId('1'))).not.toBeNull();
    });
});

describe('buildScaleEntries', () => {
    const SPLIT = ['Ia', 'Ib', 'II', 'III'];
    const levelsOf = (names) => names.map((nameShort) => ({ nameShort }));

    it('numbers bands and sub-bands from the level sequence', () => {
        const entries = buildScaleEntries(SPLIT.join('|'), levelsOf(SPLIT));

        expect(
            entries.map(({ name, bandKey, bandIndex, bandCount, subBandIndex, subBandCount }) => [
                name,
                bandKey,
                bandIndex,
                bandCount,
                subBandIndex,
                subBandCount,
            ]),
        ).toEqual([
            ['Ia', 'I', 0, 3, 0, 2],
            ['Ib', 'I', 0, 3, 1, 2],
            ['II', 'II', 1, 3, 0, 1],
            ['III', 'III', 2, 3, 0, 1],
        ]);
    });

    it('keys every entry by normalized name, scoped to the scale', () => {
        const [entry] = buildScaleEntries('KS 1|KS 2', levelsOf(['KS 1', 'KS 2']));

        expect(entry).toMatchObject({
            key: 'ks 1',
            scopedKey: scopeLevelKey('KS 1|KS 2', 'ks 1'),
            name: 'KS 1',
            scaleId: 'KS 1|KS 2',
        });
    });

    it('takes the colour from the row property alone', () => {
        // WHY: `levelColor:<id>` is the only carrier. `description` is prose, whatever it
        // happens to look like — an item level's hex never reaches a scale, because
        // `collectItemScaleLevels` drops item colours.
        const [fromRow, hexDescription, none] = buildScaleEntries('a|b|c', [
            { nameShort: 'a', shippedColor: '#2e74b5', description: '#ffffff' },
            { nameShort: 'b', description: '#9cc2e5' },
            { nameShort: 'c', description: null },
        ]);

        expect(fromRow.dataColor).toBe('#2e74b5');
        expect(hexDescription.dataColor).toBeNull();
        expect(none.dataColor).toBeNull();
    });

    it('keeps the description as prose and a malformed row colour as none', () => {
        const [entry] = buildScaleEntries('a', [
            { nameShort: 'a', description: '  Kann Aussagen begründen  ', shippedColor: 'blau' },
        ]);

        expect(entry).toMatchObject({
            dataColor: null,
            descriptionText: 'Kann Aussagen begründen',
        });
    });

    it('takes the rank only from shippedRank and bounds unranked levels by their neighbours', () => {
        // WHY: `null` must stay "unknown", narrowed only by what the ladder around it says.
        const entries = buildScaleEntries('a|b|c|d', [
            { nameShort: 'a' },
            { nameShort: 'b', shippedRank: 2 },
            { nameShort: 'c' },
            { nameShort: 'd', shippedRank: 4 },
        ]);

        expect(
            entries.map(({ standardRank, rankLowerBound, rankUpperBound }) => [
                standardRank,
                rankLowerBound,
                rankUpperBound,
            ]),
        ).toEqual([
            [null, 1, 2],
            [2, 2, 2],
            [null, 2, 4],
            [4, 4, 4],
        ]);
    });

    it('leaves the full range on a ladder that ranks nothing', () => {
        const entries = buildScaleEntries('a|b', levelsOf(['a', 'b']));

        expect(entries.map((entry) => [entry.rankLowerBound, entry.rankUpperBound])).toEqual([
            [1, 5],
            [1, 5],
        ]);
    });
});

describe('deriveBandKey', () => {
    it('collapses the two known sub-band notations and nothing else', () => {
        expect(deriveBandKey('A1.1')).toBe('A1');
        expect(deriveBandKey('B2.2')).toBe('B2');
        expect(deriveBandKey('Ia')).toBe('I');
        expect(deriveBandKey(' IVb ')).toBe('IV');
        expect(deriveBandKey('KS 1a')).toBe('KS 1a');
        expect(deriveBandKey('MiStd--')).toBe('MiStd--');
        expect(deriveBandKey('k.h.N.')).toBe('k.h.N.');
    });
});

describe('isContiguousRun', () => {
    it('matches whole levels on their boundaries only', () => {
        expect(isContiguousRun('KS 1|KS 2', 'k.h.N.|KS 1|KS 2|KS 3')).toBe(true);
        expect(isContiguousRun('KS 1|KS 3', 'k.h.N.|KS 1|KS 2|KS 3')).toBe(false);
        expect(isContiguousRun('S 1', 'KS 1|KS 2')).toBe(false);
        expect(isContiguousRun('I|II', 'I|II')).toBe(true);
    });
});

describe('normalizeLevelKey', () => {
    it('strips the renderer prefix and lowercases', () => {
        expect(normalizeLevelKey('ks_B1')).toBe('b1');
        expect(normalizeLevelKey('KS-1')).toBe('1');
        expect(normalizeLevelKey(' KS 1 ')).toBe('ks 1');
        expect(normalizeLevelKey(3)).toBe('3');
    });
});
