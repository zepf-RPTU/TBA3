// @vitest-browser
import { describe, it, expect, beforeEach } from 'vitest';
import {
    compareItemCompetenceLevelToReportedSpan,
    compareLevelLabels,
} from '../../../src/common/domain/levels.js';
import { setTrustedHTML } from '@tba3/module-base';
import {
    createGerLevelHtml,
    createItemLevelHtml,
    getItemCompetenceLevelFill,
} from '../../../src/common/services/itemCompetenceLevelAppearance.js';
import { CompetenceLevelPalette } from '../../../src/common/context/index.js';
import {
    getCompetenceAppearance,
    getCompetenceColor,
} from '../../../src/common/services/themeService.js';
import { MISSING_VALUE } from '../../../src/common/utils/numberFormat.js';
import {
    GER_LEVELS,
    GER_SPANS,
    KMK_NAMES,
    KS_LEVELS,
    KS_SPLIT_LEVELS,
    ROMAN_SPANS,
    VERA3_ROMAN_LEVELS,
    VERA3_SPANS,
    itemValueGroups,
    ladderValueGroup,
    registerStandardItemScales,
} from '../../support/competenceScaleFixture.js';

/**
 * `levels.js` is the one place that relates the registered item scale
 * (Aufgabenniveau) to whatever reporting scale a state publishes. Everything an item
 * table, lollipop, item ring or preset does with an item level goes through it, and it
 * must not assume `A1…C1` / `I…V`, nor a slot count: the link is the item slot and the
 * `itemLevelSpan` each reporting level ships.
 */

const KS_SPLIT_NAMES = [
    'k.h.N.',
    'weit unter Mindeststandard',
    'unter Mindeststandard',
    KMK_NAMES[1],
    KMK_NAMES[2],
    KMK_NAMES[3],
    KMK_NAMES[4],
];

/** nw English: the `KS` ladder over the ten CEFR slots. */
const KS_CEFR_SPANS = {
    'KS 1': '1-2',
    'KS 2': '3-4',
    'KS 3': '5-6',
    'KS 4': '7-8',
    'KS 5': '9-10',
};

/** A reporting ladder that spells the CEFR sub-levels, as rp/sl English TH-1 does. */
const CEFR_TH1_LEVELS = ['A1.1', 'A1.2', 'A2.1', 'A2.2', 'B1.1', 'B1.2'];

/**
 * Reset to a clean registry that still knows the item vocabulary. The item scale comes
 * from the payload like the reporting one, so on a bare palette every helper below would
 * answer "unknown".
 */
function resetScales() {
    palette = new CompetenceLevelPalette();
    registerStandardItemScales(palette);
}

/** @type {CompetenceLevelPalette} The registry under test; replaced by `resetScales`. */
let palette;

