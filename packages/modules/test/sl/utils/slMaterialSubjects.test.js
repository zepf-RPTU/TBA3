import { describe, it, expect } from 'vitest';
import { deriveMaterialSubjects } from '../../../src/sl/utils/slSubjectConfig.js';
import { competenceValueGroup, SCHOOL_ID } from '../../support/slValueGroupFactories.js';

/**
 * Which subjects the Materialien view offers a button for.
 *
 * The pages are computed from the dataset, so the list is the dataset's own: a fixed one
 * would offer a school that sat only Englisch Deutsch and Mathematik buttons leading to
 * pages with no school-side data behind them, and would leave out a Fach it does not name.
 */
/**
 * The school's value group in one Fach.
 * @param {string} subject
 * @returns {ReturnType<typeof competenceValueGroup>}
 */
const valueGroup = (subject) =>
    competenceValueGroup({
        id: SCHOOL_ID,
        type: 'school',
        name: 'Schule',
        subject,
        levels: { I: 1 },
    });

describe('deriveMaterialSubjects', () => {
    it('offers only the subjects the dataset actually carries', () => {
        expect(deriveMaterialSubjects([valueGroup('Englisch'), valueGroup('Englisch')])).toEqual([
            'Englisch',
        ]);
    });

    it('keeps every Fach in payload order, named as the payload names it', () => {
        // The buttons follow the order the data delivers the subjects in, never a fixed
        // one, and no list of known Fächer narrows them: `sl` ships Französisch.
        expect(
            deriveMaterialSubjects([
                valueGroup('Mathematik'),
                valueGroup('Französisch'),
                valueGroup('Deutsch'),
            ]),
        ).toEqual(['Mathematik', 'Französisch', 'Deutsch']);
    });

    it('does not count a Landesschnitt as a subject the school sat', () => {
        // A state average is appended to the export, not sat by the school, and every page
        // behind these buttons is school-side. An export can ship exactly this shape — a
        // Deutsch and a Mathematik Landesschnitt with no school value group behind either.
        expect(
            deriveMaterialSubjects([
                valueGroup('Englisch'),
                { ...valueGroup('Deutsch'), type: 'state' },
                { ...valueGroup('Mathematik'), type: 'state' },
            ]),
        ).toEqual(['Englisch']);
    });

    it('offers nothing for a dataset without value groups rather than inventing buttons', () => {
        expect(deriveMaterialSubjects([])).toEqual([]);
    });
});
