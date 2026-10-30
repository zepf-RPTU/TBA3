// @vitest-browser
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { CompetenceLevelPalette } from '../../../src/common/services/competenceLevelPalette.js';
import { getBandColorsByLevel } from '../../../src/common/services/competenceLevelColors.js';
import { compareItemCompetenceLevelToReportedSpan } from '../../../src/common/domain/levels.js';
import {
    GER_LEVELS,
    ROMAN_LEVELS,
    bandColor,
    itemValueGroups,
    scaleValueGroup,
} from '../../support/competenceScaleFixture.js';
import { required } from '../../support/required.js';
import { GROUP_REQUESTS, valueGroupBucketsFor } from '../../../src/common/data/index.js';

/**
 * A value group listing `names` as its levels, as `scaleIdOf` reads one.
 * @param {string[]} names
 * @returns {{competenceLevels: Array<{nameShort: string}>}}
 */
const levelRun = (names) => ({ competenceLevels: names.map((nameShort) => ({ nameShort })) });

/**
 * The Aufgabenniveau scale is registered from `items.json`, never recognised from the shape
 * of its labels. It shares the registry with the reporting scale, whose vocabulary it may
 * overlap and which every chart on the page paints from.
 */

const THEMES = ['default', 'grayscale', 'data'];

/**
 * The checked-in fixtures that carry an items document, by site path. Fetched rather than
 * imported: the browser project's dev server serves `public/` at the site root, and
 * importing out of `public/` makes Vite warn.
 */
const FIXTURES = [
    ['8a_mid', '/data/en/8a_mid/competence-levels.json', '/data/en/8a_mid/items.json'],
    ['3a_mid', '/data/ma/3a_mid/competence-levels.json', '/data/ma/3a_mid/items.json'],
];

/** @typedef {import('../../../src/common/data/schemas/competenceLevels.js').CompetenceLevelsValueGroup} CompetenceLevelsValueGroup */

/** @type {Map<string, any>} site path → the parsed document, filled once in beforeAll. */
const documents = new Map();

beforeAll(async () => {
    const paths = [...new Set(FIXTURES.flatMap(([, scale, items]) => [scale, items]))];
    const loaded = await Promise.all(
        paths.map(async (path) => {
            const response = await fetch(path);
            // A renamed fixture would otherwise reach the assertions as `undefined` and
            // read like a registration regression.
            if (!response.ok) throw new Error(`fixture ${path}: HTTP ${response.status}`);
            // The competence-levels answer also carries the student value groups; the app
            // registers its scales from the rest. Neither group request asks for years,
            // so either splits by type alone.
            /** @type {CompetenceLevelsValueGroup[]} */
            const answer = await response.json();
            const bucketOf = valueGroupBucketsFor(required(GROUP_REQUESTS.en[0]), answer);
            return answer.filter((valueGroup) => bucketOf(valueGroup) === 'own');
        }),
    );
    paths.forEach((path, index) => documents.set(path, loaded[index]));
});

/**
 * Every reporting level's band metadata and themed colour, as one comparable string.
 * @param {CompetenceLevelsValueGroup[]} scaleValueGroups
 * @returns {string}
 */
function reportingSnapshot(scaleValueGroups) {
    const names = [
        ...new Set(
            scaleValueGroups
                .flatMap((valueGroup) =>
                    (valueGroup.competenceLevels ?? []).map((level) => level.nameShort),
                )
                .filter(Boolean),
        ),
    ];
    return names
        .map((name) => {
            const entry = palette.getCompetenceLevelEntry(name);
            return (
                `${name} scale=${entry?.scaleId}` +
                ` idx=${entry?.levelIndex}/${entry?.levelCount} medium=${entry?.mediumIndex}` +
                ` band=${entry?.standardBand} span=${JSON.stringify(entry?.itemLevelSpan)}` +
                ` ${THEMES.map((t) => `${t}=${bandColor(palette, name, undefined, t)}`).join(' ')}`
            );
        })
        .join('\n');
}

/** @type {CompetenceLevelPalette} */
let palette = new CompetenceLevelPalette();

beforeEach(() => {
    palette = new CompetenceLevelPalette();
});

