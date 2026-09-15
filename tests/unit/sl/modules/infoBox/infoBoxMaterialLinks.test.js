import { describe, it, expect, beforeEach, vi } from 'vitest';

import { slDataFromStore } from '../../../../../src/sl/slDataPort.js';
import {
    registerCompetenceLevelScales,
    resetCompetenceLevelPalette,
} from '@tba3/modules/common/services/competenceLevelPalette.js';
import { createMaterialSectionLinksFromToken } from '@tba3/modules/sl/modules/infoBox/infoBoxLinks.js';
import { CompetenceShareQueries } from '@tba3/modules/sl/utils/slCompetenceShares.js';
import { scalePayloadRow } from '../../../support/competenceScaleFixture.js';
import { createSlDataStore } from '../../../support/slDataStoreFixture.js';
import { SL_DATA_KEYS } from '../../../../../src/sl/slDataKeys.js';

/**
 * The `{{Übersicht+Fach}}` material links resolve "Fach" from the data when the info box
 * does not name one: the school's best or weakest subject, ranked by the same `ge_3`
 * share (`CompetenceShareQueries.getSubjectCompetenceShare`) the box sentences print.
 *
 * That ranking is only meaningful for a scale that ranks its levels. An export may
 * measure Englisch on a GER ladder that ranks none, and a share the scale cannot express
 * is unknown, not 0 %.
 */

/** Bremen's / Niedersachsen's named ladder, lowest first. */
const NAMED_LADDER = [
    { nameShort: 'MiStd-', name: 'unter Mindeststandard' },
    { nameShort: 'MiStd', name: 'Mindeststandard' },
    { nameShort: 'ReStd', name: 'Regelstandard' },
    { nameShort: 'ReStd+', name: 'Regelstandard plus' },
    { nameShort: 'OptStd', name: 'Optimalstandard' },
];

/** The GER ladder as a state export ships it: `name` mirrors `nameShort`. */
const GER_LADDER = ['A1', 'A2', 'B1', 'B2', 'C1'].map((nameShort) => ({
    nameShort,
    name: nameShort,
}));

/**
 * One school row. `frequencies` is per level, lowest first.
 * @param {string} subjectName
 * @param {Array<{nameShort: string, name: string}>} ladder
 * @param {number[]} frequencies
 * @param {number} [total] - Students in the value-group; defaults to those with a level.
 */
function schoolRow(
    subjectName,
    ladder,
    frequencies,
    total = frequencies.reduce((sum, frequency) => sum + frequency, 0),
) {
    // The rank travels as a row property, the way the export ships it — the client
    // derives nothing from `name`. `GER_LADDER` names no standard, so it gets no keys
    // and stays the unrankable scale these cases are about.
    const { properties, competenceLevels } = scalePayloadRow(ladder);

    return {
        id: 'group-1',
        // `type` is the discriminator the app filters on, and every row of every SL
        // dataset carries it — a fixture without one is not a shape the app can meet.
        // A school-wide ranking pools the class rows, so the fixture is one class.
        type: 'group',
        name: '8a',
        subject: { name: subjectName },
        domain: { id: 'le', name: 'Lesen' },
        properties,
        competenceLevels: competenceLevels.map((level, index) => ({
            ...level,
            descriptiveStatistics: { total, frequency: frequencies[index] ?? 0 },
        })),
    };
}

/** The share queries over the class rows plus the school row the ranking needs to find a school. */
function queriesFor(rows) {
    const slData = slDataFromStore(
        createSlDataStore({
            [SL_DATA_KEYS.COMPETENCE_LEVELS]: [
                { id: 'school-1', type: 'school', name: 'Gaußschule II' },
                ...rows,
            ],
        }),
    );
    return new CompetenceShareQueries({ moduleId: 'test', slData });
}

/**
 * Enough wiring for a link to be actionable. Passed even where the assertion is about
 * labels or `disabled`, so that `disabled` keeps meaning "this token names no subject"
 * rather than "this link was built without an app".
 */
const WIRING = Object.freeze({
    appState: { updateState: () => {} },
    onNavigate: async () => {},
});

/**
 * The link labels a `{{Übersicht+Fach}}` token produces for one ranking mode.
 * @param {Array<Object>} rows
 * @param {string} mode
 */
function resolveLinkLabels(rows, mode) {
    return createMaterialSectionLinksFromToken({
        token: '{{Übersicht+Fach}}',
        queries: queriesFor(rows),
        materialLinkSubjectMode: mode,
        ...WIRING,
    }).map((link) => link.label);
}

beforeEach(() => {
    resetCompetenceLevelPalette();
});

