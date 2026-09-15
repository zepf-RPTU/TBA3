// @vitest-browser
import { describe, it, expect, beforeEach } from 'vitest';
import {
    compareItemLevelToReportedLevel,
    compareLevelLabels,
    createGerLevelHtml,
    getItemLevelColor,
    getItemLevelOrdinal,
    parseItemLevel,
} from '@tba3/modules/common/domain/levels.js';
import {
    registerCompetenceLevelScales,
    resetCompetenceLevelPalette,
} from '@tba3/modules/common/services/competenceLevelPalette.js';
import { getBandColor } from '@tba3/modules/common/services/competenceLevelColors.js';
import { invalidateThemeColorCache } from '@tba3/modules/common/services/themeService.js';
import {
    registerStandardItemScales,
    scalePayloadRow,
} from '../../support/competenceScaleFixture.js';

/**
 * WHY this file exists: `levels.js` is the one place that relates the registered item scale
 * (Aufgabenniveau) to whatever reporting scale a state publishes. Everything an item
 * table, lollipop, task ring or preset does with an item level goes through it, and it
 * used to hardcode `A1…C1` / `I…V`.
 */
function row(levelNames, names = []) {
    return scalePayloadRow(
        levelNames.map((nameShort, index) => ({
            nameShort,
            name: names[index] ?? nameShort,
        })),
    );
}

const KMK = [
    'unter Mindeststandard',
    'Mindeststandard',
    'Regelstandard',
    'Regelstandard plus',
    'Optimalstandard',
];
const NW_MA = ['k.h.N.', 'KS 1a', 'KS 1b', 'KS 2', 'KS 3', 'KS 4', 'KS 5'];
const NW_MA_NAMES = [
    'k.h.N.',
    'weit unter Mindeststandard',
    'unter Mindeststandard',
    KMK[1],
    KMK[2],
    KMK[3],
    KMK[4],
];

/**
 * Reset to a clean registry that still knows the item vocabulary.
 *
 * The item scale comes from the payload like the reporting one does, and
 * `resetCompetenceLevelPalette` drops both — so a bare reset would leave every item level
 * unregistered and every helper below answering "unknown" for the right reason but the
 * wrong test.
 */
function resetScales() {
    resetCompetenceLevelPalette();
    registerStandardItemScales();
}

beforeEach(() => {
    resetScales();
    invalidateThemeColorCache();
});

describe('the registered item scale', () => {
    it('resolves both server vocabularies off the payload, and nothing else', () => {
        expect(parseItemLevel('Ia')).toEqual({ band: 'I', rank: 1, subIndex: 0 });
        expect(parseItemLevel('Ib')).toEqual({ band: 'I', rank: 1, subIndex: 1 });
        expect(parseItemLevel('III')).toEqual({ band: 'III', rank: 3, subIndex: 0 });
        expect(parseItemLevel('B1.2')).toEqual({ band: 'B1', rank: 3, subIndex: 1 });
        expect(parseItemLevel('C1.1')).toEqual({ band: 'C1', rank: 5, subIndex: 0 });
        expect(parseItemLevel('KS 3')).toBeNull();
        expect(parseItemLevel('ReStd')).toBeNull();
        expect(parseItemLevel('')).toBeNull();
        expect(parseItemLevel(undefined)).toBeNull();
    });

    // WHY: `localeCompare` sorts `II < III < IV < Ia < Ib < V` — the item table's filter
    // menu and the lollipop legend read bottom-up only if the item scale itself orders them.
    it('orders Ia < Ib < II < … < V and A1.1 < A1.2 < A2.1 < … < C1.2', () => {
        const roman = ['V', 'Ib', 'III', 'Ia', 'IV', 'II'].sort(
            (a, b) => getItemLevelOrdinal(a) - getItemLevelOrdinal(b),
        );
        expect(roman).toEqual(['Ia', 'Ib', 'II', 'III', 'IV', 'V']);
        const cefr = ['B2.1', 'A1.2', 'C1.1', 'A1.1', 'B1.2'].sort(
            (a, b) => getItemLevelOrdinal(a) - getItemLevelOrdinal(b),
        );
        expect(cefr).toEqual(['A1.1', 'A1.2', 'B1.2', 'B2.1', 'C1.1']);
        expect(getItemLevelOrdinal('kaputt')).toBe(Number.MAX_SAFE_INTEGER);
    });
});

