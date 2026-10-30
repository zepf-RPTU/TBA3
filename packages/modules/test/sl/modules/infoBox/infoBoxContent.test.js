import { describe, it, expect, vi } from 'vitest';
import { resolveInfoBox } from '../../../../src/sl/modules/infoBox/infoBoxContent.js';
import { buildCompetenceValueGroups } from '../../../support/slInfoBoxFixture.js';
import {
    SCHOOL_ID,
    competenceValueGroup,
    romanLevels,
    studentValueGroup,
} from '../../../support/slValueGroupFactories.js';
import { createSubjectContext } from '../../../support/subjectContext.js';

/**
 * What a box says, over small `info-boxes.json` documents and the fixture school: which
 * box and section a host's data names, and each section's entries with its placeholders,
 * repeat blocks and material links resolved against the store.
 */

/** @typedef {import('../../../../src/sl/modules/infoBox/infoBoxContent.js').InfoBoxEntry} InfoBoxEntry */
/** @typedef {import('../../../../src/sl/modules/infoBox/infoBoxContent.js').PlaceholderInput} PlaceholderInput */

const META = {
    locale: 'de-DE',
    materialLinkLabel: '{{type}}: {{subject}} im Material anzeigen',
    quotedLabel: '„{{label}}“',
};

const INFO_BOXES = {
    meta: META,
    sectionTypes: {
        general: { icon: 'stars', tooltip: 'Allgemein' },
        praise: { icon: 'trophy', tooltip: 'Lob', materialLinkSubjectMode: 'best' },
    },
    boxes: {
        vergleich: {
            sections: [
                {
                    type: 'general',
                    blocks: [
                        'Gruppe 1: {{summary(namespace=comparison, entity=group1, field=label)}}',
                        'SW: {{summary(namespace=selfEfficacy, field=groupMeanDifference, format=decimal)}}',
                    ],
                },
            ],
        },
        demo: {
            sections: [
                { type: 'general', blocks: ['Allgemein-Text'] },
                { type: 'praise', blocks: ['Lob-Text'] },
            ],
        },
        // A link block naming no Fach: the section's ranking mode names it, the type's
        // unless the section overrides it.
        links: {
            sections: [
                {
                    type: 'praise',
                    blocks: [{ type: 'link', material: 'Übersicht', subject: 'Fach' }],
                },
                {
                    type: 'general',
                    materialLinkSubjectMode: 'worst',
                    blocks: [{ type: 'link', material: 'Übersicht', subject: 'Fach' }],
                },
            ],
        },
    },
};

/**
 * The box's content over a store holding the value groups and the box texts.
 * @param {object} request
 * @param {string|null} [request.boxKey]
 * @param {string|null} [request.sectionKey]
 * @param {PlaceholderInput} [request.placeholderContext]
 * @param {object} [payload]
 * @param {unknown[]} [payload.competenceLevels]
 * @param {unknown} [payload.infoBoxes]
 * @returns {Promise<{content: ReturnType<typeof resolveInfoBox>, warn: import('vitest').Mock}>}
 */
async function resolve(
    { boxKey = null, sectionKey = null, placeholderContext = {} },
    { competenceLevels = buildCompetenceValueGroups(), infoBoxes = INFO_BOXES } = {},
) {
    const context = await createSubjectContext('sl', {
        documents: {
            'competence-levels.json': /** @type {any} */ (competenceLevels),
            'info-boxes.json': /** @type {any} */ (infoBoxes),
        },
    });
    const warn = vi.fn();
    const content = resolveInfoBox(context, {
        boxKey,
        sectionKey,
        placeholderContext,
        onOpenMaterial: async () => {},
        warn,
    });
    return { content, warn };
}

/**
 * Each text entry as it reads, whitespace collapsed.
 * @param {InfoBoxEntry[]} entries
 * @returns {string[]}
 */
const textsOf = (entries) =>
    entries.flatMap((entry) =>
        entry.type === 'text'
            ? [
                  entry.segments
                      .map((segment) =>
                          'text' in segment
                              ? segment.text
                              : segment.runs.map((run) => run.text).join(''),
                      )
                      .join('')
                      .replace(/\s+/g, ' ')
                      .trim(),
              ]
            : [],
    );

