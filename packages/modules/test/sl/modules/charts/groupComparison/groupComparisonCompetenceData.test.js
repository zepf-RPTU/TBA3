import { describe, it, expect } from 'vitest';
import { buildSubjectDomainList } from '../../../../../src/sl/modules/charts/groupComparison/groupComparisonCompetenceData.js';

/**
 * A group's results in one Fach × Domäne, without students.
 * @param {string} subjectName
 * @param {string} domainId
 * @param {string} domainName
 * @returns {import('../../../../../src/sl/utils/slStudentStats.js').SlDomainResult}
 */
const row = (subjectName, domainId, domainName) => ({
    subjectName,
    domainId,
    domainName,
    groupName: '8a',
    stats: { nrStudents: 0, traitCounts: {}, genderCounts: {}, competenceLevelCounts: {} },
    studentResults: [],
});

describe('buildSubjectDomainList', () => {
    it('dedupes by subjectName|domainId, keeping the first occurrence', () => {
        const list = buildSubjectDomainList([
            row('Deutsch', 'LV', 'Lesen'),
            row('Deutsch', 'LV', 'Lesen (zweite Zeile)'),
            row('Deutsch', 'HV', 'Hören'),
            row('Mathe', 'LV', 'Lesen'),
        ]);

        expect(list.map((sd) => `${sd.subjectName}|${sd.domainId}`)).toEqual([
            'Deutsch|LV',
            'Deutsch|HV',
            'Mathe|LV',
        ]);
        expect(list[0].domainName).toBe('Lesen');
        expect(list[0].results).toHaveLength(2);
    });
});
