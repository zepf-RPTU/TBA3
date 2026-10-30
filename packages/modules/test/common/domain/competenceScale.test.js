/**
 * The payload's `Äquivalenztabelle` is the only source of cut scores in the app, and it
 * arrives as a string inside a free-form `properties` entry. Every assertion here is about
 * a way that string can be misread into thresholds that are wrong but plausible, which
 * render without an error.
 */

import { describe, it, expect, vi } from 'vitest';

import {
    getCompetenceLevelThresholds,
    resolveGroupEquivalenceTable,
} from '../../../src/common/domain/competenceScale.js';
import { equivalenceTable } from '../../support/competenceScaleFixture.js';
import { required } from '../../support/required.js';

/** @typedef {import('../../../src/common/domain/competenceScale.js').EquivalenceTableSource} EquivalenceTableSource */

/** The table of a group's own value group of `competence-levels.json`, on a `KS` ladder. */
const KS_TABLE =
    'maxScore=39;itemCount=39;' +
    'k.h.N.=0-5;KS 1=6-13;KS 2=14-22;KS 3=23-30;KS 4=31-36;KS 5=37-39';

/** A Mindeststandard-style table — band labels ending in the separator the values are split on. */
const STD_TABLE =
    'maxScore=28;itemCount=28;MiStd-=0-7;MiStd=8-11;ReStd=12-16;ReStd+=17-20;OptStd=21-28';

/**
 * The value groups of a payload that carries only the group's own.
 * @param {EquivalenceTableSource['properties']} properties
 * @param {string} [id]
 * @returns {Array<EquivalenceTableSource & {type: string}>}
 */
function ownValueGroup(properties, id = '1002') {
    return [{ id, type: 'group', properties }];
}

describe('resolveGroupEquivalenceTable', () => {
    it('reads head fields and bands off the one booklet', () => {
        expect(
            resolveGroupEquivalenceTable(
                ownValueGroup([equivalenceTable('26-V8-EN-TH-2', KS_TABLE)]),
            ),
        ).toEqual({
            maxScore: 39,
            itemCount: 39,
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

    it('reads a table with a missing, empty, zero or non-numeric field as no table', () => {
        // `itemCount` 0 would put every scatter threshold at Infinity, NaN every threshold.
        for (const encoded of [
            'I=0-26;II=27-34;III=35-55',
            'maxScore=55;I=0-26;II=27-34;III=35-55',
            'maxScore=x;itemCount=55;I=0-26;II=27-34;III=35-55',
            'maxScore=55;itemCount=;I=0-26;II=27-34;III=35-55',
            'maxScore=55;itemCount=0;I=0-26;II=27-34;III=35-55',
            'maxScore=55;itemCount=55;I=0-26;II=27-x;III=35-55',
        ]) {
            expect(
                resolveGroupEquivalenceTable(ownValueGroup([equivalenceTable('THA', encoded)])),
            ).toBeNull();
        }
    });

    it('keeps band labels containing the grammar separators intact', () => {
        // `MiStd-` ends in the character the *value* is split on, and `k.h.N.`
        // contains dots. Splitting on the last `=` or on any `-` turns "ReStd+" into a
        // band named "ReStd" with a boundary short by the whole label.
        const { bands } = required(
            resolveGroupEquivalenceTable(ownValueGroup([equivalenceTable('THA', STD_TABLE)])),
        );

        expect(bands.map((band) => band.nameShort)).toEqual([
            'MiStd-',
            'MiStd',
            'ReStd',
            'ReStd+',
            'OptStd',
        ]);
        expect(bands[0]).toEqual({ nameShort: 'MiStd-', minScore: 0, maxScore: 7 });
    });

    it('reports absence rather than picking one when a value group carries several', () => {
        // A group scope is a Testheft-Gruppe and sits exactly one booklet, so
        // several tables on one value group is a broken payload. Cut scores differ per
        // booklet; choosing one would silently draw a band boundary at a score no booklet
        // uses. Absence is rendered as "no threshold presets", which is visible.
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const resolved = resolveGroupEquivalenceTable(
            ownValueGroup([
                equivalenceTable('TH-1', 'maxScore=28;itemCount=28;A1=0-13;A2=14-28'),
                equivalenceTable('TH-2', 'maxScore=35;itemCount=35;A1=0-17;A2=18-35'),
            ]),
        );

        expect(resolved).toBeNull();
        expect(warn).toHaveBeenCalledOnce();
    });

    it('returns null rather than a default when there is no table at all', () => {
        expect(resolveGroupEquivalenceTable(ownValueGroup(null))).toBeNull();
        expect(resolveGroupEquivalenceTable(ownValueGroup([]))).toBeNull();
        expect(
            resolveGroupEquivalenceTable(ownValueGroup([{ key: 'testPeriod', value: '2026' }])),
        ).toBeNull();
        expect(
            resolveGroupEquivalenceTable(ownValueGroup([equivalenceTable('THA', 'maxScore=28')])),
        ).toBeNull();
        expect(resolveGroupEquivalenceTable([])).toBeNull();
    });
});

describe('getCompetenceLevelThresholds', () => {
    it("reports the transitions, excluding the floor band's own zero", () => {
        const resolved = resolveGroupEquivalenceTable(
            ownValueGroup([equivalenceTable('26-V8-EN-TH-2', KS_TABLE)]),
        );

        expect(getCompetenceLevelThresholds(resolved)).toEqual([6, 14, 23, 31, 37]);
    });

    it('stays empty without a table', () => {
        expect(getCompetenceLevelThresholds(null)).toEqual([]);
    });
});
