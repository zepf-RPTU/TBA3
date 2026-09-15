// @vitest-browser
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
    getCompetencyBand,
    getItemScaleIds,
    getLevelNamesForStandardRank,
    hasAnyStandardRank,
    registerCompetenceLevelScales,
    registerItemCompetenceScales,
    resetCompetenceLevelPalette,
    resolveScaleId,
} from '@tba3/modules/common/services/competenceLevelPalette.js';
import {
    getBandColor,
    getBandColorsByLevel,
    hasDataColors,
} from '@tba3/modules/common/services/competenceLevelColors.js';
import {
    compareItemLevelToReportedLevel,
    getItemLevelOrdinal,
    parseItemLevel,
} from '@tba3/modules/common/domain/levels.js';
import { itemPayloadRows, scalePayloadRow } from '../../support/competenceScaleFixture.js';

/**
 * The Aufgabenniveau scale is registered from `items.json`, never recognised from the shape of
 * its labels. It shares the registry with the reporting
 * scale, which is the whole hazard: on several states the two vocabularies overlap, and the
 * reporting scale is what every chart on the page paints from.
 */

const THEMES = ['default', 'grayscale', 'colorblind', 'data'];

const SL_ITEMS = '/data/sl/sl/items.json';

/**
 * The checked-in fixtures, by site path. Fetched rather than imported: this file runs in
 * the browser, `public/` is served at the site root by the same dev server the browser
 * project uses, and importing out of `public/` makes Vite warn on every run.
 */
const FIXTURES = [
    ['8a_mid', '/data/en/8a_mid/competence-levels.json', '/data/en/8a_mid/items.json'],
    ['3a_mid', '/data/ma/3a_mid/competence-levels.json', '/data/ma/3a_mid/items.json'],
    ['sl', '/data/sl/sl/competence-levels.json', SL_ITEMS],
];

/** @type {Map<string, any>} site path → the parsed document, filled once in beforeAll. */
const documents = new Map();

beforeAll(async () => {
    const paths = [...new Set(FIXTURES.flatMap(([, scale, items]) => [scale, items]))];
    const loaded = await Promise.all(
        paths.map(async (path) => {
            const response = await fetch(path);
            // Loud: a renamed fixture would otherwise reach the assertions as `undefined`
            // and read like a registration regression.
            if (!response.ok) throw new Error(`fixture ${path}: HTTP ${response.status}`);
            return response.json();
        }),
    );
    paths.forEach((path, index) => documents.set(path, loaded[index]));
});

/** Every reporting level's band metadata and themed colour, as one comparable string. */
function reportingSnapshot(scaleRows) {
    const names = [
        ...new Set(
            scaleRows
                .flatMap((row) => (row.competenceLevels ?? []).map((level) => level.nameShort))
                .filter(Boolean),
        ),
    ];
    return names
        .map((name) => {
            const entry = getCompetencyBand(name);
            return (
                `${name} scale=${entry?.scaleId} band=${entry?.bandKey}` +
                ` idx=${entry?.bandIndex}/${entry?.bandCount} sub=${entry?.subBandIndex}/${entry?.subBandCount}` +
                ` rank=${entry?.standardRank} ${THEMES.map((t) => `${t}=${getBandColor(name, t)}`).join(' ')}`
            );
        })
        .join('\n');
}

beforeEach(() => resetCompetenceLevelPalette());

