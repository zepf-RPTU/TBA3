// @vitest-browser
import { describe, it, expect } from 'vitest';
import { CompetenceLevelPalette } from '../../../src/common/services/competenceLevelPalette.js';
import { readItemLevelSpan } from '../../../src/common/services/competenceScalePayload.js';
import {
    KS_LEVELS,
    KS_SPLIT_LEVELS,
    handWrittenScaleValueGroup,
    itemValueGroups,
    scaleValueGroup,
} from '../../support/competenceScaleFixture.js';

/**
 * Reading scales out of the payload, through what registration leaves in the palette:
 * value groups in, each scale's entries and prose out.
 */

/** @typedef {import('../../../src/common/data/schemas/competenceLevels.js').CompetenceLevelsValueGroup} CompetenceLevelsValueGroup */
/** @typedef {import('../../../src/common/data/schemas/items.js').ItemsValueGroup} ItemsValueGroup */
/** @typedef {import('../../../src/common/services/competenceScalePayload.js').CompetenceLevelEntry} CompetenceLevelEntry */

/**
 * `items.json` value groups spelled out by hand, down to the item parameters the scale collector reads.
 * @param {Array<{items: Array<{parameters: object}>}>} valueGroups
 * @returns {ItemsValueGroup[]}
 */
function handWrittenItemsValueGroups(valueGroups) {
    // Trimmed to `items[].parameters`: no value-group identity or item names, which the collector never reads.
    return /** @type {ItemsValueGroup[]} */ (/** @type {unknown} */ (valueGroups));
}

/**
 * A value group for a ladder that names no standard.
 * @param {string[]} levelNames - The ladder, lowest first.
 * @param {Array<{key: string, value: string}>} [extraProperties]
 * @returns {CompetenceLevelsValueGroup}
 */
function valueGroup(levelNames, extraProperties = []) {
    return scaleValueGroup(
        levelNames.map((nameShort) => ({ nameShort, band: null })),
        extraProperties,
    );
}

/**
 * A fresh palette with the reporting scales of `valueGroups` registered.
 * @param {CompetenceLevelsValueGroup[]} valueGroups
 * @returns {CompetenceLevelPalette}
 */
function registered(valueGroups) {
    const palette = new CompetenceLevelPalette();
    palette.registerCompetenceLevelScales(valueGroups);
    return palette;
}

/**
 * The registered scales, each its entries in scale order.
 * @param {CompetenceLevelPalette} palette
 * @returns {Map<string, CompetenceLevelEntry[]>} scaleId → entries.
 */
function scalesOf(palette) {
    /** @type {Map<string, CompetenceLevelEntry[]>} */
    const scales = new Map();
    for (const entry of palette.getRegisteredLevels()) {
        scales.set(entry.scaleId, [...(scales.get(entry.scaleId) ?? []), entry]);
    }
    return scales;
}

/**
 * The entries of the one scale `valueGroups` register.
 * @param {CompetenceLevelsValueGroup[]} valueGroups
 * @returns {CompetenceLevelEntry[]}
 */
function entriesOf(valueGroups) {
    const scales = [...scalesOf(registered(valueGroups)).values()];
    expect(scales).toHaveLength(1);
    return scales[0];
}

/**
 * A fresh palette with the item scale of `valueGroups` registered.
 * @param {ItemsValueGroup[]} valueGroups
 * @returns {CompetenceLevelPalette}
 */
function withItems(valueGroups) {
    const palette = new CompetenceLevelPalette();
    palette.registerItemCompetenceScales(valueGroups);
    return palette;
}

