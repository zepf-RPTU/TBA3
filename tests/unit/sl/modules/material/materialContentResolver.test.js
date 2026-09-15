import { describe, it, expect } from 'vitest';
import { emptySlData } from '@tba3/modules/sl/slData.js';
import { MaterialContentResolver } from '@tba3/modules/sl/modules/material/materialContentResolver.js';

/**
 * Build a single raw student row matching the shape the resolver consumes.
 */
function studentRow({ id, className, gender, subject = 'Mathematik' }) {
    return {
        id,
        subject: { name: subject },
        covariates: [
            { type: 'group', value: className },
            { type: 'gender', value: gender },
        ],
    };
}

describe('MaterialContentResolver student stats', () => {
    it('follows the port: new student rows show up on the next render', () => {
        // WHY: the resolver keeps its student-stats index between renders, keyed on the
        // rows the port answered with. A cache that outlived its rows would keep printing
        // the old head count after the data changed.
        let rows = [
            studentRow({ id: 's1', className: '3a', gender: 'female' }),
            studentRow({ id: 's2', className: '3a', gender: 'male' }),
        ];
        const resolver = new MaterialContentResolver({
            slData: { ...emptySlData(), studentsCompetenceLevels: () => rows },
        });
        const entry = {
            pageKind: 'subjectOverviewTemplate',
            subject: 'Mathematik',
            displayTitle: 'Übersicht',
            subtitle: 'Ihre Schule im Überblick:',
        };

        expect(resolver.renderEntry(entry)).toContain('<td>2 (');

        rows = [...rows, studentRow({ id: 's3', className: '3a', gender: 'female' })];
        expect(resolver.renderEntry(entry)).toContain('<td>3 (');
    });

    it('renders without a data port', () => {
        const resolver = new MaterialContentResolver();
        const entry = {
            pageKind: 'subjectResultSummaryTemplate',
            subject: 'Mathematik',
            displayTitle: 'Ergebnisse',
        };

        // Should not throw without a port: every read answers empty.
        expect(() => resolver.renderEntry(entry)).not.toThrow();
    });
});
