import { describe, it, expect } from 'vitest';
import { buildSubjectDomainList } from '@tba3/modules/sl/modules/charts/groupComparison/groupComparisonDataUtils.js';

const row = (fach, domaene, domaenenbezeichnung, subjectCode) => ({
    fach,
    domaene,
    domaenenbezeichnung,
    subjectCode,
});

describe('buildSubjectDomainList', () => {
    it('returns an empty list for an empty payload', () => {
        expect(buildSubjectDomainList([])).toEqual([]);
    });

    it('maps each Fach/Domäne tuple to its four fields', () => {
        expect(buildSubjectDomainList([row('Deutsch', 'LV', 'Lesen', 'DE')])).toEqual([
            {
                subjectName: 'Deutsch',
                domainId: 'LV',
                domainName: 'Lesen',
                subjectCode: 'DE',
            },
        ]);
    });

    it('dedupes by fach|domaene, keeping the first occurrence', () => {
        const list = buildSubjectDomainList([
            row('Deutsch', 'LV', 'Lesen', 'DE'),
            row('Deutsch', 'LV', 'Lesen (zweite Zeile)', 'DE2'),
            row('Deutsch', 'HV', 'Hören', 'DE'),
            row('Mathe', 'LV', 'Lesen', 'MA'),
        ]);

        expect(list.map((sd) => `${sd.subjectName}|${sd.domainId}`)).toEqual([
            'Deutsch|LV',
            'Deutsch|HV',
            'Mathe|LV',
        ]);
        expect(list[0].domainName).toBe('Lesen');
        expect(list[0].subjectCode).toBe('DE');
    });
});