describe('registering the item scale leaves the reporting scale untouched', () => {
    // WHY: the failure mode is silent recolouring, not an error. Niedersachsen reports students on
    // `A1.1 … B1.2` and grades items `A1.1 … B2.2`, so the reporting scale is a *contiguous
    // prefix* of the item scale: fold them into one namespace and `collectMaximalScales`
    // re-bands every student level out of an eight-rung ladder, while the bare-name index
    // hands an item level's entry to every caller that asks for the student one. Both charts
    // still render, in the wrong colours.
    it('keeps a reporting scale that the item scale contains as a prefix (Niedersachsen-style)', () => {
        const reporting = [
            scalePayloadRow(
                ['A1.1', 'A1.2', 'A2.1', 'A2.2', 'B1.1', 'B1.2'].map((nameShort) => ({
                    nameShort,
                })),
            ),
        ];
        registerCompetenceLevelScales(reporting);
        const before = reportingSnapshot(reporting);

        registerItemCompetenceScales(
            itemPayloadRows(['A1.1', 'A1.2', 'A2.1', 'A2.2', 'B1.1', 'B1.2', 'B2.1', 'B2.2']),
        );

        expect(reportingSnapshot(reporting)).toBe(before);
    });

    it.each(FIXTURES)('leaves every %s level exactly where it was', (_id, scalePath, itemsPath) => {
        const scaleRows = documents.get(scalePath);
        registerCompetenceLevelScales(scaleRows);
        const before = reportingSnapshot(scaleRows);

        registerItemCompetenceScales(documents.get(itemsPath));

        expect(reportingSnapshot(scaleRows)).toBe(before);
    });

    // WHY: `hasDataColors()` gates whether the "Landesvorgabe" theme is offered at all. Item
    // levels carry the state's hex in `description`, so letting it through would offer that
    // theme for a dataset whose *reporting* scale ships no colours — a theme switch that
    // repaints nothing the user was looking at.
    it('does not let item colours offer a Landesvorgabe theme the reporting scale cannot fill', () => {
        registerCompetenceLevelScales([
            scalePayloadRow(['A1', 'A2', 'B1'].map((nameShort) => ({ nameShort }))),
        ]);
        expect(hasDataColors()).toBe(false);

        registerItemCompetenceScales(
            itemPayloadRows([
                { nameShort: 'A1.1', color: '#e6f2ff' },
                { nameShort: 'A1.2', color: '#cce6ff' },
            ]),
        );

        expect(hasDataColors()).toBe(false);
    });
});

