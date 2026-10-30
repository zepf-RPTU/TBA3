import { describe, it, expect } from 'vitest';
import { buildCompetenceLevelIndex } from '../../../src/sl/slCompetenceLevelIndex.js';
import { groupBooklets, hasMixedBooklets, readBooklets } from '../../../src/sl/utils/slBooklets.js';
import {
    DEUTSCH_BOOKLETS,
    competenceValueGroup,
    domainBookletSubject,
    twoBookletSubject,
    withBooklet,
} from '../../support/slValueGroupFactories.js';

/**
 * A value group of one type in a Fach, on the default booklet.
 * @param {string} id - Its id, its name too.
 * @param {string} type - `school`, `state` or `group`.
 * @param {string} [subject]
 * @returns {ReturnType<typeof competenceValueGroup>}
 */
const valueGroup = (id, type, subject = 'Deutsch') =>
    competenceValueGroup({ id, type, name: id, subject, levels: { III: 1 } });

describe('readBooklets', () => {
    it('splits a pooled value group into its booklets, dropping blanks', () => {
        expect(readBooklets(withBooklet(valueGroup('8a', 'group'), ' a , b,,'))).toEqual([
            'a',
            'b',
        ]);
    });
});

describe('hasMixedBooklets', () => {
    it('unites the school, the groups and the comparisons of one Fach', () => {
        const index = buildCompetenceLevelIndex([
            ...twoBookletSubject(),
            withBooklet(valueGroup('8a', 'group', 'Englisch'), '26-V8-EN-TH-1'),
        ]);

        expect([...(index.bookletsBySubject.get('Deutsch') ?? [])].sort()).toEqual([
            ...DEUTSCH_BOOKLETS,
        ]);
        expect(hasMixedBooklets(index, 'Deutsch', null)).toBe(true);
        expect(hasMixedBooklets(index, 'Englisch', null)).toBe(false);
    });

    it('counts a Landesschnitt pooled over booklets the school did not all sit', () => {
        const index = buildCompetenceLevelIndex([
            withBooklet(valueGroup('schule', 'school'), DEUTSCH_BOOKLETS[0]),
            withBooklet(valueGroup('state', 'state'), DEUTSCH_BOOKLETS.join(',')),
        ]);

        expect(hasMixedBooklets(index, 'Deutsch', null)).toBe(true);
    });
});

describe('hasMixedBooklets — booklets that cover some Domänen of a Fach', () => {
    // NW: one Deutsch booklet holds Lesen with Rechtschreibung, another Lesen with
    // Sprachgebrauch. Rechtschreibung and Sprachgebrauch were each sat in one booklet,
    // and their rates compare; Lesen and the whole Fach were sat in two.
    const index = buildCompetenceLevelIndex(domainBookletSubject().competenceLevels);

    it('counts the booklets a Domäne was sat in', () => {
        expect(hasMixedBooklets(index, 'Deutsch', 'le')).toBe(true);
        expect(hasMixedBooklets(index, 'Deutsch', 'rs')).toBe(false);
        expect(hasMixedBooklets(index, 'Deutsch', 'sp')).toBe(false);
    });

    it('counts every booklet of the Fach for a rate over the whole Fach', () => {
        expect(hasMixedBooklets(index, 'Deutsch', null)).toBe(true);
    });

    it("names a group's booklets in one Domäne or the whole Fach", () => {
        const [first, second] = DEUTSCH_BOOKLETS;

        expect(groupBooklets(index, '8a', 'Deutsch', 'rs')).toEqual([first]);
        expect(groupBooklets(index, '8b', 'Deutsch', 'rs')).toEqual([]);
        expect(groupBooklets(index, '8b', 'Deutsch', null)).toEqual([second]);
    });
});

describe('groupBooklets', () => {
    it("names one group's booklets in one Fach", () => {
        const index = buildCompetenceLevelIndex(twoBookletSubject());

        expect(groupBooklets(index, '8b', 'Deutsch', null)).toEqual([DEUTSCH_BOOKLETS[1]]);
        expect(groupBooklets(index, '8b', 'Englisch', null)).toEqual([]);
        expect(groupBooklets(index, 'unbekannt', 'Deutsch', null)).toEqual([]);
    });
});
