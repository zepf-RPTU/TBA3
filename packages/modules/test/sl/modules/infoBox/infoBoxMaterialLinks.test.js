import { beforeAll, describe, it, expect, vi } from 'vitest';

import { createMaterialSectionLinks } from '../../../../src/sl/modules/infoBox/infoBoxLinks.js';
import { BOOKLET_PROPERTY } from '../../../support/competenceLevelGroups.js';
import { GER_LEVELS, scaleValueGroup } from '../../../support/competenceScaleFixture.js';
import { sharesOf, slContextFor } from '../../../support/slInfoBoxFixture.js';
import { required } from '../../../support/required.js';

/**
 * The `Übersicht`/`Fach` material links resolve "Fach" from the data when the info box
 * does not name one: the school's best or weakest subject, ranked by the same `ge_medium`
 * share (`CompetenceShareQueries.getSubjectCompetenceShare`) the box sentences print.
 *
 * That ranking is only meaningful for a scale that tags its standards. An export may
 * measure Englisch on a GER ladder that tags none, and a share the scale cannot express
 * is unknown, not 0 %.
 */

/** A ladder that names its standards, lowest first. */
const NAMED_LADDER = [
    { nameShort: 'MiStd-', name: 'unter Mindeststandard' },
    { nameShort: 'MiStd', name: 'Mindeststandard' },
    { nameShort: 'ReStd', name: 'Regelstandard' },
    { nameShort: 'ReStd+', name: 'Regelstandard plus' },
    { nameShort: 'OptStd', name: 'Optimalstandard' },
];

/** The GER ladder as a state export ships it: `name` mirrors `nameShort`. */
const GER_LADDER = GER_LEVELS.map((nameShort) => ({
    nameShort,
    name: nameShort,
}));

/**
 * One school value group. `frequencies` is per level, lowest first.
 * @param {string} subjectName
 * @param {Array<{nameShort: string, name: string}>} ladder
 * @param {number[]} frequencies
 * @param {number} [total] - Students in the value-group; defaults to those with a level.
 */
function schoolValueGroup(
    subjectName,
    ladder,
    frequencies,
    total = frequencies.reduce((sum, frequency) => sum + frequency, 0),
) {
    // The standard band travels as a value-group property, the way the export ships it — the client
    // derives nothing from `name`. `GER_LADDER` names no standard, so it gets no keys
    // and stays the unrankable scale these cases are about.
    const { properties, competenceLevels } = scaleValueGroup(ladder);

    return {
        id: 'group-1',
        // A school-wide ranking pools the groups, so the fixture is one group.
        type: 'group',
        name: '8a',
        subject: { name: subjectName },
        domain: { id: 'le', name: 'Lesen' },
        properties,
        competenceLevels: competenceLevels.map((level, index) => {
            const frequency = frequencies[index] ?? 0;
            return {
                ...level,
                descriptiveStatistics: { total, frequency, mean: total ? frequency / total : 0 },
            };
        }),
    };
}

/**
 * A school context over the group value groups plus the school value group the ranking needs to find a
 * school, the value groups' scales registered on its palette.
 * @param {import('../../../support/competenceLevelGroups.js').CurrentLevelsValueGroup[]} valueGroups
 * @returns {Promise<import('../../../../src/common/context/index.js').ModuleContext>}
 */
async function schoolContext(valueGroups) {
    return slContextFor({
        competenceLevels: [
            {
                id: 'school-1',
                type: 'school',
                name: 'Gaußschule II',
                properties: [BOOKLET_PROPERTY],
                competenceLevels: [],
            },
            ...valueGroups,
        ],
    });
}

/** The label template `info-boxes.json` carries in `meta.materialLinkLabel`. */
const LABEL = '{{type}}: {{subject}} im Material anzeigen';

/**
 * Enough wiring for a link to be actionable. Passed even where the assertion is about
 * labels or a disabled link, so that "disabled" keeps meaning "the material view has no
 * such page" rather than "this link was built without an app".
 */
const WIRING = Object.freeze({
    onOpenMaterial: async () => {},
    labelTemplate: LABEL,
    materialSubjects: ['Deutsch', 'Englisch', 'Mathematik'],
});

/**
 * The link labels an `Übersicht`/`Fach` link block produces for one ranking mode.
 * @param {import('../../../support/competenceLevelGroups.js').CurrentLevelsValueGroup[]} valueGroups
 * @param {string} mode
 * @returns {Promise<string[]>}
 */
async function resolveLinkLabels(valueGroups, mode) {
    const context = await schoolContext(valueGroups);
    return createMaterialSectionLinks({
        material: 'Übersicht',
        subject: 'Fach',
        queries: sharesOf(context),
        materialLinkSubjectMode: mode,
        ...WIRING,
    }).map((link) => link.label);
}