describe('the item scale comes from the payload', () => {
    it('orders levels by the shipped id, not by the shape of the label', () => {
        // WHY: `localeCompare` sorts `II < III < IV < Ia < Ib < V`. The order is the
        // payload's to state, and `id` is where it states it.
        registerItemCompetenceScales(itemPayloadRows(['Ia', 'Ib', 'II', 'III', 'IV', 'V']));

        const shuffled = ['V', 'Ib', 'III', 'Ia', 'IV', 'II'];
        expect(
            [...shuffled].sort((a, b) => getItemLevelOrdinal(a) - getItemLevelOrdinal(b)),
        ).toEqual(['Ia', 'Ib', 'II', 'III', 'IV', 'V']);
    });

    it('resolves nothing at all until a payload registers the scale', () => {
        // WHY: this is the contract that replaced the regex. An unregistered vocabulary is
        // unknown, not guessed — a dataset that ships no items has no item scale, and every
        // helper must say so rather than fall back to a vocabulary the client remembers.
        expect(getItemScaleIds()).toEqual([]);
        expect(parseItemLevel('Ib')).toBeNull();
        expect(getItemLevelOrdinal('Ib')).toBe(Number.MAX_SAFE_INTEGER);

        registerItemCompetenceScales(itemPayloadRows(['Ia', 'Ib', 'II']));

        expect(parseItemLevel('Ib')).toEqual({ band: 'I', rank: 1, subIndex: 1 });
    });

    it('refuses a payload whose levels carry no id rather than inventing an order', () => {
        // WHY: the fixtures shipped `id: null` until 2026-08-31. Registering them in
        // first-appearance order would have looked right on the demo and been wrong on any
        // payload whose items happen to arrive in a different order.
        const rows = itemPayloadRows(['Ia', 'Ib', 'II']);
        for (const item of rows[0].items) item.parameters.competenceLevel.id = null;

        registerItemCompetenceScales(rows);

        expect(getItemScaleIds()).toEqual([]);
    });

    // -- The KMK rank --------------------------------------------------------
    // WHY: this is what relates an Aufgabenniveau to a reported Kompetenzstufe when the
    // two vocabularies share no labels -- `Ib` against `KS 1b`, `B1.1` against `KS 3`. The
    // client carried its own `{I:1..V:5, A1:1..C1:5}` table for it until 2026-08-31; the
    // server now states it as `standardRank:<level id>` on the items row.

    it('reads each item level rank off the row, folding a split band onto one rank', () => {
        registerItemCompetenceScales(itemPayloadRows(['Ia', 'Ib', 'II', 'III', 'IV', 'V']));

        // `Ia`/`Ib` are one KMK rank, exactly as on a reporting ladder that splits rank 1.
        expect(['Ia', 'Ib', 'II', 'III', 'IV', 'V'].map((l) => parseItemLevel(l)?.rank)).toEqual([
            1, 1, 2, 3, 4, 5,
        ]);
    });

    it('reports an unranked item level as null, never as rank 0 or "below"', () => {
        // WHY: the SL fixture's Deutsch/Mathematik items (`1a, 1b, 2 ... 5`) name no
        // standard and the payload ships them no rank. A caller that read null as a number
        // would place every one of them below every student.
        registerItemCompetenceScales(
            itemPayloadRows([
                { nameShort: '1a', rank: null },
                { nameShort: '1b', rank: null },
            ]),
        );

        expect(parseItemLevel('1a')?.rank).toBeNull();
        expect(compareItemLevelToReportedLevel('1a', 'KS 3')).toBeNull();
    });

    it('takes the rank the payload states, not one derived from the label', () => {
        // WHY: the whole point of retiring the table. A label the client has never seen
        // must resolve as long as the payload ranks it -- and a label it *has* seen must
        // still take the payload's answer.
        registerItemCompetenceScales(
            itemPayloadRows([
                { nameShort: 'Stufe-A', rank: 2 },
                { nameShort: 'Stufe-B', rank: 4 },
            ]),
        );

        expect(parseItemLevel('Stufe-A')?.rank).toBe(2);
        expect(parseItemLevel('Stufe-B')?.rank).toBe(4);
    });

    it('keeps two item ladders apart when they arrive as separate documents', () => {
        // One call registers one ladder, so two ladders means two calls. Nothing wires a
        // second items document today; this pins that the registry can hold two without
        // either answering for the other. The single-document case is the next test.
        registerItemCompetenceScales(itemPayloadRows(['Ia', 'Ib', 'II', 'III', 'IV', 'V']));
        registerItemCompetenceScales(itemPayloadRows(['A1.1', 'A1.2', 'A2.1']));

        expect(getItemScaleIds()).toHaveLength(2);
        expect(parseItemLevel('V')).toEqual({ band: 'V', rank: 5, subIndex: 0 });
        expect(parseItemLevel('A2.1')).toEqual({ band: 'A2', rank: 2, subIndex: 0 });
    });

    it('refuses a document holding two ladders rather than interleaving them', () => {
        // WHY: SL grades Deutsch/Mathematik on roman levels and Englisch/Französisch on CEFR
        // ones in ONE items.json, and both ladders number themselves from 1. Folding the
        // document into a single scale ordered by `id` produced
        // `item:1a|A1.1|A1|1b|A1.2|2|…` — a ladder that still resolves, still paints, and is
        // nonsense. Duplicate ids are that document's signature, so they are refused the way
        // missing ids are. Splitting such a document is unbuilt.
        const roman = itemPayloadRows(['1a', '1b', '2']);
        const cefr = itemPayloadRows(['A1.1', 'A1.2', 'A2.1']);

        registerItemCompetenceScales([...roman, ...cefr]);

        expect(getItemScaleIds()).toEqual([]);
        expect(parseItemLevel('A1.1')).toBeNull();
    });

    it('registers the checked-in SL items document as no scale at all', () => {
        // The live case of the test above: `data/sl/sl/items.json` is the one fixture that
        // carries two ladders. SL declares no `itemScaleDocument`, so nothing registers it
        // in production — this pins that adding one would fail loudly-empty rather than
        // silently wrong.
        registerItemCompetenceScales(documents.get(SL_ITEMS));

        expect(getItemScaleIds()).toEqual([]);
    });
});

