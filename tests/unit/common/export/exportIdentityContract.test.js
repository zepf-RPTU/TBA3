// @vitest-browser

/**
 * A module that shows one of many things in turn (a student, a Leitidee, an InfoBox
 * section) has to say so, or all of its captures land under one export id and
 * overwrite each other. Two halves make that work:
 *
 *   1. the id is composed from `getExportIdentity()`, wherever it is declared: on the
 *      module, in a chart's config descriptor, or by the view that points a shared
 *      chart type at one entity;
 *   2. the export control follows every signal `getExportIdentity()` reads, because
 *      the id is only re-read on a sync; otherwise the checkbox keeps ticking the
 *      previous entity's id.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { ContentModule } from '@tba3/module-base';
import { ChartHostModule } from '@tba3/modules/charts';
import { createTestAppContext } from '../../support/glossaryFixture.js';
import { makeFakeRenderer } from '../../../../packages/modules/test/support/chartHarness.js';
import { mountModule } from '../../../../packages/modules/test/support/dom.js';
import { required } from '../../../../packages/modules/test/support/required.js';
import { buildExportTargetId } from '../../../../src/common/export/exportTargetId.js';

// A module has export controls only when its host hands it an export service; the
// default runtime's is a no-op. These cases need the integrated behaviour, so they
// use the app's own runtime, the one BaseAppModule hands down.
const appContext = createTestAppContext('en');

/** @typedef {import('@tba3/module-base').ExportControlDefinition} ExportControlDefinition */

/** @type {Map<string, ExportControlDefinition>} Each module's registered export target, by module id. */
const registered = new Map();

/**
 * The app's runtime, its export service recording what each module registers: the
 * definition its export control carries, as the control receives it.
 */
const context = {
    ...appContext,
    runtime: {
        ...appContext.runtime,
        exportService: {
            createModuleExportControl(/** @type {ExportControlDefinition} */ definition) {
                const control =
                    appContext.runtime.exportService.createModuleExportControl(definition);
                registered.set(definition.module.id, definition);
                return {
                    template: () => control.template(),
                    update(/** @type {ExportControlDefinition} */ next) {
                        registered.set(next.module.id, next);
                        control.update(next);
                    },
                    dispose() {
                        registered.delete(definition.module.id);
                        control.dispose();
                    },
                };
            },
        },
    },
};
const APP_OPTIONS = { context };

const HOST_OPTIONS = {
    ...APP_OPTIONS,
    showModuleTitle: true,
    title: 'Chart',
    enableModuleExport: true,
};

/**
 * @param {ContentModule} host
 * @returns {string|null} The id its export control registered, or null without one.
 */
const idOf = (host) => {
    const definition = registered.get(host.id);
    return definition
        ? buildExportTargetId(definition.moduleId, definition.identity, appContext.exportDataset.id)
        : null;
};

/**
 * @param {ContentModule} card
 * @returns {string|undefined}
 */
const registeredTitle = (card) => registered.get(card.id)?.title;

/**
 * Let the export control settle: it re-syncs once per task, in a microtask.
 * @param {ContentModule} host - A module whose identity changed outside its signals.
 */
async function resync(host) {
    host.syncExportControls();
    await Promise.resolve();
}

afterEach(() => {
    registered.clear();
});

describe('a chart host takes its export identity from its config', () => {
    it('follows the entity the config reports, and is stable while it does not change', async () => {
        const state = { domain: 'leitidee-1' };
        const host = await mountModule(
            ChartHostModule.createChart(
                'focus-host',
                {
                    createRenderer: () => makeFakeRenderer(),
                    getExportIdentity: () => state.domain,
                },
                HOST_OPTIONS,
            ),
            {},
        );

        const first = idOf(host);
        expect(first).toContain('leitidee-1');
        expect(idOf(host)).toBe(first);

        state.domain = 'leitidee-2';
        await resync(host);

        expect(idOf(host)).not.toBe(first);
        expect(idOf(host)).toContain('leitidee-2');
    });

    it('stays a bare module id when nothing declares an identity', async () => {
        const host = await mountModule(
            ChartHostModule.createChart(
                'plain-host',
                { createRenderer: () => makeFakeRenderer() },
                HOST_OPTIONS,
            ),
            {},
        );

        expect(idOf(host)).toBe('module-plain-host');
    });
});

