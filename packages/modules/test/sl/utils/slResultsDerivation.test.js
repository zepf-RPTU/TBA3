// @vitest-browser
// (the shipped dataset is fetched off the site's public folder, and its scales register
// through the real sanitizer as it lands)

import { describe, it, expect } from 'vitest';

import { SL_DATASETS } from '../../../src/sl/index.js';
import {
    buildGroupResultsFromJson,
    buildSchoolResults,
} from '../../../src/sl/utils/slResultsDerivation.js';
import { createSubjectContext } from '../../support/subjectContext.js';

describe('buildDomainResultsFromJson, through the DOMAIN_RESULTS dataset', () => {
    // The SL group table files each result under its Fach × Domäne without a
    // dedup, so a second result for one group, Fach and Domäne would draw a second bar.
    it('emits one result per group, Fach and Domäne on the shipped dataset', async () => {
        const competenceLevels = await (await fetch('/data/sl/sl/competence-levels.json')).json();
        const results = (
            await createSubjectContext('sl', {
                documents: {
                    'competence-levels.json': competenceLevels,
                },
            })
        ).documents.getDataset(SL_DATASETS.DOMAIN_RESULTS);

        const keys = results.map(
            (result) => `${result.groupName}|${result.subjectName}|${result.domainId}`,
        );
        expect(keys.length).toBeGreaterThan(0);
        expect(new Set(keys).size).toBe(keys.length);
    });
});

describe('buildSchoolResults', () => {
    // The Lerngruppen table paints the school row's bars by `stats.scaleId`: without it a
    // level name two ladders share (`III` in Deutsch and Mathematik) resolves to
    // whichever ladder registered it last, and the school bar takes the other Fach's ramp.
    it("keeps the ladder its groups share, on the shipped dataset's school rows", async () => {
        const competenceLevels = await (await fetch('/data/sl/sl/competence-levels.json')).json();
        const store = (
            await createSubjectContext('sl', {
                documents: {
                    'competence-levels.json': competenceLevels,
                },
            })
        ).documents;
        const domainResults = store.getDataset(SL_DATASETS.DOMAIN_RESULTS);

        const schoolResults = store.getDataset(SL_DATASETS.SCHOOL_RESULTS);
        expect(schoolResults.length).toBeGreaterThan(0);
        for (const school of schoolResults) {
            const group = domainResults.find(
                (result) =>
                    result.subjectName === school.subjectName &&
                    result.domainId === school.domainId,
            );
            expect(school.stats.scaleId).toBeDefined();
            expect(school.stats.scaleId).toBe(group?.stats.scaleId);
        }
    });

    it('names no ladder when its groups disagree on one', () => {
        const groupResult = (/** @type {string} */ groupName, /** @type {string} */ scaleId) => ({
            subjectName: 'Deutsch',
            domainId: 'le',
            domainName: 'Lesen',
            groupName,
            stats: {
                nrStudents: 1,
                traitCounts: {},
                genderCounts: {},
                competenceLevelCounts: {},
                scaleId,
            },
            studentResults: [],
        });

        const [school] = buildSchoolResults([groupResult('8a', 'ks'), groupResult('8b', 'ger')]);
        expect(school.stats.scaleId).toBeUndefined();
    });
});

describe('buildGroupResultsFromJson', () => {
    // Group names carry grade numbers, and a plain string sort puts Klasse 10a above 9a.
    it('orders groups by German collation with digits by value', () => {
        const groups = buildGroupResultsFromJson(
            /** @type {any[]} */ ([{ groupName: '10a' }, { groupName: '9a' }]),
        );

        expect(groups.map(([result]) => result.groupName)).toEqual(['9a', '10a']);
    });
});