describe("the item scale stays out of the reporting scale's answers", () => {
    // WHY: `bareNameIndex: false` only guards `getCompetencyBand`. Every other query that
    // reaches across scales and is keyed by name or rank sees `_levels` directly, and on
    // a scale whose reporting ladder is a contiguous prefix of its item ladder, the item
    // scale is registered second and so would win every one of them.
    it("does not repaint the KS charts' colour map (getBandColorsByLevel)", () => {
        registerCompetenceLevelScales([
            scalePayloadRow(
                ['A1.1', 'A1.2', 'A2.1', 'A2.2', 'B1.1', 'B1.2'].map((nameShort) => ({
                    nameShort,
                })),
            ),
        ]);
        const before = getBandColorsByLevel('default');

        registerItemCompetenceScales(
            itemPayloadRows(['A1.1', 'A1.2', 'A2.1', 'A2.2', 'B1.1', 'B1.2', 'B2.1', 'B2.2']),
        );

        // Byte-for-byte: this map is keyed by bare name and is what `getThemeColors().ks`
        // hands the KS distribution charts and the sidebar thumbnail. It must agree with the
        // scale-aware `getBandColor`, which the item scale never reached.
        expect(getBandColorsByLevel('default')).toEqual(before);
        expect(getBandColorsByLevel('default')['B1.2']).toBe(getBandColor('B1.2', 'default'));
    });

    it('does not answer "does the reporting scale rank anything?" with the item scale', () => {
        // `data/en/*` is exactly this: a GER reporting ladder that states no standard, whose
        // items are ranked 1…5. `hasAnyStandardRank` gates which diagnostic SL prints, and
        // reading true here would send a developer to look for a rank that is not there.
        registerCompetenceLevelScales([
            scalePayloadRow(['A1', 'A2', 'B1', 'B2', 'C1'].map((nameShort) => ({ nameShort }))),
        ]);
        registerItemCompetenceScales(itemPayloadRows(['A1.1', 'A1.2', 'A2.1', 'B1.1', 'C1.1']));

        expect(hasAnyStandardRank()).toBe(false);
        expect(getLevelNamesForStandardRank((rank) => rank === 3)).toEqual([]);
    });

    it('does not turn a truncated reporting run into an ambiguous one (resolveScaleId)', () => {
        // WHY: a state reports a domain's scale as only the part of the ladder that domain
        // reached, so `resolveScaleId` is routinely handed a contiguous run rather than a
        // registered id. It answers by counting the registered scales that contain the run —
        // and MA's item ladder spells its levels exactly like its reporting ladder, so an
        // item scale in that count makes every truncated MA run sit inside "two" scales and
        // resolve to nothing. The charts then fall back to the bare-name answer, which is the
        // wrong ladder on any page holding more than one.
        const full = ['I', 'II', 'III', 'IV', 'V'].map((nameShort) => ({ nameShort }));
        registerCompetenceLevelScales([scalePayloadRow(full), scalePayloadRow(full.slice(1))]);
        const before = resolveScaleId(['II', 'III', 'IV', 'V']);
        expect(before).toBe('I|II|III|IV|V');

        registerItemCompetenceScales(itemPayloadRows(['I', 'II', 'III', 'IV', 'V']));

        expect(resolveScaleId(['II', 'III', 'IV', 'V'])).toBe(before);
    });
});