describe('folding truncated runs into one scale', () => {
    it('folds a truncated run into the ladder that contains it', () => {
        // A state export may report a domain's scale as only the part the domain
        // reached. Kept separate, `KS 3` would get a different band index in each and
        // the last one registered would repaint it for every domain on the page.
        const scales = scalesOf(
            registered([
                valueGroup(['KS 2', 'KS 3', 'KS 4', 'KS 5']),
                valueGroup(KS_LEVELS),
                valueGroup(['KS 1', 'KS 2', 'KS 3', 'KS 4', 'KS 5']),
            ]),
        );

        expect([...scales.keys()]).toEqual([KS_LEVELS.join('|')]);
        expect(scales.get(KS_LEVELS.join('|'))?.map((entry) => entry.name)).toEqual(KS_LEVELS);
    });

    it('keeps two ladders apart when neither is a run of the other', () => {
        const scales = scalesOf(registered([valueGroup(KS_LEVELS), valueGroup(KS_SPLIT_LEVELS)]));

        expect([...scales.values()].map((entries) => entries.length)).toEqual([7, 6]);
    });

    it('fills colour, band and span gaps from the folded value group without mutating the input', () => {
        // A truncated value group may be the only one that ships a level's colour,
        // standard or span; dropping it turns the metric it feeds into "unknown".
        const full = valueGroup(KS_LEVELS);
        const truncated = scaleValueGroup(
            [
                { nameShort: 'KS 3', band: 'medium', span: '5-6' },
                { nameShort: 'KS 4', band: null, span: '7-8' },
            ],
            [{ key: 'levelColor:1', value: '#2e74b5' }],
        );
        const snapshot = JSON.stringify([full, truncated]);

        const palette = registered([truncated, full]);

        expect(palette.getCompetenceLevelEntry('KS 3', KS_LEVELS.join('|'))).toMatchObject({
            dataColor: '#2e74b5',
            standardBand: 'medium',
            itemLevelSpan: { from: 5, to: 6 },
        });
        expect(JSON.stringify([full, truncated])).toBe(snapshot);
    });

    it('lets the container keep its own values where it has them', () => {
        // nw French TH-2 starts at `KS 2`, so its own `KS 2` covers slots 1-4; the full
        // ladder's `3-4` must win.
        const container = scaleValueGroup([
            { nameShort: 'KS 1', band: 'low', span: '1-2' },
            { nameShort: 'KS 2', band: null, span: '3-4' },
        ]);
        const run = scaleValueGroup([{ nameShort: 'KS 2', band: 'medium', span: '1-4' }]);

        expect(entriesOf([container, run])[1]).toMatchObject({
            itemLevelSpan: { from: 3, to: 4 },
            // An untagged level is a gap, filled like a missing colour.
            standardBand: 'medium',
        });
    });

    it("attaches the value group's colour by level id, not by position", () => {
        const entries = entriesOf([
            valueGroup(['A1', 'A2', 'B1'], [{ key: 'levelColor:3', value: '#1f4e78' }]),
        ]);

        expect(entries.map((entry) => entry.dataColor)).toEqual([null, null, '#1f4e78']);
    });

    it('collects every distinct scale description and lets the container prose win', () => {
        // Two Fächer may share one ladder but describe it differently; a truncated
        // run's prose lists only the bands that domain reached.
        const text = (/** @type {string} */ value) => [
            { key: 'competenceScaleDescription', value },
        ];
        const palette = registered([
            valueGroup(['KS 2', 'KS 3', 'KS 4', 'KS 5'], text('nur ein Teil')),
            valueGroup(KS_LEVELS, text('Deutsch')),
            valueGroup(KS_LEVELS, text('Englisch')),
            valueGroup(KS_LEVELS, text('Deutsch')),
        ]);

        expect(palette.getScaleDescriptions()).toEqual(['Deutsch', 'Englisch']);
    });

    it('takes the absorbed run prose only when the container described itself not at all', () => {
        const palette = registered([
            valueGroup(KS_LEVELS),
            valueGroup(
                ['KS 2', 'KS 3'],
                [{ key: 'competenceScaleDescription', value: 'nur ein Teil' }],
            ),
        ]);

        expect(palette.getScaleDescriptions()).toEqual(['nur ein Teil']);
    });

    it('cleans scale prose down to the payload markup', () => {
        const palette = registered([
            valueGroup(KS_LEVELS, [
                {
                    key: 'competenceScaleDescription',
                    value: '<p>Stufen</p><ul><li onclick="x()">KS 1</li></ul><script>alert(1)</script>',
                },
            ]),
        ]);

        expect(palette.getScaleDescriptions()).toEqual(['<p>Stufen</p><ul><li>KS 1</li></ul>']);
    });

    it('resolves a value group to the ladder its run sits in, on whole levels only', () => {
        const ladder = registered([valueGroup(['k.h.N.', 'KS 1', 'KS 2', 'KS 3'])]);
        const run = (/** @type {string[]} */ names) => ({
            competenceLevels: names.map((nameShort) => ({ nameShort })),
        });

        expect(ladder.scaleIdOf(run(['KS 1', 'KS 2']))).toBe('k.h.N.|KS 1|KS 2|KS 3');
        expect(ladder.scaleIdOf(run(['KS 1', 'KS 3']))).toBeUndefined();
        expect(registered([valueGroup(['KS 1', 'KS 2'])]).scaleIdOf(run(['S 1']))).toBeUndefined();
        expect(registered([valueGroup(['I', 'II'])]).scaleIdOf(run(['I', 'II']))).toBe('I|II');
    });
});

