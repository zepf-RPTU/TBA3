/**
 * The detail chart keeps the payload's order of Fächer and Domänen on its x axis and in
 * its bar slots; it never sorts them by name. Each row carries its Domäne's payload
 * position, which no alphabetical order matches.
 */

import { describe, expect, it } from 'vitest';
import {
    detailXDomain,
    getGroupingConfig,
} from '../../../../../../src/sl/modules/charts/competence/detail/competenceDetailGrouping.js';

/** Payload order: Mathematik before Deutsch, Deutsch's Zuhören before its Lesen. */
const DOMAINS = [
    { subject: 'Mathematik', domain: '', domainLabel: '', subjectDomainCount: 1 },
    { subject: 'Deutsch', domain: 'zh', domainLabel: 'Zuhören', subjectDomainCount: 2 },
    { subject: 'Deutsch', domain: 'le', domainLabel: 'Lesen', subjectDomainCount: 2 },
].map((context, domainIndex) => ({
    ...context,
    displayDomainLabel: context.domainLabel,
    domainIndex,
}));

/**
 * One row per Domäne for a name, in payload order.
 * @param {string} name
 * @param {string} type - Also the rows' `renderKey`.
 * @returns {any[]}
 */
function rowsFor(name, type) {
    return DOMAINS.map((context) => ({ ...context, name, type, renderKey: type }));
}

describe('competence detail order', () => {
    it('puts the Fächer on the x axis in payload order', () => {
        // The Schule card: the school's rows only, several Fächer.
        const chartData = rowsFor('Schule', 'school');
        const grouping = getGroupingConfig(chartData, null);

        expect(grouping.groupBySubject).toBe(true);
        expect(detailXDomain(chartData, grouping)).toEqual(['Mathematik', 'Deutsch']);
    });

    it('keeps the Domänen of a Fach in payload order', () => {
        const chartData = rowsFor('Schule', 'school');
        const grouping = getGroupingConfig(chartData, null);

        expect(grouping.groupBySubject && grouping.subjectDomainOrder.Deutsch).toEqual([
            'zh',
            'le',
        ]);
    });

    it('keeps payload order when the first group by name lacks the first Fach', () => {
        // Rows are sorted by type and name, so 8a's rows come first. Had the order
        // been read off the first rows, Mathematik, which 8a did not sit, would move
        // behind Deutsch for every group.
        const without = rowsFor('8a', 'group').filter((row) => row.subject !== 'Mathematik');
        const chartData = [...without, ...rowsFor('8b', 'group'), ...rowsFor('Schule', 'school')];
        const grouping = getGroupingConfig(chartData, null);

        expect(grouping.subScaleDomain).toEqual([
            'Mathematik|',
            'Deutsch|Zuhören',
            'Deutsch|Lesen',
        ]);

        const subjectView = [...without, ...rowsFor('Schule', 'school')];
        const bySubject = getGroupingConfig(subjectView, '8a');
        expect(bySubject.groupBySubject).toBe(true);
        expect(detailXDomain(subjectView, bySubject)).toEqual(['Mathematik', 'Deutsch']);
    });
});