describe('compareItemLevelToReportedLevel', () => {
    it('compares by ordinal when both sides sit on one registered scale', () => {
        registerCompetenceLevelScales([row(['A1', 'A2', 'B1', 'B2', 'C1'])]);
        expect(compareItemLevelToReportedLevel('B1.1', 'B2')).toBeLessThan(0);
        expect(compareItemLevelToReportedLevel('B2.2', 'B2')).toBe(0);
        expect(compareItemLevelToReportedLevel('C1.1', 'B2')).toBeGreaterThan(0);
    });

    it('falls back to the KMK standard across vocabularies', () => {
        registerCompetenceLevelScales([row(NW_MA, NW_MA_NAMES)]);
        expect(compareItemLevelToReportedLevel('Ib', 'KS 2')).toBeLessThan(0);
        expect(compareItemLevelToReportedLevel('II', 'KS 2')).toBe(0);
        expect(compareItemLevelToReportedLevel('III', 'KS 2')).toBeGreaterThan(0);
        // `KS 1a` and `KS 1b` are one KMK rank; the bridge cannot tell them apart and says so.
        expect(compareItemLevelToReportedLevel('Ia', 'KS 1b')).toBe(0);
    });

    // WHY: null is the contract. A caller that coerces it to 0 has turned "unknown" into
    // "same level" and would show every item as neither below nor above.
    it('returns null — never a number — when the two cannot be related', () => {
        registerCompetenceLevelScales([row(NW_MA, NW_MA_NAMES)]);
        expect(compareItemLevelToReportedLevel('II', 'k.h.N.')).toBeNull();
        expect(compareItemLevelToReportedLevel('II', 'nicht da')).toBeNull();
        expect(compareItemLevelToReportedLevel('kaputt', 'KS 3')).toBeNull();
        resetScales();
        registerCompetenceLevelScales([row(['S1', 'S2', 'S3'])]);
        expect(compareItemLevelToReportedLevel('II', 'S2')).toBeNull();
    });
});

describe('getItemLevelColor', () => {
    it('uses the registered level, then its band', () => {
        registerCompetenceLevelScales([row(['A1', 'A2', 'B1', 'B2', 'C1'])]);
        expect(getItemLevelColor('B1.2')).toBe(getBandColor('B1'));

        resetScales();
        registerCompetenceLevelScales([row(['A1.1', 'A1.2', 'A2.1', 'A2.2', 'B1.1', 'B1.2'])]);
        expect(getItemLevelColor('B1.2')).toBe(getBandColor('B1.2'));
        expect(getItemLevelColor('B1.2')).not.toBe(getItemLevelColor('B1.1'));
    });

    // WHY: without this, every task-ring arc on an MA state export renders with no fill
    // (black) and every lollipop in one brand color — F4 in the audit.
    it('bridges to the reporting level of the same KMK standard, sub-band by position', () => {
        registerCompetenceLevelScales([row(NW_MA, NW_MA_NAMES)]);
        expect(getItemLevelColor('Ia')).toBe(getBandColor('KS 1a'));
        expect(getItemLevelColor('Ib')).toBe(getBandColor('KS 1b'));
        expect(getItemLevelColor('III')).toBe(getBandColor('KS 3'));
        expect(getItemLevelColor('V')).toBe(getBandColor('KS 5'));

        resetScales();
        registerCompetenceLevelScales([row(['MiStd-', 'MiStd', 'ReStd', 'ReStd+', 'OptStd'], KMK)]);
        // One level for the rank takes every sub-band.
        expect(getItemLevelColor('Ia')).toBe(getBandColor('MiStd-'));
        expect(getItemLevelColor('Ib')).toBe(getBandColor('MiStd-'));
    });

    it('is null when nothing on the loaded scale can answer', () => {
        registerCompetenceLevelScales([row(['S1', 'S2', 'S3'])]);
        expect(getItemLevelColor('III')).toBeNull();
        expect(getItemLevelColor('kaputt')).toBeNull();
        // Niedersachsen-style: items graded B2.x on a ladder that stops at B1.2 — no level of rank 4.
        resetScales();
        registerCompetenceLevelScales([
            row(
                ['A1.1', 'A1.2', 'A2.1', 'A2.2', 'B1.1', 'B1.2'],
                [KMK[0], KMK[0], KMK[1], KMK[1], KMK[2], KMK[2]],
            ),
        ]);
        expect(getItemLevelColor('B2.1')).toBeNull();
    });
});