describe('the item scale', () => {
    it('orders the ladder by id, numbers its slots and ships no band or span of its own', () => {
        const valueGroups = itemValueGroups(['II', 'Ia']);
        valueGroups[0].items.reverse();

        const palette = withItems(valueGroups);

        expect(palette.getItemLevel('II')?.entry).toMatchObject({
            scaleId: 'item:II|Ia',
            itemSlot: 1,
            levelIndex: 0,
        });
        expect(palette.getItemLevel('Ia')?.entry).toMatchObject({ itemSlot: 2, levelIndex: 1 });
        expect(
            ['II', 'Ia'].some((level) => {
                const entry = palette.getItemLevel(level)?.entry;
                return entry?.standardBand || entry?.itemLevelSpan;
            }),
        ).toBe(false);
    });

    it('takes each level once, from the first item that carries it', () => {
        const valueGroups = itemValueGroups(['Ia', 'II']);
        valueGroups[0].items.push({ ...valueGroups[0].items[0], iqbId: 'item-3' });

        expect(withItems(valueGroups).getRegisteredLevels()).toHaveLength(2);
    });

    it('registers nothing for a document without items', () => {
        expect(withItems([]).getRegisteredLevels()).toEqual([]);
    });

    it('refuses a ladder whose ids are non-numeric or shared', () => {
        // `id` is the scale position. Two subjects' ladders in one document reuse
        // ids, and would otherwise interleave into one ladder that still paints.
        const withId = (/** @type {string} */ id) =>
            handWrittenItemsValueGroups([
                {
                    items: [
                        { parameters: { competenceLevel: { id, nameShort: 'Ia' } } },
                        { parameters: { competenceLevel: { id: '2', nameShort: 'II' } } },
                    ],
                },
            ]);

        expect(withItems(withId('erste')).getItemLevel('Ia')).toBeNull();
        expect(withItems(withId('2')).getItemLevel('Ia')).toBeNull();
        expect(withItems(withId('1')).getItemLevel('Ia')).not.toBeNull();
    });
});