describe('which box, and which section', () => {
    it('shows nothing, silently, while no box is named', async () => {
        // The comparison view has nothing to say until its chart reports; that is a
        // state, not a defect.
        const { content, warn } = await resolve({});

        expect(content).toBeNull();
        expect(warn).not.toHaveBeenCalled();
    });

    it('shows nothing, and warns, for a box key the document does not have', async () => {
        const { content, warn } = await resolve({ boxKey: 'gibtEsNicht' });

        expect(content).toBeNull();
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('"gibtEsNicht"'));
    });

    it('keeps the section shown last while the box has it, else shows its first', async () => {
        const praise = (await resolve({ boxKey: 'demo', sectionKey: 'praise' })).content;
        expect(praise?.activeSection).toBe('praise');
        expect(textsOf(praise?.entries ?? [])).toEqual(['Lob-Text']);

        const gone = (await resolve({ boxKey: 'demo', sectionKey: 'alarm' })).content;
        expect(gone?.activeSection).toBe('general');
        expect(textsOf(gone?.entries ?? [])).toEqual(['Allgemein-Text']);

        expect(praise?.sections).toEqual([
            { key: 'general', icon: 'stars', tooltipText: 'Allgemein' },
            { key: 'praise', icon: 'trophy', tooltipText: 'Lob' },
        ]);
    });
});

describe('summaries from the store', () => {
    it('summarises the comparison selection the payload names and drops a figure the data lacks', async () => {
        // The box computes the figures itself from the selection; a host hands it no
        // numbers. The group label comes from the selection's `group1`; the fixture
        // school has no Selbstwirksamkeit, so that block falls away.
        const { content } = await resolve({
            boxKey: 'vergleich',
            placeholderContext: {
                comparison: {
                    chartType: 'competenceLevel',
                    subjectIndex: 0,
                    category: 'gender',
                    scopeFilter: null,
                    group1: 'female',
                    group2: 'male',
                },
            },
        });

        expect(textsOf(content?.entries ?? [])).toEqual(['Gruppe 1: Weiblich']);
    });

    it('says nothing of a comparison without a selection', async () => {
        const { content } = await resolve({ boxKey: 'vergleich' });

        expect(textsOf(content?.entries ?? [])).toEqual([]);
    });
});

describe('material links', () => {
    it("rank the school's Fächer by the section's own mode, else by its type's", async () => {
        // The fixture school's highest share at or above the Regelstandard is Englisch's,
        // its lowest Deutsch's.
        const labelsOf = async (/** @type {string} */ sectionKey) =>
            (await resolve({ boxKey: 'links', sectionKey })).content?.entries.flatMap((entry) =>
                entry.type === 'links' ? entry.links.map((link) => link.label) : [],
            );

        expect(await labelsOf('praise')).toEqual(['Übersicht: Englisch im Material anzeigen']);
        expect(await labelsOf('general')).toEqual(['Übersicht: Deutsch im Material anzeigen']);
    });
});