/**
 * `compareLevelLabels` over the current palette, as a sort comparator.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
const byLevel = (a, b) => compareLevelLabels(palette, a, b);

beforeEach(() => {
    resetScales();
});

describe('the registered item scale', () => {
    it('maps both server vocabularies by slot, and nothing else', () => {
        palette.registerCompetenceLevelScales([
            ladderValueGroup(KS_SPLIT_LEVELS, KS_SPLIT_NAMES, { spans: ROMAN_SPANS }),
        ]);
        expect(palette.getItemLevel('Ia')?.reportingLevel?.name).toBe('KS 1a');
        expect(palette.getItemLevel('Ib')?.reportingLevel?.name).toBe('KS 1b');
        expect(palette.getItemLevel('III')?.reportingLevel?.name).toBe('KS 3');
        // The level names are no item levels, whatever they spell.
        expect(palette.getItemLevel('KS 3')?.reportingLevel ?? null).toBeNull();
        expect(palette.getItemLevel('')?.reportingLevel ?? null).toBeNull();
        expect(palette.getItemLevel(undefined)?.reportingLevel ?? null).toBeNull();

        resetScales();
        palette.registerCompetenceLevelScales([
            ladderValueGroup(GER_LEVELS, [], { spans: GER_SPANS }),
        ]);
        expect(palette.getItemLevel('B1.2')?.reportingLevel?.name).toBe('B1');
        expect(palette.getItemLevel('C1.2')?.reportingLevel?.name).toBe('C1');
        expect(palette.getItemLevel('ReStd')?.reportingLevel ?? null).toBeNull();
    });

    // `localeCompare` sorts `II < III < IV < Ia < Ib < V` — the item table's filter
    // menu and the lollipop legend read bottom-up only if the item scale itself orders them.
    it('orders Ia < Ib < II < … < V and A1.1 < A1.2 < A2.1 < … < C1.2', () => {
        const roman = ['V', 'Ib', 'III', 'Ia', 'IV', 'II'].sort(byLevel);
        expect(roman).toEqual(['Ia', 'Ib', 'II', 'III', 'IV', 'V']);
        const cefr = ['B2.1', 'A1.2', 'C1.1', 'A1.1', 'B1.2'].sort(byLevel);
        expect(cefr).toEqual(['A1.1', 'A1.2', 'B1.2', 'B2.1', 'C1.1']);
        expect(['kaputt', 'V'].sort(byLevel)).toEqual(['V', 'kaputt']);
    });
});

describe('compareItemCompetenceLevelToReportedSpan', () => {
    it('is 0 inside the span, slot − from below it and slot − to above it', () => {
        const b1 = { from: 5, to: 6 };
        expect(compareItemCompetenceLevelToReportedSpan(palette, 'B1.1', b1)).toBe(0);
        expect(compareItemCompetenceLevelToReportedSpan(palette, 'B1.2', b1)).toBe(0);
        expect(compareItemCompetenceLevelToReportedSpan(palette, 'A2.1', b1)).toBe(-2);
        expect(compareItemCompetenceLevelToReportedSpan(palette, 'C1.1', b1)).toBe(3);
    });

    it('tells KS 1a and KS 1b apart by slot', () => {
        // `KS 1b` covers slot 2 only: an `Ia` item lies one slot below it.
        expect(compareItemCompetenceLevelToReportedSpan(palette, 'Ia', { from: 2, to: 2 })).toBe(
            -1,
        );
        expect(compareItemCompetenceLevelToReportedSpan(palette, 'Ib', { from: 2, to: 2 })).toBe(0);
        // An unsplit `KS 1` covers both.
        expect(compareItemCompetenceLevelToReportedSpan(palette, 'Ia', { from: 1, to: 2 })).toBe(0);
    });

    it('counts in the slots of the registered item scale, whatever their number', () => {
        // VERA 3: five slots `I…V`, so `II` is slot 2, not slot 3 as on the VERA 8 ladder.
        palette = new CompetenceLevelPalette();
        palette.registerItemCompetenceScales(itemValueGroups(VERA3_ROMAN_LEVELS));
        expect(compareItemCompetenceLevelToReportedSpan(palette, 'II', { from: 2, to: 2 })).toBe(0);
        expect(compareItemCompetenceLevelToReportedSpan(palette, 'V', { from: 3, to: 3 })).toBe(2);
    });

    // Null is the contract. A caller that coerces it to 0 has turned "unknown" into
    // "same level" and would show every item as neither below nor above.
    it('returns null — never a number — when the two cannot be related', () => {
        // A `k.h.N.` student, or a value group without spans.
        expect(compareItemCompetenceLevelToReportedSpan(palette, 'II', null)).toBeNull();
        expect(compareItemCompetenceLevelToReportedSpan(palette, 'II', undefined)).toBeNull();
        expect(
            compareItemCompetenceLevelToReportedSpan(palette, 'kaputt', { from: 1, to: 2 }),
        ).toBeNull();
        palette = new CompetenceLevelPalette();
        expect(
            compareItemCompetenceLevelToReportedSpan(palette, 'II', { from: 1, to: 2 }),
        ).toBeNull();
    });
});

describe('compareLevelLabels', () => {
    it('sorts a reporting-level column by scale order, not alphabetically', () => {
        palette.registerCompetenceLevelScales([
            ladderValueGroup(['MiStd--', 'MiStd-', 'MiStd', 'ReStd', 'ReStd+', 'OptStd']),
        ]);
        expect(['ReStd', 'MiStd', 'MiStd--', 'OptStd', 'MiStd-'].sort(byLevel)).toEqual([
            'MiStd--',
            'MiStd-',
            'MiStd',
            'ReStd',
            'OptStd',
        ]);
        resetScales();
        palette.registerCompetenceLevelScales([ladderValueGroup(KS_SPLIT_LEVELS, KS_SPLIT_NAMES)]);
        expect(['KS 3', 'k.h.N.', 'KS 1a'].sort(byLevel)).toEqual(['k.h.N.', 'KS 1a', 'KS 3']);
    });

    it('sorts an item competence-level column by the item scale even when only part of it is registered', () => {
        palette.registerCompetenceLevelScales([ladderValueGroup(CEFR_TH1_LEVELS)]);
        expect(['B2.1', 'A1.1', 'B1.2', 'B2.2', 'A2.1'].sort(byLevel)).toEqual([
            'A1.1',
            'A2.1',
            'B1.2',
            'B2.1',
            'B2.2',
        ]);
        expect(['V', 'Ib', 'II', 'Ia'].sort(byLevel)).toEqual(['Ia', 'Ib', 'II', 'V']);
    });

    it('places values that are neither last, alphabetically', () => {
        palette.registerCompetenceLevelScales([ladderValueGroup(VERA3_ROMAN_LEVELS)]);
        expect(['zz', 'III', 'N/A', 'I'].sort(byLevel)).toEqual(['I', 'III', 'N/A', 'zz']);
    });
});

describe('createItemLevelHtml colors item levels across vocabularies', () => {
    it('paints an item cell as the reporting level whose span covers it', () => {
        palette.registerCompetenceLevelScales([
            ladderValueGroup(KS_LEVELS, ['k.h.N.', ...KMK_NAMES], { spans: KS_CEFR_SPANS }),
        ]);
        const cell = document.createElement('div');
        setTrustedHTML(cell, createItemLevelHtml(palette, 'B1.2'));
        const mark = /** @type {HTMLElement} */ (cell.firstElementChild);
        expect(mark.classList.contains('competence-level')).toBe(true);
        expect(mark.style.getPropertyValue('--competence-level-band-color')).toBe(
            getCompetenceColor(palette, 'KS 3'),
        );
        // The popup would describe `KS 3`, not `B1.2` — no glossary key through the span.
        expect(mark.hasAttribute('data-glossary-key')).toBe(false);
    });

    it('leaves a level nothing answers to as plain text', () => {
        palette.registerCompetenceLevelScales([ladderValueGroup(['S1', 'S2', 'S3'])]);
        expect(createItemLevelHtml(palette, 'B1.2')).not.toContain('competence-level');
    });

    // The cell takes the charts' one path: an item spelled like a reporting level is
    // still no reporting level, so a ladder without spans leaves it neutral, as the fill.
    it('paints an item through its span alone, never through a same-named reporting level', () => {
        palette.registerCompetenceLevelScales([
            ladderValueGroup(['Ia', 'Ib', 'II', 'III', 'IV', 'V']),
        ]);
        expect(createItemLevelHtml(palette, 'III')).not.toContain('competence-level');
        // The same value as a reported level paints as itself.
        expect(createGerLevelHtml(palette, 'III')).toContain('competence-level');
    });

    it('prints the missing mark for a missing level', () => {
        // A student without a value group in a domain carries no level; the cell shows the
        // one missing mark every table uses, not a sentinel string.
        const cell = document.createElement('div');
        setTrustedHTML(cell, createGerLevelHtml(palette, null));
        expect(cell.textContent).toBe(MISSING_VALUE);
    });
});

