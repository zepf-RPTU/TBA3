/**
 * competenceScale tests — the payload's `Äquivalenztabelle` is the only source of cut
 * scores in the app, and it arrives as a string inside a free-form `properties` entry.
 * Every assertion here is about a way that string can be misread into thresholds that
 * are wrong but plausible — the failure mode that renders silently.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

import {
    getKsThresholds,
    getScaleLevels,
    parseEquivalenceTables,
    resolveEquivalenceTable,
} from '@tba3/modules/common/domain/competenceScale.js';

/** An NRW-style group row of `competence-levels.json`, domain `le`. */
const NW_TABLE =
    'maxScore=39;itemCount=39;studentCount=24;' +
    'k.h.N.=0-5;KS 1=6-13;KS 2=14-22;KS 3=23-30;KS 4=31-36;KS 5=37-39';

/** A Mindeststandard-style table — band labels ending in the separator the values are split on. */
const NI_TABLE =
    'maxScore=28;itemCount=28;' + 'MiStd-=0-7;MiStd=8-11;ReStd=12-16;ReStd+=17-20;OptStd=21-28';

function row(properties, id = '1002') {
    return { id, properties };
}

function table(bookletId, value) {
    return { key: `equivalenceTable:${bookletId}`, value };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('parseEquivalenceTables', () => {
    it('reads head fields and bands off one booklet', () => {
        const tables = parseEquivalenceTables(row([table('26-V8-EN-TH-2', NW_TABLE)]));

        expect(tables['26-V8-EN-TH-2']).toEqual({
            maxScore: 39,
            itemCount: 39,
            studentCount: 24,
            bands: [
                { nameShort: 'k.h.N.', minScore: 0, maxScore: 5 },
                { nameShort: 'KS 1', minScore: 6, maxScore: 13 },
                { nameShort: 'KS 2', minScore: 14, maxScore: 22 },
                { nameShort: 'KS 3', minScore: 23, maxScore: 30 },
                { nameShort: 'KS 4', minScore: 31, maxScore: 36 },
                { nameShort: 'KS 5', minScore: 37, maxScore: 39 },
            ],
        });
    });

    it('keeps band labels containing the grammar separators intact', () => {
        // WHY: `MiStd-` ends in the character the *value* is split on, and `k.h.N.`
        // contains dots. Splitting on the last `=` or on any `-` turns "ReStd+" into a
        // band named "ReStd" with a boundary short by the whole label.
        const tables = parseEquivalenceTables(row([table('THA', NI_TABLE)]));

        expect(tables.THA.bands.map((band) => band.nameShort)).toEqual([
            'MiStd-',
            'MiStd',
            'ReStd',
            'ReStd+',
            'OptStd',
        ]);
        expect(tables.THA.bands[0]).toEqual({ nameShort: 'MiStd-', minScore: 0, maxScore: 7 });
    });

    it('returns nothing for a value-group that ships no table', () => {
        expect(parseEquivalenceTables(row(null))).toEqual({});
        expect(parseEquivalenceTables(row([{ key: 'schoolType', value: 'GE' }]))).toEqual({});
        expect(parseEquivalenceTables(undefined)).toEqual({});
    });
});

describe('resolveEquivalenceTable', () => {
    it('uses the only table without needing to be told which', () => {
        const resolved = resolveEquivalenceTable(row([table('26-V8-EN-TH-2', NW_TABLE)]));

        expect(resolved.maxScore).toBe(39);
    });

    it('reports absence rather than picking one when a row carries several', () => {
        // WHY: a group scope is a Testheft-Gruppe and sits exactly one booklet, so
        // several tables on one row is a broken payload, not a case to resolve. Cut
        // scores differ per booklet — choosing one would draw a band boundary at a score
        // no booklet actually uses, and do it silently. Absence is rendered as "no
        // threshold presets", which is visible.
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const resolved = resolveEquivalenceTable(
            row([
                table('TH-1', 'maxScore=28;studentCount=7;A1=0-13;A2=14-28'),
                table('TH-2', 'maxScore=35;studentCount=17;A1=0-17;A2=18-35'),
            ]),
        );

        expect(resolved).toBeNull();
        expect(warn).toHaveBeenCalledOnce();
    });

    it('returns null rather than a default when there is no table at all', () => {
        expect(resolveEquivalenceTable(row(null))).toBeNull();
        expect(resolveEquivalenceTable(row([]))).toBeNull();
    });
});

describe('getKsThresholds', () => {
    it("reports the transitions, excluding the floor band's own zero", () => {
        expect(getKsThresholds(row([table('26-V8-EN-TH-2', NW_TABLE)]))).toEqual([
            6, 14, 23, 31, 37,
        ]);
    });

    it('stays empty for an ambiguous row rather than guessing a booklet', () => {
        // WHY: this is the per-student entry point. A wrong threshold here reads as
        // "you are 2 points below the next level" — a specific, false claim. A row with
        // two tables cannot occur at group scope any more, so reaching this means the
        // payload is broken; empty is the answer that shows no presets rather than
        // wrong ones.
        vi.spyOn(console, 'warn').mockImplementation(() => {});

        const thresholds = getKsThresholds(
            row([
                table('TH-1', 'maxScore=28;A1=0-13;A2=14-28'),
                table('TH-2', 'maxScore=35;A1=0-17;A2=18-35'),
            ]),
        );

        expect(thresholds).toEqual([]);
    });
});

describe('getScaleLevels', () => {
    it("takes the scale from the class's own row, wherever it sits in the document", () => {
        // WHY: the spec fixes no row order, and a comparison row can sit on another
        // booklet's ladder (a nw class on six bands beside seven-band Landesschnitt
        // rows). Reading the first row put the class on the state's scale.
        const levels = getScaleLevels([
            { type: 'state', competenceLevels: [{ nameShort: 'A1' }, { nameShort: 'A2' }] },
            { type: 'group', competenceLevels: [{ nameShort: 'k.h.N.' }, { nameShort: 'KS 1' }] },
        ]);

        expect(levels).toEqual(['k.h.N.', 'KS 1']);
    });

    it('is empty for missing data or a document without a class row', () => {
        expect(getScaleLevels([])).toEqual([]);
        expect(getScaleLevels(undefined)).toEqual([]);
        expect(
            getScaleLevels([{ type: 'school', competenceLevels: [{ nameShort: 'A1' }] }]),
        ).toEqual([]);
    });
});