describe('registering the item scale leaves the reporting scale untouched', () => {
    // The failure is recolouring, not an error. A state may report students on
    // `A1.1 … B1.2` and grade items `A1.1 … B2.2`, so the reporting scale is a contiguous
    // prefix of the item scale: folded into one namespace, `collectMaximalScales`
    // re-places every student level on an eight-rung ladder, and the bare-name index
    // hands an item level's entry to a caller that asks for the student one.
    it('keeps a reporting scale that the item scale contains as a prefix', () => {
        const reporting = [
            scaleValueGroup(
                ['A1.1', 'A1.2', 'A2.1', 'A2.2', 'B1.1', 'B1.2'].map((nameShort) => ({
                    nameShort,
                })),
            ),
        ];
        palette.registerCompetenceLevelScales(reporting);
        const before = reportingSnapshot(reporting);

        palette.registerItemCompetenceScales(
            itemValueGroups(['A1.1', 'A1.2', 'A2.1', 'A2.2', 'B1.1', 'B1.2', 'B2.1', 'B2.2']),
        );

        expect(reportingSnapshot(reporting)).toBe(before);
    });

    it.each(FIXTURES)('leaves every %s level exactly where it was', (_id, scalePath, itemsPath) => {
        const scaleValueGroups = documents.get(scalePath);
        palette.registerCompetenceLevelScales(scaleValueGroups);
        const before = reportingSnapshot(scaleValueGroups);

        palette.registerItemCompetenceScales(documents.get(itemsPath));

        expect(reportingSnapshot(scaleValueGroups)).toBe(before);
    });
});

describe('the item scale comes from the payload', () => {
    it('resolves nothing at all until a payload registers the scale', () => {
        // A dataset that ships no items has no item scale, and every helper must say
        // so rather than fall back to a built-in vocabulary.
        const ks1b = { from: 2, to: 2 };
        expect(palette.getItemLevel('Ib')).toBeNull();
        expect(compareItemCompetenceLevelToReportedSpan(palette, 'Ib', ks1b)).toBeNull();

        palette.registerItemCompetenceScales(itemValueGroups(['Ia', 'Ib', 'II']));

        expect(compareItemCompetenceLevelToReportedSpan(palette, 'Ib', ks1b)).toBe(0);
    });

    // -- The item slot ---------------------------------------------------------
    // This is what relates an Aufgabenniveau to a reported Kompetenzstufe when the
    // two vocabularies share no labels -- `Ib` against `KS 1b`, `B1.1` against `KS 3`. The
    // level's `id` is its slot; the reporting level's `itemLevelSpan:<id>` names the slots
    // it covers.

    it('takes the slot the payload states, not one derived from the label', () => {
        palette.registerItemCompetenceScales(itemValueGroups(['Stufe-A', 'Stufe-B']));

        expect(
            compareItemCompetenceLevelToReportedSpan(palette, 'Stufe-A', { from: 2, to: 2 }),
        ).toBe(-1);
        expect(
            compareItemCompetenceLevelToReportedSpan(palette, 'Stufe-B', { from: 2, to: 2 }),
        ).toBe(0);
    });

    it('keeps two item ladders apart when they arrive as separate documents', () => {
        // One call registers one ladder, so two ladders means two calls. No app loads a
        // second items document; this pins that the registry can hold two.
        palette.registerItemCompetenceScales(itemValueGroups(ROMAN_LEVELS));
        palette.registerItemCompetenceScales(itemValueGroups(['A1.1', 'A1.2', 'A2.1']));

        expect(palette.getItemLevel('V')?.entry.scaleId).not.toBe(
            palette.getItemLevel('A2.1')?.entry.scaleId,
        );
        // Each level keeps its own ladder's slot: `V` is slot 6, `A2.1` slot 3.
        expect(compareItemCompetenceLevelToReportedSpan(palette, 'V', { from: 6, to: 6 })).toBe(0);
        expect(compareItemCompetenceLevelToReportedSpan(palette, 'A2.1', { from: 3, to: 4 })).toBe(
            0,
        );
    });

    it('refuses a document holding two ladders rather than interleaving them', () => {
        // SL grades Deutsch/Mathematik on roman levels and Englisch/Französisch on CEFR
        // ones in one items.json, and both ladders number themselves from 1. Folded into a
        // single scale ordered by `id` they interleave (`item:1a|A1.1|1b|A1.2|2|…`) into a
        // ladder that still resolves and paints. Duplicate ids mark such a document, so
        // they are refused the way missing ids are.
        const roman = itemValueGroups(['1a', '1b', '2']);
        const cefr = itemValueGroups(['A1.1', 'A1.2', 'A2.1']);

        palette.registerItemCompetenceScales([...roman, ...cefr]);

        expect(palette.getItemLevel('1a')).toBeNull();
        expect(
            compareItemCompetenceLevelToReportedSpan(palette, 'A1.1', { from: 1, to: 2 }),
        ).toBeNull();
    });
});

