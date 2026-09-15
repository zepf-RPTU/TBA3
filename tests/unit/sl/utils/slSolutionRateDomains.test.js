import { describe, it, expect } from 'vitest';
import { slDataFromStore } from '../../../../src/sl/slDataPort.js';
import { SolutionRateQueries } from '@tba3/modules/sl/utils/slSolutionRates.js';
import { DataStore } from '../../../../src/common/services/dataStore.js';
import { defineSlDatasets } from '../../../../src/sl/slDataService.js';
import { SL_DATA_KEYS } from '../../../../src/sl/slDataKeys.js';

/**
 * How a Lösungsquote finds its item rows.
 *
 * `items.json` and `competence-levels.json` describe the same school in two
 * vocabularies, and the Lösungsquote is the one metric that has to join them: the
 * caller names a subject/domain out of the *aggregates* and the rate is summed over
 * the matching *item* rows. Both halves of that join have gone wrong before, and neither
 * failure was visible —
 * an unmatched join yields no rows, `getSolutionRate` returns null, and the card is
 * simply absent rather than wrong.
 */

const SCHOOL_ID = 'schule';

/** Aggregate row — only there so `detectSchoolId` can name the school. */
const COMPETENCE_LEVELS = [
    {
        id: SCHOOL_ID,
        type: 'school',
        name: 'Testschule',
        subject: { id: null, name: 'Deutsch' },
        domain: { id: 'le', name: 'Lesen' },
        competenceLevels: [],
    },
];

/** @param {{subject: string, domain: {id: string|null, name: string|null}, solved: number, total: number}} spec */
function itemRow({ subject, domain, solved, total }) {
    return {
        id: SCHOOL_ID,
        type: 'school',
        name: 'Testschule',
        subject: { id: null, name: subject },
        domain,
        items: [{ descriptiveStatistics: { total, frequency: solved } }],
    };
}

function helperFor(items) {
    const dataStore = new DataStore();
    defineSlDatasets(dataStore);
    dataStore.setRawData(SL_DATA_KEYS.COMPETENCE_LEVELS, COMPETENCE_LEVELS);
    dataStore.setRawData(SL_DATA_KEYS.ITEMS, items);

    return new SolutionRateQueries({ moduleId: 'test', slData: slDataFromStore(dataStore) });
}

function schoolRate(helper, subjectName, domainId) {
    return helper.getSolutionRate({ target: 'school', subjectName, domainId });
}

describe("getSolutionRate — which field identifies an item row's domain", () => {
    it('matches on domain.id, the key the aggregates are asked for', () => {
        // WHY: the exports put the id in `id` and the human label in `name`
        // (`{ id: 'le', name: 'Lesen' }`), while the caller passes the aggregate's
        // `domain.id` — 'le'. Preferring `name` resolved every export's row to
        // "Lesen"/"Rechtschreibung", which matches no aggregate, so the Lösungsquote
        // was empty on every state export and only on those.
        const helper = helperFor([
            itemRow({
                subject: 'Deutsch',
                domain: { id: 'le', name: 'Lesen' },
                solved: 40,
                total: 100,
            }),
            itemRow({
                subject: 'Deutsch',
                domain: { id: 'rs', name: 'Rechtschreibung' },
                solved: 10,
                total: 100,
            }),
        ]);

        expect(schoolRate(helper, 'Deutsch', 'le')).toBeCloseTo(0.4, 10);
        expect(schoolRate(helper, 'Deutsch', 'rs')).toBeCloseTo(0.1, 10);
        // The label is not an identifier: nothing may reach a row by it.
        expect(schoolRate(helper, 'Deutsch', 'Lesen')).toBeNull();
    });

    it('reads the id only, never the human label beside it', () => {
        // WHY: `domain.name` is prose ("Rechtschreibung") and names no aggregate row, so
        // reading it as a fallback resolved every export's domain to a string nothing
        // compares against. The demo fixture used to invert the shape; it no longer does.
        const helper = helperFor([
            itemRow({
                subject: 'Deutsch',
                domain: { id: null, name: 'Rechtschreibung' },
                solved: 30,
                total: 100,
            }),
        ]);

        expect(schoolRate(helper, 'Deutsch', 'Rechtschreibung')).toBeNull();
    });
});

describe('getSolutionRate — a domain-less subject', () => {
    it('sums every item domain when the aggregates describe the subject as a whole', () => {
        // WHY: the exports carry one `domain: null` Mathematik aggregate row against
        // five item domains (dz/fz/me/rf/za). Read literally, `domainId: null` asks
        // for a domain named null, no item row has one, and Mathematik silently had
        // no Lösungsquote anywhere. `null` means the whole subject — as the tri-state
        // on `#getRowsForSolutionRateSubjectDomain` already documented.
        const helper = helperFor([
            itemRow({
                subject: 'Mathematik',
                domain: { id: 'dz', name: 'Daten und Zufall' },
                solved: 30,
                total: 100,
            }),
            itemRow({
                subject: 'Mathematik',
                domain: { id: 'fz', name: 'Funktionaler Zusammenhang' },
                solved: 20,
                total: 100,
            }),
        ]);

        expect(schoolRate(helper, 'Mathematik', null)).toBeCloseTo(0.25, 10);
    });

    it('keeps the exact match when the payload really does ship a domain-less row', () => {
        // WHY: summing unconditionally would fold sibling domains into a row the
        // payload deliberately kept separate. The fallback is for the case where the
        // literal reading matches *nothing*, not a blanket re-interpretation of null.
        const helper = helperFor([
            itemRow({
                subject: 'Mathematik',
                domain: { id: null, name: null },
                solved: 10,
                total: 100,
            }),
            itemRow({
                subject: 'Mathematik',
                domain: { id: 'dz', name: 'Daten und Zufall' },
                solved: 90,
                total: 100,
            }),
        ]);

        expect(schoolRate(helper, 'Mathematik', null)).toBeCloseTo(0.1, 10);
    });
});