describe('the Fach box speaks of each of its Domänen', () => {
    /** The shipped texts: the Fach box's per-Domäne sentence is a `domains` repeat there. */
    const SHIPPED_INFO_BOXES = Object.values(
        import.meta.glob('/public/data/sl/info-boxes.json', { eager: true, import: 'default' }),
    )[0];

    /**
     * One Domäne of a Fach as the school's and its two Lerngruppen's value groups: 8a at
     * 50 %, 8b at 20 % on the Regelstandard or higher, so the Lerngruppen pool to 35 %.
     * @param {string} subject
     * @param {string|null} domainId - `null` for a Fach measured as a whole.
     * @param {string|null} domainName
     * @returns {ReturnType<typeof competenceValueGroup>[]}
     */
    const domainValueGroups = (subject, domainId, domainName) => {
        const domain = { subject, domainId, domainName };
        return [
            competenceValueGroup({
                id: SCHOOL_ID,
                type: 'school',
                name: 'Testschule',
                ...domain,
                levels: romanLevels([0, 0, 13, 7, 0, 0]),
            }),
            competenceValueGroup({
                id: `8a-${subject}-${domainId}`,
                type: 'group',
                name: '8a',
                ...domain,
                levels: romanLevels([0, 0, 5, 5, 0, 0]),
            }),
            competenceValueGroup({
                id: `8b-${subject}-${domainId}`,
                type: 'group',
                name: '8b',
                ...domain,
                levels: romanLevels([0, 0, 8, 2, 0, 0]),
            }),
        ];
    };

    /**
     * The shipped Fach box for `subjectName` over a school whose Deutsch sat four
     * Domänen, its Französisch one and its Mathematik none.
     * @param {string} subjectName
     * @returns {Promise<{sentences: Array<{text: string, glossaryKey: string|null}>, warn: import('vitest').Mock}>} The per-Domäne sentences of the first section, and the warnings.
     */
    async function subjectBoxSentences(subjectName) {
        const { content, warn } = await resolve(
            { boxKey: 'detailsSubjectSpecific', placeholderContext: { subjectName } },
            {
                competenceLevels: [
                    // Payload order, which is neither alphabetical nor Lesen first.
                    ...domainValueGroups('Deutsch', 'sp', 'Sprachgebrauch'),
                    ...domainValueGroups('Deutsch', 'le', 'Lesen'),
                    ...domainValueGroups('Deutsch', 'ho', 'Hören'),
                    ...domainValueGroups('Deutsch', 'rs', 'Orthografie'),
                    // A student row carries no Domäne; it is none of Deutsch's Domänen.
                    studentValueGroup({
                        id: 's1',
                        subject: 'Deutsch',
                        groupName: '8a',
                        level: 'III',
                    }),
                    ...domainValueGroups('Französisch', 'le', 'Lesen'),
                    ...domainValueGroups('Mathematik', null, null),
                ],
                infoBoxes: SHIPPED_INFO_BOXES,
            },
        );
        const entries = (content?.entries ?? []).filter((entry) => entry.type === 'text');
        const sentences = entries.flatMap((entry, index) => {
            const text = textsOf([entry])[0];
            if (!text.startsWith('Bei ')) return [];
            const runs = entries[index].segments.flatMap((segment) =>
                'runs' in segment ? segment.runs : [],
            );
            return [
                { text, glossaryKey: runs.find((run) => run.glossaryKey)?.glossaryKey ?? null },
            ];
        });
        return { sentences, warn };
    }

    it('says one sentence per Domäne, however many, in payload order, each Domäne linked', async () => {
        // The template once named the first and the second Domäne only: a school that sat
        // four Deutsch Domänen never read about its third and fourth.
        const { sentences, warn } = await subjectBoxSentences('Deutsch');

        expect(sentences).toEqual([
            {
                text: 'Bei Sprachgebrauch betragen diese Werte 35,0 % und 20,0 %–50,0 %.',
                glossaryKey: 'sprachgebrauch',
            },
            {
                text: 'Bei Lesen betragen diese Werte 35,0 % und 20,0 %–50,0 %.',
                glossaryKey: 'lesen',
            },
            {
                text: 'Bei Hören betragen diese Werte 35,0 % und 20,0 %–50,0 %.',
                glossaryKey: 'hören-deutsch',
            },
            {
                text: 'Bei Orthografie betragen diese Werte 35,0 % und 20,0 %–50,0 %.',
                glossaryKey: 'orthografie',
            },
        ]);
        expect(warn).not.toHaveBeenCalled();
    });

    it('says one sentence for a Fach with one Domäne, and none for a Fach without, silently', async () => {
        // A missing second Domäne is no defect: the box drops nothing and warns about nothing.
        const french = await subjectBoxSentences('Französisch');
        expect(french.sentences).toEqual([
            {
                text: 'Bei Lesen betragen diese Werte 35,0 % und 20,0 %–50,0 %.',
                glossaryKey: 'leseverstehen',
            },
        ]);
        expect(french.warn).not.toHaveBeenCalled();

        const maths = await subjectBoxSentences('Mathematik');
        expect(maths.sentences).toEqual([]);
        expect(maths.warn).not.toHaveBeenCalled();
    });
});
