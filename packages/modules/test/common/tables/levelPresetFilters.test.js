// @vitest-browser
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { CompetenceLevelPalette } from '../../../src/common/context/index.js';
import { BaseStudentDataTableModule } from '../../../src/common/tables/baseStudentDataTableModule.js';
import { RESULT_CODE } from '../../../src/common/domain/apiValueMaps.js';
import {
    GER_SPANS,
    ROMAN_SPANS,
    VERA3_ROMAN_LEVELS,
    VERA3_SPANS,
    itemValueGroups,
    registerStandardItemScales,
} from '../../support/competenceScaleFixture.js';
import { createTestContext } from '../../support/glossaryFixture.js';
import { mountTable } from '../../support/tableHarness.js';

vi.mock('../../../src/common/tables/tabulatorBuild.js', async () => ({
    Tabulator: (await import('../../support/tableHarness.js')).FakeTabulator,
}));

/**
 * The presets compare an item's slot on the Aufgabenniveau scale with the item slots the
 * student's level covers, as the student's own value group ships them
 * (`itemLevelSpan:<level id>`). Presets comparing against hardcoded `A1…C1` / `I…V` lists
 * would select nothing on any other state scale; these name the student's level and look
 * its span up in the table the scale under test ships.
 */

/** @type {LevelTable} */
let table;

/** @type {import('../../../src/common/context/index.js').ModuleContext} */
let context;

/** @type {Readonly<Record<string, string>>} The span per level of the scale under test. */
let spans = {};

/** A student table whose student reached, per row, the span the row names. */
class LevelTable extends BaseStudentDataTableModule {
    /** @override */
    _readStudent() {
        return {
            rows: [{ name: 'Aufgabe 1' }],
            reachedSpanOf: (/** @type {{[field: string]: any}} */ row) => row.reachedSpan,
        };
    }

    /** @override */
    _tableSpec() {
        return { columns: [{ field: 'name' }] };
    }

    /** @returns {import('../../../src/common/tables/preset.js').PresetSpec[]} The presets the table offers. */
    offeredPresets() {
        return this._getPresets();
    }
}
customElements.define('test-level-preset-table', LevelTable);

beforeAll(async () => {
    // The presets read their label and tooltip from the glossary when they are built.
    context = createTestContext('ma');
    table = LevelTable.create('level-presets', {
        context,
        glossaryKey: 'ma.student.student-item-table',
        studentId: 's1',
    });
    await mountTable(table);
});

/**
 * One `itemLevelSpan` value as the reader parses it.
 * @param {string|undefined} value - `"a"` or `"a-b"`.
 * @returns {{from: number, to: number}|null} Null without one.
 */
function toSpan(value) {
    if (!value) return null;
    const [from, to = from] = value.split('-').map(Number);
    return { from, to };
}

/**
 * Whether a preset's row filter keeps an item row.
 * @param {number} index - 0 for "Unter KS", 1 for "Über KS".
 * @param {string} itemCompetenceLevel - The item's Aufgabenniveau.
 * @param {string|null} reachedLevel
 * @param {number} resultCode
 * @returns {boolean} True when the preset shows the row.
 */
function keeps(index, itemCompetenceLevel, reachedLevel, resultCode) {
    // Built against the palette in force, as the table builds them on each data swap.
    const [filter] = table.offeredPresets()[index].filters ?? [];
    const reachedSpan = reachedLevel ? toSpan(spans[reachedLevel]) : null;
    return filter({ competenceLevel: itemCompetenceLevel, resultCode, reachedSpan });
}

/**
 * "Unter KS" keeps an unsolved item.
 * @param {string} itemCompetenceLevel
 * @param {string|null} reachedLevel
 * @returns {boolean}
 */
const isItemBelowReportedLevel = (itemCompetenceLevel, reachedLevel) =>
    keeps(0, itemCompetenceLevel, reachedLevel, RESULT_CODE.INCORRECT);

/**
 * "Über KS" keeps a solved item.
 * @param {string} itemCompetenceLevel
 * @param {string|null} reachedLevel
 * @returns {boolean}
 */
const isItemAboveReportedLevel = (itemCompetenceLevel, reachedLevel) =>
    keeps(1, itemCompetenceLevel, reachedLevel, RESULT_CODE.CORRECT);

beforeEach(() => {
    // A fresh palette per test: the presets read it from the context when built.
    context.palette = new CompetenceLevelPalette();
    // Without the registered Aufgabenniveau scales every item level resolves to nothing
    // and both presets go empty.
    registerStandardItemScales(context.palette);
});

describe('EN presets on the A1…C1 reporting scale (a level covers two item slots)', () => {
    beforeEach(() => {
        spans = GER_SPANS;
    });
    const achieved = 'B2';

    // "Unter KS" shows unsolved items strictly below the achieved level: unexpected failures.
    it('includes only items strictly below the slots the achieved level covers', () => {
        expect(isItemBelowReportedLevel('A2.2', achieved)).toBe(true); // A2 < B2
        expect(isItemBelowReportedLevel('B1.2', achieved)).toBe(true); // B1 < B2
        expect(isItemBelowReportedLevel('B2.1', achieved)).toBe(false); // inside
        expect(isItemBelowReportedLevel('B2.2', achieved)).toBe(false); // inside
        expect(isItemBelowReportedLevel('C1.1', achieved)).toBe(false); // above
    });

    // "Über KS" shows solved items above the achieved level: strengths.
    it('includes only items strictly above the slots the achieved level covers', () => {
        expect(isItemAboveReportedLevel('C1.1', achieved)).toBe(true);
        expect(isItemAboveReportedLevel('B2.2', achieved)).toBe(false); // inside
        expect(isItemAboveReportedLevel('B1.2', achieved)).toBe(false);
    });

    // A solved item below the level or an unsolved one above it is neither.
    it('gates "Unter KS" on unsolved and "Über KS" on solved items', () => {
        expect(keeps(0, 'A2.2', achieved, RESULT_CODE.NOT_ATTEMPTED)).toBe(true);
        expect(keeps(0, 'A2.2', achieved, RESULT_CODE.CORRECT)).toBe(false);
        expect(keeps(1, 'C1.1', achieved, RESULT_CODE.INCORRECT)).toBe(false);
    });
});