describe("material links that rank the school's subjects", () => {
    it('ranks by the share reaching Regelstandard when both scales name their standards', async () => {
        const valueGroups = [
            schoolValueGroup('Deutsch', NAMED_LADDER, [8, 8, 2, 1, 1]), // 4/20 = 20 %
            schoolValueGroup('Mathematik', NAMED_LADDER, [1, 1, 6, 6, 6]), // 18/20 = 90 %
        ];
        expect(await resolveLinkLabels(valueGroups, 'best')).toEqual([
            'Übersicht: Mathematik im Material anzeigen',
        ]);
        expect(await resolveLinkLabels(valueGroups, 'worst')).toEqual([
            'Übersicht: Deutsch im Material anzeigen',
        ]);
    });

    it("ranks on the value group's total, so students without a level count against the share", async () => {
        // The spec's `total` is every student of the value-group. Dividing by the sum
        // of the level frequencies instead would score Deutsch 10/10 here and name it the
        // best subject, while the info box's own share sentence (and the charts) put it at
        // 10/40.
        const valueGroups = [
            schoolValueGroup('Deutsch', NAMED_LADDER, [0, 0, 5, 5, 0], 40), // 10/40 = 25 %
            schoolValueGroup('Mathematik', NAMED_LADDER, [2, 2, 4, 1, 1]), // 6/10 = 60 %
        ];
        expect(await resolveLinkLabels(valueGroups, 'best')).toEqual([
            'Übersicht: Mathematik im Material anzeigen',
        ]);
    });

    it('never calls a subject the weakest off a scale that names no standard', async () => {
        // A share over an unrankable scale read as a confident 0 % would sort the
        // subject last — below every subject that really was measured. Here every
        // Englisch student sits at the *top* of the GER ladder and Deutsch is genuinely
        // weak, so that reading names the strongest cohort the weakest. The share query
        // answers `null` for it.
        const valueGroups = [
            schoolValueGroup('Deutsch', NAMED_LADDER, [8, 8, 2, 1, 1]), // 20 % reach Regelstandard
            schoolValueGroup('Englisch', GER_LADDER, [0, 0, 0, 0, 20]), // all at C1, but unrankable
        ];
        expect(await resolveLinkLabels(valueGroups, 'worst')).toEqual([
            'Übersicht: Deutsch im Material anzeigen',
        ]);
        expect(await resolveLinkLabels(valueGroups, 'best')).toEqual([
            'Übersicht: Deutsch im Material anzeigen',
        ]);
    });

    it('names no subject at all when every scale is unrankable', async () => {
        // A school whose only value groups are Englisch on `A1…C1`. Naming it the best and
        // the worst subject would be two claims the data cannot support, so the block
        // resolves to nothing and the link falls back to the disabled placeholder.
        const valueGroups = [schoolValueGroup('Englisch', GER_LADDER, [1, 2, 3, 4, 5])];
        const context = await schoolContext(valueGroups);
        for (const mode of ['worst', 'best', 'extrema']) {
            const links = createMaterialSectionLinks({
                material: 'Übersicht',
                subject: 'Fach',
                queries: sharesOf(context),
                materialLinkSubjectMode: mode,
                ...WIRING,
            });

            expect(
                links.every((link) => link.onActivate === null),
                mode,
            ).toBe(true);
            expect(
                links.some((link) => link.label.includes('Englisch')),
                mode,
            ).toBe(false);
        }
    });
});

/**
 * Activating a material link hands the host the Fach and Typ to open. A link is live only
 * when the material view has the page: the Fach is one the dataset offers and the Typ has
 * a page. Every other link still renders, disabled, naming what it was written for.
 */
describe('activating a material link', () => {
    /** Share queries over a school that ranks nothing: the links below name their Fach. */
    let queries = /** @type {ReturnType<typeof sharesOf>} */ (/** @type {unknown} */ (null));
    beforeAll(async () => {
        queries = sharesOf(await slContextFor({ competenceLevels: [] }));
    });

    it('opens the material view on the Fach as the payload names it', async () => {
        const onOpenMaterial = vi.fn(async () => {});
        const [link] = createMaterialSectionLinks({
            material: 'Ergebniszusammenfassung',
            subject: 'Fach',
            currentSubject: 'Mathematik',
            queries,
            ...WIRING,
            onOpenMaterial,
        });

        await required(link).onActivate?.();

        expect(onOpenMaterial).toHaveBeenCalledWith({
            subject: 'Mathematik',
            type: 'Ergebniszusammenfassung',
        });
    });

    it('renders disabled for a Fach the material view does not offer', () => {
        // `Gesamt` is no Fach of any payload, so its links never have a page.
        const [link] = createMaterialSectionLinks({
            material: 'Übersicht',
            subject: 'Gesamt',
            queries,
            ...WIRING,
        });

        expect(link).toEqual({ label: 'Übersicht: Gesamt im Material anzeigen', onActivate: null });
    });

    it('renders disabled for a Typ without a page', () => {
        const [link] = createMaterialSectionLinks({
            material: 'Leitfragen',
            subject: 'Fach',
            currentSubject: 'Mathematik',
            queries,
            ...WIRING,
        });

        expect(link).toEqual({
            label: 'Leitfragen: Mathematik im Material anzeigen',
            onActivate: null,
        });
    });

    it('renders disabled, not live-but-inert, without a host to open the material', () => {
        // The link names a real Fach and Typ, so a button that renders but does
        // nothing when clicked would look like a working link. Without the host's
        // callback there is nothing to do, and the button says so by being disabled.
        const [link] = createMaterialSectionLinks({
            material: 'Übersicht',
            subject: 'Fach',
            currentSubject: 'Mathematik',
            queries,
            ...WIRING,
            onOpenMaterial: null,
        });

        expect(required(link).onActivate).toBeNull();
    });
});