describe('getItemCompetenceLevelFill', () => {
    it('paints the reporting level whose span covers the slot', () => {
        palette.registerCompetenceLevelScales([
            ladderValueGroup(GER_LEVELS, [], { spans: GER_SPANS }),
        ]);
        expect(getItemCompetenceLevelFill(palette, 'B1.2')).toBe(getCompetenceColor(palette, 'B1'));

        resetScales();
        palette.registerCompetenceLevelScales([
            ladderValueGroup(CEFR_TH1_LEVELS, [], {
                spans: {
                    'A1.1': '1',
                    'A1.2': '2',
                    'A2.1': '3',
                    'A2.2': '4',
                    'B1.1': '5',
                    'B1.2': '6-10',
                },
            }),
        ]);
        expect(getItemCompetenceLevelFill(palette, 'B1.2')).toBe(
            getCompetenceColor(palette, 'B1.2'),
        );
        expect(getItemCompetenceLevelFill(palette, 'B1.2')).not.toBe(
            getItemCompetenceLevelFill(palette, 'B1.1'),
        );
        // The server folds the slots above the ladder's top into its last level.
        expect(getItemCompetenceLevelFill(palette, 'C1.1')).toBe(
            getCompetenceColor(palette, 'B1.2'),
        );
    });

    // Without this, every item-ring arc on an MA state export renders with no fill
    // (black) and every lollipop in one brand color.
    it('maps across vocabularies, KS 1a and KS 1b slot by slot', () => {
        palette.registerCompetenceLevelScales([
            ladderValueGroup(KS_SPLIT_LEVELS, KS_SPLIT_NAMES, { spans: ROMAN_SPANS }),
        ]);
        expect(getItemCompetenceLevelFill(palette, 'Ia')).toBe(
            getCompetenceColor(palette, 'KS 1a'),
        );
        expect(getItemCompetenceLevelFill(palette, 'Ib')).toBe(
            getCompetenceColor(palette, 'KS 1b'),
        );
        expect(getItemCompetenceLevelFill(palette, 'III')).toBe(
            getCompetenceColor(palette, 'KS 3'),
        );
        expect(getItemCompetenceLevelFill(palette, 'V')).toBe(getCompetenceColor(palette, 'KS 5'));

        resetScales();
        // `ni` has no `Ia` band: its lowest level covers slots 1-2.
        palette.registerCompetenceLevelScales([
            ladderValueGroup(['MiStd-', 'MiStd', 'ReStd', 'ReStd+', 'OptStd'], KMK_NAMES, {
                spans: { 'MiStd-': '1-2', MiStd: '3', ReStd: '4', 'ReStd+': '5', OptStd: '6' },
            }),
        ]);
        expect(getItemCompetenceLevelFill(palette, 'Ia')).toBe(
            getCompetenceColor(palette, 'MiStd-'),
        );
        expect(getItemCompetenceLevelFill(palette, 'Ib')).toBe(
            getCompetenceColor(palette, 'MiStd-'),
        );
    });

    it('folds a slot in a gap into the band below it, as the server closes it', () => {
        // rp/sl English TH-2 jumps from B1.1 to B2.1; slot 6 (`B1.2`) belongs to B1.1.
        palette.registerCompetenceLevelScales([
            ladderValueGroup(['A1.1', 'A1.2', 'A2.1', 'A2.2', 'B1.1', 'B2.1'], [], {
                spans: {
                    'A1.1': '1',
                    'A1.2': '2',
                    'A2.1': '3',
                    'A2.2': '4',
                    'B1.1': '5-6',
                    'B2.1': '7-10',
                },
            }),
        ]);
        expect(getItemCompetenceLevelFill(palette, 'B1.2')).toBe(
            getCompetenceColor(palette, 'B1.1'),
        );
    });

    // rp/sl English: TH-1 and TH-3 share `B1.1` with a different level count, so a colour
    // looked up by name alone would come from whichever ladder registered the name last.
    it('paints with the ramp of the scale whose span answered, not the last one named so', () => {
        const th3 = ['A1.1', 'A1.2', 'A2.1', 'A2.2', 'B1.1', 'C1'];
        palette.registerCompetenceLevelScales([
            ladderValueGroup(CEFR_TH1_LEVELS, [], {
                spans: {
                    'A1.1': '1',
                    'A1.2': '2',
                    'A2.1': '3',
                    'A2.2': '4',
                    'B1.1': '5',
                    'B1.2': '6-10',
                },
            }),
            ladderValueGroup(th3, [], {
                spans: {
                    'A1.1': '1',
                    'A1.2': '2',
                    'A2.1': '3',
                    'A2.2': '4',
                    'B1.1': '5-8',
                    C1: '9-10',
                },
            }),
        ]);
        const th1Id = CEFR_TH1_LEVELS.join('|');
        expect(palette.getItemLevel('B1.1')?.reportingLevel?.scaleId).toBe(th1Id);
        expect(getItemCompetenceLevelFill(palette, 'B1.1')).toBe(
            getCompetenceAppearance(palette, 'B1.1', th1Id)?.baseColor,
        );
        expect(getItemCompetenceLevelFill(palette, 'B1.1')).not.toBe(
            getCompetenceColor(palette, 'B1.1'),
        );
    });

    it('works on a VERA 3 ladder, five slots', () => {
        palette = new CompetenceLevelPalette();
        palette.registerItemCompetenceScales(itemValueGroups(VERA3_ROMAN_LEVELS));
        palette.registerCompetenceLevelScales([
            ladderValueGroup(VERA3_ROMAN_LEVELS, [], { spans: VERA3_SPANS }),
        ]);
        expect(getItemCompetenceLevelFill(palette, 'II')).toBe(getCompetenceColor(palette, 'II'));
        expect(getItemCompetenceLevelFill(palette, 'V')).toBe(getCompetenceColor(palette, 'V'));
    });

    it('paints a level nothing answers in the neutral bar color, as a reporting level would', () => {
        // An unknown level must not look like a branded, meaningful one, in any chart.
        palette = new CompetenceLevelPalette();
        expect(getItemCompetenceLevelFill(palette, 'Z9')).toBe('var(--default-bar-color)');

        // A ladder that ships no spans relates no item at all, even one spelled like a level.
        palette.registerCompetenceLevelScales([ladderValueGroup(VERA3_ROMAN_LEVELS)]);
        expect(getItemCompetenceLevelFill(palette, 'III')).toBe('var(--default-bar-color)');
        expect(getItemCompetenceLevelFill(palette, 'kaputt')).toBe('var(--default-bar-color)');

        // A slot outside every span, and a malformed span, answer nothing.
        resetScales();
        palette.registerCompetenceLevelScales([
            ladderValueGroup(CEFR_TH1_LEVELS, [], {
                spans: {
                    'A1.1': '1',
                    'A1.2': '2',
                    'A2.1': '3',
                    'A2.2': '4',
                    'B1.1': '5-x',
                    'B1.2': '6',
                },
            }),
        ]);
        expect(getItemCompetenceLevelFill(palette, 'B2.1')).toBe('var(--default-bar-color)');
        expect(getItemCompetenceLevelFill(palette, 'B1.1')).toBe('var(--default-bar-color)');
    });
});