describe("the item scale stays out of the reporting scale's answers", () => {
    // `bareNameIndex: false` only guards `getCompetenceLevelEntry`. Every other query that
    // reaches across scales and is keyed by name, band or slot sees `#levels` directly, and on
    // a scale whose reporting ladder is a contiguous prefix of its item ladder, the item
    // scale is registered second and so would win every one of them.
    it("does not repaint the competence-level charts' colour map (getBandColorsByLevel)", () => {
        palette.registerCompetenceLevelScales([
            scaleValueGroup(
                ['A1.1', 'A1.2', 'A2.1', 'A2.2', 'B1.1', 'B1.2'].map((nameShort) => ({
                    nameShort,
                })),
            ),
        ]);
        const before = getBandColorsByLevel(palette, 'default');

        palette.registerItemCompetenceScales(
            itemValueGroups(['A1.1', 'A1.2', 'A2.1', 'A2.2', 'B1.1', 'B1.2', 'B2.1', 'B2.2']),
        );

        // This map is keyed by bare name and is what the sidebar's Landesvorgabe swatch
        // paints from. It must agree with the scale-aware `getBandPaint`.
        expect(getBandColorsByLevel(palette, 'default')).toEqual(before);
        expect(getBandColorsByLevel(palette, 'default')['B1.2']).toBe(
            bandColor(palette, 'B1.2', undefined, 'default'),
        );
    });

    it('answers standard-band and item-slot questions from reporting levels only', () => {
        // As in the EN fixtures: a GER reporting ladder that tags no standard and ships no
        // spans. Item levels carry neither, but a query that let them in could still hand
        // an item entry to a caller that asked for a reporting one.
        palette.registerCompetenceLevelScales([
            scaleValueGroup(GER_LEVELS.map((nameShort) => ({ nameShort }))),
        ]);
        palette.registerItemCompetenceScales(
            itemValueGroups(['A1.1', 'A1.2', 'A2.1', 'B1.1', 'C1.1']),
        );

        expect(palette.getStandardBandSelection('ge', 'medium')).toEqual([]);
        expect(palette.getItemLevel('B1.1')?.reportingLevel).toBeNull();
    });

    it('does not turn a truncated reporting run into an ambiguous one (scaleIdOf)', () => {
        // A state reports a domain's scale as only the part of the ladder that domain
        // reached, so `scaleIdOf` is handed a contiguous run rather than a registered
        // id, and answers by counting the registered scales that contain it. MA's item
        // ladder spells its levels like its reporting ladder, so an item scale in that
        // count would make every truncated MA run ambiguous and resolve to nothing.
        const full = ['I', 'II', 'III', 'IV', 'V'].map((nameShort) => ({ nameShort }));
        palette.registerCompetenceLevelScales([
            scaleValueGroup(full),
            scaleValueGroup(full.slice(1)),
        ]);
        const before = palette.scaleIdOf(levelRun(['II', 'III', 'IV', 'V']));
        expect(before).toBe('I|II|III|IV|V');

        palette.registerItemCompetenceScales(itemValueGroups(['I', 'II', 'III', 'IV', 'V']));

        expect(palette.scaleIdOf(levelRun(['II', 'III', 'IV', 'V']))).toBe(before);
    });
});