describe('EN presets on the A1.1…B1.2 reporting scale', () => {
    beforeEach(() => {
        // rp/sl English TH-1: the server folds slots 7-10 into the top level.
        spans = { 'A1.1': '1', 'A1.2': '2', 'A2.1': '3', 'A2.2': '4', 'B1.1': '5', 'B1.2': '6-10' };
    });

    // On this scale `A2.1` and `A2.2` are distinct levels a student is placed on, so
    // an item at `A2.1` is below a student at `A2.2`.
    it('compares slot by slot where each level covers one', () => {
        expect(isItemBelowReportedLevel('A2.1', 'A2.2')).toBe(true);
        expect(isItemBelowReportedLevel('A2.2', 'A2.2')).toBe(false);
        expect(isItemAboveReportedLevel('B1.1', 'A2.2')).toBe(true);
    });

    // Items graded above the top of the ladder (`B2.x` on a scale ending at `B1.2`)
    // fall inside the top level's span: a student there reached them.
    it('counts items beyond the top of the ladder as the top level', () => {
        expect(isItemAboveReportedLevel('B2.1', 'B1.2')).toBe(false);
        expect(isItemBelowReportedLevel('B2.1', 'B1.2')).toBe(false);
        expect(isItemAboveReportedLevel('B2.1', 'B1.1')).toBe(true);
    });
});

describe('MA presets on the VERA 3 I…V scale (five item slots)', () => {
    beforeEach(() => {
        context.palette = new CompetenceLevelPalette();
        context.palette.registerItemCompetenceScales(itemValueGroups(VERA3_ROMAN_LEVELS));
        spans = VERA3_SPANS;
    });
    const achieved = 'III';

    it('includes only items strictly below the achieved Kompetenzstufe', () => {
        expect(isItemBelowReportedLevel('I', achieved)).toBe(true);
        expect(isItemBelowReportedLevel('II', achieved)).toBe(true);
        expect(isItemBelowReportedLevel('III', achieved)).toBe(false); // equal
        expect(isItemBelowReportedLevel('IV', achieved)).toBe(false); // above
    });

    it('includes only items strictly above the achieved Kompetenzstufe', () => {
        expect(isItemAboveReportedLevel('IV', achieved)).toBe(true);
        expect(isItemAboveReportedLevel('V', achieved)).toBe(true);
        expect(isItemAboveReportedLevel('III', achieved)).toBe(false); // equal
        expect(isItemAboveReportedLevel('II', achieved)).toBe(false);
    });

    it('excludes everything when the achieved Kompetenzstufe is unknown', () => {
        expect(isItemBelowReportedLevel('I', '')).toBe(false);
        expect(isItemAboveReportedLevel('V', null)).toBe(false);
    });
});

describe('presets across vocabularies', () => {
    // A state scale may share no vocabulary with the item scale (`MiStd-…OptStd`
    // against `Ia…V`, `KS 1…KS 5` against `A1.1…C1.1`). The span says which slots it covers.
    it('relates VERA 8 Ia…V items to MiStd-…OptStd students', () => {
        spans = { 'MiStd-': '1-2', MiStd: '3', ReStd: '4', 'ReStd+': '5', OptStd: '6' };
        expect(isItemBelowReportedLevel('Ia', 'ReStd')).toBe(true);
        expect(isItemBelowReportedLevel('II', 'ReStd')).toBe(true);
        expect(isItemBelowReportedLevel('III', 'ReStd')).toBe(false); // III is ReStd's slot
        expect(isItemAboveReportedLevel('IV', 'ReStd')).toBe(true);
    });

    it('relates A1.1…C1.1 items to KS 1…KS 5 students', () => {
        spans = { 'KS 1': '1-2', 'KS 2': '3-4', 'KS 3': '5-6', 'KS 4': '7-8', 'KS 5': '9-10' };
        expect(isItemBelowReportedLevel('A2.2', 'KS 3')).toBe(true);
        expect(isItemBelowReportedLevel('B1.1', 'KS 3')).toBe(false); // inside KS 3
        expect(isItemAboveReportedLevel('B2.1', 'KS 3')).toBe(true);
    });

    // `KS 1a` and `KS 1b` cover one slot each: `Ia` is one below `KS 1b`.
    it('places Ia below a KS 1b student', () => {
        spans = ROMAN_SPANS;
        expect(isItemBelowReportedLevel('Ia', 'KS 1b')).toBe(true);
        expect(isItemBelowReportedLevel('Ib', 'KS 1b')).toBe(false);
        expect(isItemBelowReportedLevel('Ia', 'KS 1')).toBe(false);
    });

    // `k.h.N.` covers no item slot; unknown is not "below everything".
    it('excludes everything for a student on a level that covers no slot', () => {
        spans = { 'KS 1': '1-2' };
        expect(isItemBelowReportedLevel('A1.1', 'k.h.N.')).toBe(false);
        expect(isItemAboveReportedLevel('C1.1', 'k.h.N.')).toBe(false);
    });
});
