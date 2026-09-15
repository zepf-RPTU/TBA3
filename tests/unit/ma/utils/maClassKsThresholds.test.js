import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import { resolveClassKsThresholds } from '../../../../src/ma/utils/maClassKsThresholds.js';

const THA = 'maxScore=55;itemCount=55;I=0-26;II=27-34;III=35-41;IV=42-47;V=48-55';
const THB = 'maxScore=52;itemCount=52;I=0-19;II=20-27;III=28-34;IV=35-40;V=41-52';

const table = (bookletId, value) => ({ key: `equivalenceTable:${bookletId}`, value });
const row = (type, properties) => ({ id: `${type}-row`, type, properties });

describe('resolveClassKsThresholds', () => {
    it("reads the thresholds off the class's own group row", () => {
        // WHY: thresholds are level-II+ floors — the numbers a student's distance
        // to the next Kompetenzstufe is measured against.
        const data = [row('group', [table('THA', THA)]), row('school', [])];

        expect(resolveClassKsThresholds(data)).toEqual([27, 35, 42, 48]);
    });

    it('returns null, never [], when the class row ships no table', () => {
        // WHY: classTableModule's preset gate reads `!fallback` — a leaked []
        // is truthy-adjacent the wrong way (![] === false) and would render
        // ±Schwellenwert presets that filter nothing.
        const data = [row('group', [{ key: 'competenceScaleDescription', value: 'x' }])];

        expect(resolveClassKsThresholds(data)).toBeNull();
    });

    it('ignores tables on school and state rows', () => {
        // WHY: comparison rows can sit on another booklet entirely; judging the
        // class against a state row's cut scores draws the boundary in the wrong
        // place with no visible error.
        const data = [row('group', []), row('state', [table('THA', THA)])];

        expect(resolveClassKsThresholds(data)).toBeNull();
    });

    it('stays null for a mixed-booklet class row rather than majority-picking', () => {
        // WHY: cut scores differ per booklet; a class-level pick would judge half
        // of a mixed class against the wrong boundary. The per-student
        // `ksThresholds` own that case.
        const data = [row('group', [table('THA', THA), table('THB', THB)])];

        expect(resolveClassKsThresholds(data)).toBeNull();
    });

    it('returns null when the cut scores are score points, not solved items', () => {
        // WHY: the ±Schwellenwert presets compare `summedResult` — a count of solved items —
        // with these floors. A booklet whose maxScore differs from its itemCount states
        // them in points, and "1 Punkt über Schwellenwert" would pick students by a number
        // on another scale.
        const points =
            'maxScore=31;itemCount=35;studentCount=10;k.h.N.=0-6;KS 1a=7-12;KS 1b=13-18;KS 2=19-31';

        expect(resolveClassKsThresholds([row('group', [table('TH9', points)])])).toBeNull();
    });

    it('returns null when the table does not say how many items the booklet has', () => {
        const noItemCount = 'maxScore=55;I=0-26;II=27-34;III=35-41;IV=42-47;V=48-55';

        expect(resolveClassKsThresholds([row('group', [table('THA', noItemCount)])])).toBeNull();
    });

    it('returns null when there is no group row or no document at all', () => {
        expect(resolveClassKsThresholds(undefined)).toBeNull();
        expect(resolveClassKsThresholds([])).toBeNull();
        expect(resolveClassKsThresholds([row('school', [table('THA', THA)])])).toBeNull();
    });
});

describe('VERA-3 fixture cut scores', () => {
    // WHY: these tables were transcribed from the retired module-local fallback
    // (ASSUMPTION-MA-DEMO-EQUIVALENCE-TABLES, whose threshold numbers are not to
    // change). This pins the transcription and guards against fixture drift.
    it.each([
        ['3a_mid', [27, 35, 42, 48]],
        ['3b_good', [27, 35, 42, 48]],
        ['3c_bad', [20, 28, 35, 41]],
    ])('%s resolves to the transcribed thresholds', (folder, expected) => {
        const data = JSON.parse(
            readFileSync(
                fileURLToPath(
                    new URL(
                        `../../../../public/data/ma/${folder}/competence-levels.json`,
                        import.meta.url,
                    ),
                ),
                'utf8',
            ),
        );

        expect(resolveClassKsThresholds(data)).toEqual(expected);
    });
});