describe('the entries a scale registers', () => {
    const SPLIT = ['Ia', 'Ib', 'II', 'III'];

    it('numbers every level from the level sequence, whatever its name', () => {
        expect(
            entriesOf([valueGroup(SPLIT)]).map(({ name, levelIndex, levelCount }) => [
                name,
                levelIndex,
                levelCount,
            ]),
        ).toEqual([
            ['Ia', 0, 4],
            ['Ib', 1, 4],
            ['II', 2, 4],
            ['III', 3, 4],
        ]);
    });

    it('stamps the lowest level tagged medium on every entry, or null', () => {
        const tagged = entriesOf([
            scaleValueGroup(
                SPLIT.map((nameShort, index) => ({
                    nameShort,
                    band: index >= 2 ? 'medium' : null,
                })),
            ),
        ]);
        expect(tagged.map((entry) => entry.mediumIndex)).toEqual([2, 2, 2, 2]);

        expect(entriesOf([valueGroup(SPLIT)]).every((entry) => entry.mediumIndex === null)).toBe(
            true,
        );
    });

    it('keys every entry by normalized name, scoped to the scale', () => {
        const palette = registered([valueGroup(['KS 1', 'KS 2'])]);

        expect(palette.getCompetenceLevelEntry('ks 1', 'KS 1|KS 2')).toMatchObject({
            key: 'ks 1',
            name: 'KS 1',
            scaleId: 'KS 1|KS 2',
        });
        expect(palette.getCompetenceLevelEntry('KS 1', 'KS 1|KS 3')).toBeNull();
    });

    it('takes the colour from the value group property alone', () => {
        // `levelColor:<id>` is the only carrier; a hex in `description` is prose.
        const [fromValueGroup, hexDescription, none] = entriesOf([
            scaleValueGroup(
                [
                    { nameShort: 'a', band: null, description: '#ffffff' },
                    { nameShort: 'b', band: null, description: '#9cc2e5' },
                    { nameShort: 'c', band: null },
                ],
                [{ key: 'levelColor:1', value: '#2e74b5' }],
            ),
        ]);

        expect(fromValueGroup.dataColor).toBe('#2e74b5');
        expect(hexDescription.dataColor).toBeNull();
        expect(none.dataColor).toBeNull();
    });

    it('keeps the description as prose and a malformed value group colour as none', () => {
        const [entry] = entriesOf([
            scaleValueGroup(
                [{ nameShort: 'a', band: null, description: '  Kann Aussagen begründen  ' }],
                [{ key: 'levelColor:1', value: 'blau' }],
            ),
        ]);

        expect(entry).toMatchObject({
            dataColor: null,
            descriptionText: 'Kann Aussagen begründen',
        });
    });

    it('keeps every shipped fixture description whole', () => {
        // The sanitizer drops any tag outside its list and every attribute; a fixture
        // that used one would lose its markup in every popup.
        const documents = /** @type {Record<string, CompetenceLevelsValueGroup[]>} */ (
            import.meta.glob('/public/data/**/competence-levels.json', {
                eager: true,
                import: 'default',
            })
        );
        const levels = Object.values(documents).flatMap((valueGroups) =>
            valueGroups.flatMap(({ competenceLevels }) => competenceLevels ?? []),
        );
        expect(levels.length).toBeGreaterThan(0);

        // Compared with the browser's own parse, not the raw string: the payload nests `<ul>`
        // in `<p>`, which the parser closes either way, sanitized or not.
        const parsed = document.createElement('template');
        for (const level of levels) {
            if (typeof level.description !== 'string' || !level.nameShort) continue;
            parsed.innerHTML = level.description.trim();
            const [entry] = entriesOf([handWrittenScaleValueGroup({ competenceLevels: [level] })]);
            expect(entry.descriptionText, level.nameShort).toBe(parsed.innerHTML || null);
        }
    });

    it('strips scripts, handlers, data attributes and unknown tags from the description and keeps the payload markup', () => {
        // The description reaches glossary popups as HTML, and this is the one place
        // it is cleaned.
        const [hostile, shipped] = entriesOf([
            scaleValueGroup([
                {
                    nameShort: 'a',
                    band: null,
                    description:
                        '<p><b data-css-vars="--competence-level-band-color:red" data-glossary-key="k">x</b><img src=x onerror=alert(1)><script>alert(1)</script><a href="javascript:y">y</a></p>',
                },
                {
                    nameShort: 'b',
                    band: null,
                    description: '<p>Die SuS <b>können</b>:</p><ul><li>eins<br>zwei</li></ul>',
                },
            ]),
        ]);

        expect(hostile.descriptionText).toBe('<p><b>x</b>y</p>');
        expect(shipped.descriptionText).toBe(
            '<p>Die SuS <b>können</b>:</p><ul><li>eins<br>zwei</li></ul>',
        );
    });

    it('passes the shipped band and span through, never guessing either', () => {
        const entries = entriesOf([
            scaleValueGroup([
                { nameShort: 'a', band: null },
                { nameShort: 'b', band: 'medium', span: '3-4' },
                { nameShort: 'c', band: null },
            ]),
        ]);

        expect(
            entries.map(({ itemSlot, standardBand, itemLevelSpan }) => [
                itemSlot,
                standardBand,
                itemLevelSpan,
            ]),
        ).toEqual([
            [null, null, null],
            [null, 'medium', { from: 3, to: 4 }],
            [null, null, null],
        ]);
    });
});

describe('readItemLevelSpan', () => {
    /**
     * A student value group reporting one level, with its own booklet's span.
     * @param {string} span - The `itemLevelSpan:3` value.
     * @returns {CompetenceLevelsValueGroup}
     */
    const student = (span) =>
        handWrittenScaleValueGroup({
            properties: [{ key: 'itemLevelSpan:3', value: span }],
            competenceLevels: [{ id: '3', nameShort: 'KS 1b' }],
        });

    it("reads the span of the value group's own level", () => {
        const own = student('2');
        expect(readItemLevelSpan(own, own.competenceLevels[0])).toEqual({
            from: 2,
            to: 2,
        });
        expect(readItemLevelSpan(student(' 5-6 '), { id: '3' })).toEqual({ from: 5, to: 6 });
    });

    it('reads a malformed span, or none at all, as no span', () => {
        for (const raw of ['', '0', '5-2', '3-', '1-x', 'B1', '-3']) {
            expect(readItemLevelSpan(student(raw), { id: '3' })).toBeNull();
        }
        expect(readItemLevelSpan(student('2'), { id: '1' })).toBeNull();
        expect(readItemLevelSpan(student('2'), null)).toBeNull();
        expect(readItemLevelSpan(null, { id: '3' })).toBeNull();
    });
});