describe('the export button follows the identity, not just the module', () => {
    /**
     * A host whose chart type reads its entity from the host's state.
     * @param {string} id
     * @returns {Promise<{host: import('@tba3/modules/charts').ChartHostModule<any, any, any, {domain: string}>, container: HTMLElement}>} The settled host, which is its card.
     */
    async function makeStatefulHost(id) {
        const host = await mountModule(
            ChartHostModule.createChart(
                id,
                {
                    createRenderer: () => makeFakeRenderer(),
                    initialState: () => ({ domain: 'a' }),
                    getExportIdentity: (h) => h.state.domain.value,
                },
                HOST_OPTIONS,
            ),
            {},
        );
        return { host, container: host };
    }

    it('moves the header control to the new id when state changes the entity', async () => {
        const { host, container } = await makeStatefulHost('resync-host');
        const before = idOf(host);

        host.state.domain.value = 'b';
        // The control re-syncs in a microtask.
        await Promise.resolve();

        const after = idOf(host);
        expect(after).not.toBe(before);
        // One control, not one per entity ever shown.
        expect(container.querySelectorAll('.module-export-button-wrapper')).toHaveLength(1);
    });

    it('registers nothing for a destroyed module whose state still changes', async () => {
        const { host } = await makeStatefulHost('destroyed-host');
        expect(idOf(host)).not.toBeNull();
        host.remove();
        await Promise.resolve();

        host.state.domain.value = 'c';
        await Promise.resolve();

        // Its control went with it, and no new one registered the changed entity.
        expect(idOf(host)).toBeNull();
    });
});

describe('the export label is the title the card shows', () => {
    /** The shared descriptor, as every exportable ContentModule builds it. */
    class TitledCard extends ContentModule {
        /** @override */
        async _renderBody() {}
        /**
         * @override
         * @returns {'visual'} An image.
         */
        _getExportType() {
            return 'visual';
        }
    }

    customElements.define('test-titled-card', TitledCard);

    it('follows a data-driven setTitle() over the glossary title', async () => {
        // A card whose subject changes retitles itself from the data. The export
        // toolbar, the report cart and the PDF footer must name the card the way
        // the user sees it. (Copy never comes through setTitle(): the glossary
        // owns it; this is a name.)
        const card = TitledCard.create('retitled-card', {
            context: {
                ...context,
                glossaryData: {
                    ma: {
                        overview: {
                            'competence-level-distribution': { title: 'Kompetenzstufenverteilung' },
                        },
                    },
                },
            },
            showModuleTitle: true,
            enableModuleExport: true,
            glossaryKey: 'ma.overview.competence-level-distribution',
        });
        await mountModule(card, {});
        await Promise.resolve();
        expect(registeredTitle(card)).toBe('Kompetenzstufenverteilung');

        card.setTitle('Mia Muster: Kompetenzstufe III');
        await Promise.resolve();

        expect(registeredTitle(card)).toBe('Mia Muster: Kompetenzstufe III');
    });

    it('ignores a title option when the glossary entry has a title', async () => {
        // A literal `title:` beside a glossary key is dead on screen. The export
        // label must agree with the card, and both with the glossary.
        const card = TitledCard.create('drifted-card', {
            context: {
                ...context,
                glossaryData: {
                    en: {
                        group: {
                            'group-table': { title: 'Tabellarische Übersicht der Schüler:innen' },
                        },
                    },
                },
            },
            showModuleTitle: true,
            enableModuleExport: true,
            title: 'Lerngruppenübersicht',
            glossaryKey: 'en.group.group-table',
        });
        await mountModule(card, {});

        expect(required(card.querySelector('.content-module-title')).textContent).toBe(
            'Tabellarische Übersicht der Schüler:innen',
        );
        await Promise.resolve();
        expect(registeredTitle(card)).toBe('Tabellarische Übersicht der Schüler:innen');
    });
});