describe('compareLevelLabels', () => {
    it('sorts a reporting-level column by scale order, not alphabetically', () => {
        registerCompetenceLevelScales([
            row(['MiStd--', 'MiStd-', 'MiStd', 'ReStd', 'ReStd+', 'OptStd']),
        ]);
        expect(['ReStd', 'MiStd', 'MiStd--', 'OptStd', 'MiStd-'].sort(compareLevelLabels)).toEqual([
            'MiStd--',
            'MiStd-',
            'MiStd',
            'ReStd',
            'OptStd',
        ]);
        resetScales();
        registerCompetenceLevelScales([row(NW_MA, NW_MA_NAMES)]);
        expect(['KS 3', 'k.h.N.', 'KS 1a'].sort(compareLevelLabels)).toEqual([
            'k.h.N.',
            'KS 1a',
            'KS 3',
        ]);
    });

    it('sorts an item-level column by the item scale even when only part of it is registered', () => {
        registerCompetenceLevelScales([row(['A1.1', 'A1.2', 'A2.1', 'A2.2', 'B1.1', 'B1.2'])]);
        expect(['B2.1', 'A1.1', 'B1.2', 'B2.2', 'A2.1'].sort(compareLevelLabels)).toEqual([
            'A1.1',
            'A2.1',
            'B1.2',
            'B2.1',
            'B2.2',
        ]);
        expect(['V', 'Ib', 'II', 'Ia'].sort(compareLevelLabels)).toEqual(['Ia', 'Ib', 'II', 'V']);
    });

    it('places values that are neither last, alphabetically', () => {
        registerCompetenceLevelScales([row(['I', 'II', 'III', 'IV', 'V'])]);
        expect(['zz', 'III', 'N/A', 'I'].sort(compareLevelLabels)).toEqual([
            'I',
            'III',
            'N/A',
            'zz',
        ]);
    });
});

describe('createGerLevelHtml colors item levels across vocabularies', () => {
    it('paints an item cell through the bridge when its band is not on the reporting scale', () => {
        registerCompetenceLevelScales([
            row(['k.h.N.', 'KS 1', 'KS 2', 'KS 3', 'KS 4', 'KS 5'], ['k.h.N.', ...KMK]),
        ]);
        const html = createGerLevelHtml('B1.2');
        expect(html).toContain('competency-level');
        expect(html).toContain(`--ks-band-color:${getBandColor('KS 3')}`);
        // The popup would describe `KS 3`, not `B1.2` — no glossary key through the bridge.
        expect(html).not.toContain('data-glossary-key');
    });

    it('leaves a level nothing answers to as plain text', () => {
        registerCompetenceLevelScales([row(['S1', 'S2', 'S3'])]);
        expect(createGerLevelHtml('B1.2')).not.toContain('competency-level');
    });
});