describe("material links that rank the school's subjects", () => {
    it('ranks by the share reaching Regelstandard when both scales name their standards', () => {
        const rows = [
            schoolRow('Deutsch', NAMED_LADDER, [8, 8, 2, 1, 1]), // 4/20 = 20 %
            schoolRow('Mathematik', NAMED_LADDER, [1, 1, 6, 6, 6]), // 18/20 = 90 %
        ];
        registerCompetenceLevelScales(rows);

        expect(resolveLinkLabels(rows, 'best')).toEqual(['Übersicht: Mathe im Material anzeigen']);
        expect(resolveLinkLabels(rows, 'worst')).toEqual([
            'Übersicht: Deutsch im Material anzeigen',
        ]);
    });

    it('ranks on the row total, so students without a level count against the share', () => {
        // WHY: the spec's `total` is every student of the value-group. Dividing by the sum
        // of the level frequencies instead scored Deutsch 10/10 here and named it the
        // best subject, while the info box's own share sentence (and the charts) put it at
        // 10/40.
        const rows = [
            schoolRow('Deutsch', NAMED_LADDER, [0, 0, 5, 5, 0], 40), // 10/40 = 25 %
            schoolRow('Mathematik', NAMED_LADDER, [2, 2, 4, 1, 1]), // 6/10 = 60 %
        ];
        registerCompetenceLevelScales(rows);

        expect(resolveLinkLabels(rows, 'best')).toEqual(['Übersicht: Mathe im Material anzeigen']);
    });

    it('never calls a subject the weakest off a scale that names no standard', () => {
        // WHY: a share over an unrankable scale used to be a confident 0 %, which sorted
        // the subject last — below every subject that really was measured. Here every
        // Englisch student sits at the *top* of the GER ladder and Deutsch is genuinely
        // weak, so the bug names the strongest cohort the weakest. The share query answers
        // `null` for it.
        const rows = [
            schoolRow('Deutsch', NAMED_LADDER, [8, 8, 2, 1, 1]), // 20 % reach Regelstandard
            schoolRow('Englisch', GER_LADDER, [0, 0, 0, 0, 20]), // all at C1, but unrankable
        ];
        registerCompetenceLevelScales(rows);

        expect(resolveLinkLabels(rows, 'worst')).toEqual([
            'Übersicht: Deutsch im Material anzeigen',
        ]);
        expect(resolveLinkLabels(rows, 'best')).toEqual([
            'Übersicht: Deutsch im Material anzeigen',
        ]);
    });

    it('names no subject at all when every scale is unrankable', () => {
        // A school whose only rows are Englisch on `A1…C1` is exactly this. Naming it
        // the best *and* the worst subject would be two claims the data cannot support, so
        // the token resolves to nothing and the link falls back to the disabled placeholder
        // it already renders whenever no subject can be resolved.
        const rows = [schoolRow('Englisch', GER_LADDER, [1, 2, 3, 4, 5])];
        registerCompetenceLevelScales(rows);

        for (const mode of ['worst', 'best', 'extrema']) {
            const links = createMaterialSectionLinksFromToken({
                token: '{{Übersicht+Fach}}',
                queries: queriesFor(rows),
                materialLinkSubjectMode: mode,
                ...WIRING,
            });

            expect(
                links.every((link) => link.disabled),
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
 * Activating a material link has to do three things in one order, and the order is the
 * behaviour — each half is read by a different consumer at a different moment:
 *
 * - The **state write must precede the navigation.** Showing the material view renders
 *   its header first, and the Fach/Typ controls seed themselves from state in
 *   `injectState` (`slHeaderControls.js:241,269`). A write after the navigation would leave
 *   the header showing the previous selection.
 * - Nothing is published. The material view observes the two keys once it exists
 *   (`slMaterialViewModule.js`), and a view built by this very navigation seeds its
 *   selection from them.
 *
 * Both halves also carry the *canonical* token, not the one the template wrote: a link
 * spelled `Mathematik` must select `Mathe`, the value the controls and the content use.
 */
describe('activating a material link', () => {
    /**
     * One link for `{{Leitfragen+Mathematik}}`, wired to an app that records the order it
     * is driven in. `gateNavigation` holds the navigation open so the caller can observe
     * what has and has not happened while the material view is still being built.
     * @param {{gateNavigation?: boolean}} [opts={}]
     */
    function buildLink({ gateNavigation = false } = {}) {
        const calls = [];
        let finishNavigation = () => {};
        const navigated = new Promise((resolve) => {
            finishNavigation = resolve;
        });

        const appState = {
            updateState: (patch) => calls.push(['updateState', patch]),
        };
        const onNavigate = async (view) => {
            calls.push(['navigate', view]);
            if (gateNavigation) await navigated;
        };
        const links = createMaterialSectionLinksFromToken({
            token: '{{Leitfragen+Mathematik}}',
            appState,
            onNavigate,
        });

        expect(links).toHaveLength(1);
        return { link: links[0], calls, finishNavigation };
    }

    it('selects the Fach and the Typ, then shows the material view — and publishes nothing', async () => {
        const { link, calls } = buildLink();

        await link.onActivate();

        expect(calls).toEqual([
            ['updateState', { materialSubject: 'Mathe', materialType: 'Leitfragen' }],
            ['navigate', 'material'],
        ]);
    });

    it('renders disabled, not live-but-inert, when the wiring never reached it', () => {
        // WHY: both halves arrive through the info box's option bundle, two levels below
        // the view that owns them (SL view → detailOverlayModule → InfoBoxModule). A
        // bundle that stops forwarding one is a silent regression: the button still
        // renders and still looks clickable, it just does nothing. Disabled + a warning
        // makes that visible instead. `disabled` here must mean the wiring, not the
        // token — the token names a real Fach and Typ.
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const [noNavigation] = createMaterialSectionLinksFromToken({
            token: '{{Leitfragen+Mathematik}}',
            appState: { updateState: () => {} },
        });
        const [noState] = createMaterialSectionLinksFromToken({
            token: '{{Leitfragen+Mathematik}}',
            onNavigate: async () => {},
        });

        for (const link of [noNavigation, noState]) {
            expect(link.label).toBe('Leitfragen: Mathe im Material anzeigen');
            expect(link.disabled).toBe(true);
            expect(link.onActivate).toBeUndefined();
        }
        expect(warn).toHaveBeenCalledTimes(2);

        warn.mockRestore();
    });

    it('has written the selection before the navigation starts', async () => {
        // A real showView awaits a lazy import and a full render, during which the
        // material view seeds itself from state — so the write cannot come later.
        const { link, calls, finishNavigation } = buildLink({ gateNavigation: true });

        const activation = link.onActivate();
        await Promise.resolve();
        expect(calls.map(([verb]) => verb)).toEqual(['updateState', 'navigate']);

        finishNavigation();
        await activation;
    });
});
