/**
 * The fixture slSchoolSummaryMetrics.test.js and schoolSummary.test.js read: an
 * export-shaped school whose value groups the metric functions index themselves.
 */

import { ratesOf, sharesOf } from './slInfoBoxFixture.js';
import {
    SCHOOL_ID,
    STATE_ID,
    competenceValueGroup,
    gerLevels,
    readingValueGroup,
    resultValueGroup,
    romanLevels,
} from './slValueGroupFactories.js';
import { createSubjectContext } from './subjectContext.js';

/**
 * Mirrors the export shape: groups are ragged (only Mathematik has 8d), and
 * Französisch is a fourth subject every metric must cover. Mathematik comes last, as
 * in every fixture.
 *
 * Deutsch: Lesen is sized so a weighted school aggregate (35 %) differs from
 * the mean of the group shares (55 %).
 *
 * A suite that varies the school passes `edit`, which changes the value groups before the store
 * lands them: the store keeps a frozen copy, so a later edit would reach the index the
 * suite builds but not the queries.
 * @param {(competenceLevels: import('./competenceLevelGroups.js').CurrentLevelsValueGroup[]) => void} [edit] - Changes the value groups in place.
 */
export async function buildSummaryMetricsFixture(edit = () => {}) {
    const competenceLevels = [
        // ── Deutsch: Lesen — school value group only defines the school id ──
        readingValueGroup({
            id: SCHOOL_ID,
            type: 'school',
            name: 'Testschule',
            counts: romanLevels([10, 10, 45, 20, 10, 5]),
        }),
        // 8a: 10 students, 8 at ≥ III (80 %); 2 at ≤ I (20 %); 1 at V (10 %)
        readingValueGroup({
            id: '8a-deutsch',
            type: 'group',
            name: '8a',
            counts: romanLevels([1, 1, 0, 4, 3, 1]),
        }),
        // 8b: 90 students, 27 at ≥ III (30 %); 18 at ≤ I (20 %); 4 at V (~4.4 %)
        readingValueGroup({
            id: '8b-deutsch',
            type: 'group',
            name: '8b',
            counts: romanLevels([9, 9, 45, 15, 8, 4]),
        }),

        // ── Englisch: Hören — GER ladder, no 8d ──
        competenceValueGroup({
            id: SCHOOL_ID,
            type: 'school',
            name: 'Testschule',
            subject: 'Englisch',
            domainId: 'ho',
            domainName: 'Hören',
            levels: gerLevels([5, 5, 5, 3, 2]),
        }),
        competenceValueGroup({
            id: '8a-englisch',
            type: 'group',
            name: '8a',
            subject: 'Englisch',
            domainId: 'ho',
            domainName: 'Hören',
            levels: gerLevels([1, 2, 3, 2, 2]),
        }),
        competenceValueGroup({
            id: '8b-englisch',
            type: 'group',
            name: '8b',
            subject: 'Englisch',
            domainId: 'ho',
            domainName: 'Hören',
            levels: gerLevels([4, 3, 2, 1, 0]),
        }),

        // ── Französisch ──
        readingValueGroup({
            id: SCHOOL_ID,
            type: 'school',
            name: 'Testschule',
            subject: 'Französisch',
            counts: gerLevels([1, 1, 1, 1, 1]),
        }),
        readingValueGroup({
            id: '8a-franzoesisch',
            type: 'group',
            name: '8a',
            subject: 'Französisch',
            counts: gerLevels([1, 1, 1, 1, 1]),
        }),

        // ── Mathematik — no domain, and the only subject with an 8d ──
        competenceValueGroup({
            id: SCHOOL_ID,
            type: 'school',
            name: 'Testschule',
            subject: 'Mathematik',
            levels: romanLevels([2, 2, 2, 2, 1, 1]),
        }),
        competenceValueGroup({
            id: '8a-mathe',
            type: 'group',
            name: '8a',
            subject: 'Mathematik',
            levels: romanLevels([1, 0, 1, 1, 1, 1]),
        }),
        competenceValueGroup({
            id: '8d-mathe',
            type: 'group',
            name: '8d',
            subject: 'Mathematik',
            levels: romanLevels([1, 2, 1, 1, 0, 0]),
        }),

        // ── Landesschnitt — must not be treated as a group ──
        readingValueGroup({
            id: STATE_ID,
            type: 'state',
            name: 'Landesschnitt',
            counts: romanLevels([10, 10, 40, 20, 15, 5]),
        }),
    ];

    edit(competenceLevels);

    // The school value group counts both learning groups' responses.
    const aggregation = [
        resultValueGroup({
            id: SCHOOL_ID,
            type: 'school',
            name: 'Testschule',
            subject: 'Deutsch',
            domain: 'le',
            solved: 60,
            total: 200,
        }),
        resultValueGroup({
            id: '8a-deutsch',
            type: 'group',
            name: 'Lerngruppe 8a-deutsch',
            subject: 'Deutsch',
            domain: 'le',
            solved: 40,
            total: 100,
        }),
        resultValueGroup({
            id: '8b-deutsch',
            type: 'group',
            name: 'Lerngruppe 8b-deutsch',
            subject: 'Deutsch',
            domain: 'le',
            solved: 20,
            total: 100,
        }),
    ];

    const context = await createSubjectContext('sl', {
        documents: {
            'competence-levels.json': competenceLevels,
            'aggregations.json': aggregation,
        },
    });
    const dataStore = context.documents;

    // The metrics name their levels through the palette the store populated when
    // `competence-levels.json` landed.
    const { palette } = context;

    const queries = {
        shares: sharesOf(context),
        rates: ratesOf(context),
        palette,
    };

    return { competenceLevels, queries, documents: dataStore, context };
}
