import { describe, expect, it } from 'vitest';
import {
    domainListRuns,
    subjectDomainLabelRuns,
} from '../../../src/common/charts/domainLabelFormatter.js';
import { createTestContext } from '../../support/glossaryFixture.js';

/**
 * A Domäne's name is never matched as a term: `Lesen` is a Domäne of Deutsch, Englisch
 * and Französisch. The runs carry the entry for that Domäne of that Fach instead.
 */

describe('subjectDomainLabelRuns', () => {
    const { glossary } = createTestContext('sl');

    it('keeps the Fach plain and links the Domäne by its id and Fach', () => {
        expect(subjectDomainLabelRuns(glossary, 'Deutsch', 'le', 'Lesen')).toEqual([
            { text: 'Deutsch: ', glossaryKey: null },
            { text: 'Lesen', glossaryKey: 'lesen' },
        ]);
        expect(subjectDomainLabelRuns(glossary, 'Englisch', 'le', 'Lesen')).toEqual([
            { text: 'Englisch: ', glossaryKey: null },
            { text: 'Lesen', glossaryKey: 'leseverstehen' },
        ]);
    });

    it('is the Fach alone for a Fach shown without a Domäne', () => {
        expect(subjectDomainLabelRuns(glossary, 'Mathematik', null, null)).toEqual([
            { text: 'Mathematik', glossaryKey: null },
        ]);
    });
});

describe('domainListRuns', () => {
    const { glossary } = createTestContext('sl');

    it('joins the Domänen the German way, each linked to the entry of its Fach', () => {
        expect(
            domainListRuns(glossary, 'Französisch', [
                { domainId: 'ho', domainName: 'Hören' },
                { domainId: 'le', domainName: 'Lesen' },
            ]),
        ).toEqual([
            { text: 'Hören', glossaryKey: 'hörverstehen' },
            { text: ' und ', glossaryKey: null },
            { text: 'Lesen', glossaryKey: 'leseverstehen' },
        ]);
        expect(
            domainListRuns(glossary, 'Deutsch', [
                { domainId: 'le', domainName: 'Lesen' },
                { domainId: 'zh', domainName: 'Zuhören' },
                { domainId: 'rs', domainName: 'Orthografie' },
            ]).map((run) => run.text),
        ).toEqual(['Lesen', ', ', 'Zuhören', ' und ', 'Orthografie']);
    });

    it('is empty for a Fach without a named Domäne', () => {
        expect(
            domainListRuns(glossary, 'Mathematik', [{ domainId: null, domainName: null }]),
        ).toEqual([]);
    });
});
