// @vitest-browser
// (rating colours register their palette tokens on <html>)
/**
 * The detail legend names its flat Fach/Domäne pills after what they are: a Fach with one
 * Domäne gets a Fach pill, a Fach's several Domänen get Domäne pills. Its Q pill sits where
 * the bar visibility reads it.
 */

import { describe, expect, it } from 'vitest';
import { buildDetailKey } from '../../../../../../src/sl/modules/charts/competence/detail/competenceDetailLegend.js';
import { getGroupingConfig } from '../../../../../../src/sl/modules/charts/competence/detail/competenceDetailGrouping.js';
import { createTestContext } from '../../../../../support/glossaryFixture.js';

/** @typedef {import('../../../../../../src/sl/modules/charts/competence/detail/competenceDetailRenderer.js').DetailModel} DetailModel */

/**
 * Rows of two Lerngruppen and the school over the given Domänen, in payload order.
 * @param {Array<{subject: string, domain: string, domainLabel: string}>} domains - Fach × Domäne.
 * @returns {any[]}
 */
function rowsOver(domains) {
    const counts = new Map();
    domains.forEach(({ subject }) => counts.set(subject, (counts.get(subject) ?? 0) + 1));
    const contexts = domains.map((context, domainIndex) => ({
        ...context,
        displayDomainLabel: context.domainLabel.slice(0, 2).toUpperCase(),
        subjectDomainCount: counts.get(context.subject),
        domainIndex,
    }));
    return [
        ['8a', 'group'],
        ['8b', 'group'],
        ['Schule', 'school'],
    ].flatMap(([name, type]) =>
        contexts.map((context) => ({ ...context, name, type, renderKey: type })),
    );
}

/**
 * The key blocks the detail chart shows for the given rows.
 * @param {any[]} chartData
 * @param {boolean} [hasTeachingQuality]
 * @param {string|null} [groupName] - The group of the Lerngruppenansicht.
 * @param {boolean} [averagesHidden]
 * @returns {import('../../../../../../src/common/charts/legend/htmlLegendPanel.js').ChartKey}
 */
function sectionsFor(
    chartData,
    hasTeachingQuality = false,
    groupName = null,
    averagesHidden = false,
) {
    const { palette, glossary } = createTestContext('sl');
    // The legend reads these four fields of the model; the rest is the renderer's.
    const model = /** @type {DetailModel} */ (
        /** @type {unknown} */ ({
            chartData,
            groupingConfig: getGroupingConfig(chartData, groupName),
            hasTeachingQuality,
            levels: { competenceLevelNames: [] },
        })
    );
    return buildDetailKey(palette, glossary, model, { boxPlot: false, averagesHidden });
}

/**
 * The heading of the flat Fach/Domäne section.
 * @param {any[]} chartData
 * @returns {string|undefined}
 */
function flatHeading(chartData) {
    return sectionsFor(chartData).find((section) => section.group === 'domain')?.title;
}

const MATHE = { subject: 'Mathematik', domain: '', domainLabel: '' };
const ENGLISCH = { subject: 'Englisch', domain: '', domainLabel: '' };
const ZUHOEREN = { subject: 'Deutsch', domain: 'zh', domainLabel: 'Zuhören' };
const LESEN = { subject: 'Deutsch', domain: 'le', domainLabel: 'Lesen' };

describe('the detail legend heads its Fach/Domäne pills by what they name', () => {
    // Headed by count, the section would say `Domänen` over a Fach pill and
    // `Legende` over two Fächer.
    it('says Fächer over Fach pills only', () => {
        expect(flatHeading(rowsOver([MATHE, ENGLISCH]))).toBe('Fächer');
    });

    it('says Domänen over Domäne pills only', () => {
        expect(flatHeading(rowsOver([ZUHOEREN, LESEN]))).toBe('Domänen');
    });

    it('says Bereiche over both', () => {
        expect(flatHeading(rowsOver([MATHE, ZUHOEREN, LESEN]))).toBe('Bereiche');
    });
});

const SCHOOL_ONLY_ROWS = [
    { ...MATHE, name: 'Schule', type: 'school', renderKey: 'school' },
    { ...MATHE, name: 'Land', type: 'comparison', renderKey: 'land', comparisonType: 'state' },
].map((row) => ({ ...row, displayDomainLabel: '', subjectDomainCount: 1, domainIndex: 0 }));

/**
 * The Vergleich pills' keys that start off.
 * @param {import('../../../../../../src/common/charts/legend/htmlLegendPanel.js').ChartKey} sections
 * @returns {Array<string|undefined>}
 */
const hiddenComparisonKeys = (sections) =>
    (sections.find((section) => section.group === 'comparison')?.items ?? [])
        .filter((item) => item.initiallyHidden)
        .map((item) => item.key);

describe('the detail legend in the school-only view', () => {
    // The school and each comparison are the x-axis groups there; without pills
    // a viewer could not hide the Landesschnitt.
    it('gives the school and each comparison a Vergleich pill', () => {
        const comparison = sectionsFor(SCHOOL_ONLY_ROWS).find(
            (section) => section.group === 'comparison',
        );

        expect(comparison?.items?.map((item) => item.key)).toEqual(['land', 'school']);
    });

    // The school is what the chart shows there, not an average beside it.
    it('starts only the comparisons off when the averages start hidden', () => {
        expect(hiddenComparisonKeys(sectionsFor(SCHOOL_ONLY_ROWS, false, null, true))).toEqual([
            'land',
        ]);
    });
});

describe('the detail legend of a group with one Fach', () => {
    const rows = [
        ...rowsOver([MATHE]).filter((row) => row.name !== '8b'),
        ...SCHOOL_ONLY_ROWS.filter((row) => row.type === 'comparison'),
    ];

    // Grouped by Domäne, the school and the comparisons are slots beside the group's
    // bar; without pills a viewer could not hide them.
    it('gives the school and each comparison a Vergleich pill', () => {
        const comparison = sectionsFor(rows, false, '8a').find(
            (section) => section.group === 'comparison',
        );

        expect(comparison?.items?.map((item) => item.key)).toEqual(['land', 'school']);
    });

    it('starts every average off when the averages start hidden', () => {
        expect(hiddenComparisonKeys(sectionsFor(rows, false, '8a'))).toEqual([]);
        expect(hiddenComparisonKeys(sectionsFor(rows, false, '8a', true))).toEqual([
            'land',
            'school',
        ]);
    });
});

describe('the detail legend places the Unterrichtsqualität pill beside its slot siblings', () => {
    /**
     * The keys of each section's pills, by section group.
     * @param {any[]} chartData
     * @param {string|null} [groupName] - The group of the Lerngruppenansicht.
     * @returns {{[group: string]: string[]}}
     */
    const pillKeys = (chartData, groupName = null) =>
        Object.fromEntries(
            sectionsFor(chartData, true, groupName).map((section) => [
                section.group,
                (section.items ?? []).map((item) => item.key),
            ]),
        );

    // Grouped by group, Q is a slot beside the Domänen inside each group.
    it('lists it after the Domänen when grouped by group', () => {
        const keys = pillKeys(rowsOver([ZUHOEREN, LESEN]));

        expect(keys.domain?.at(-1)).toBe('teachingQuality');
        expect(keys.comparison ?? []).not.toContain('teachingQuality');
    });

    // Hiding the lone Domäne leaves Q, so it gets a pill too.
    it('gives a lone Domäne a pill beside it', () => {
        expect(pillKeys(rowsOver([LESEN])).domain).toHaveLength(2);
    });

    // Grouped by Domäne or by Fach, Q is a slot beside the track bars.
    it('keeps it under Vergleich when grouped by Domäne', () => {
        const rows = rowsOver([ZUHOEREN, LESEN]).filter((row) => row.name !== '8b');

        expect(pillKeys(rows, '8a').comparison).toEqual(['school', 'teachingQuality']);
    });

    it('keeps it under Vergleich when grouped by Fach', () => {
        const rows = rowsOver([MATHE, ENGLISCH]).filter((row) => row.name !== '8b');

        expect(pillKeys(rows).comparison).toContain('teachingQuality');
    });
});

describe('the detail legend grouped by Fach', () => {
    // One pill per Fach, never per Domäne: a Domäne pill each would outgrow the panel.
    it('gives each Fach one pill, however many Domänen it carries', () => {
        const rows = rowsOver([MATHE, ZUHOEREN, LESEN]).filter((row) => row.name !== '8b');
        const sections = sectionsFor(rows, false, '8a');
        const fach = sections.find((section) => section.group === 'subject');

        expect(fach?.title).toBe('Fächer');
        expect(fach?.items?.map((item) => item.key)).toEqual(['Mathematik', 'Deutsch']);
        expect(sections.some((section) => section.group === 'domain')).toBe(false);
    });
});

describe('the detail legend links each Domäne pill to the entry of its Fach', () => {
    // `Lesen` is a Domäne of Deutsch and of Englisch: the name cannot say which entry.
    it('keys a Domäne by its id and Fach, a Fach pill by nothing', () => {
        const rows = rowsOver([
            MATHE,
            LESEN,
            { subject: 'Deutsch', domain: 'rs', domainLabel: 'Orthografie' },
            { subject: 'Englisch', domain: 'ho', domainLabel: 'Hören' },
            { subject: 'Englisch', domain: 'le', domainLabel: 'Lesen' },
        ]);
        const linked = sectionsFor(rows)
            .flatMap((section) => section.items ?? [])
            .filter((item) => 'labelSegments' in item && item.labelSegments)
            .map((item) => [item.label, item.labelSegments?.at(-1)?.glossaryKey ?? null]);

        expect(linked).toEqual(
            expect.arrayContaining([
                ['M = Mathematik', null],
                ['LE = Lesen', 'lesen'],
                ['OR = Orthografie', 'orthografie'],
                ['HÖ = Hören', 'hörverstehen'],
                ['LE = Lesen', 'leseverstehen'],
            ]),
        );
    });
});
