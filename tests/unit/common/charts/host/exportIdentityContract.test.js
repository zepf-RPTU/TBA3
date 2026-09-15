// @vitest-browser

/**
 * WHY: a module that shows one of many things in turn (a student, a Leitidee, an
 * InfoBox section) has to say so, or all of its captures land under one export id
 * and overwrite each other. Two halves make that work, and both are easy to get
 * wrong silently:
 *
 *   1. the id must be composed from `getExportIdentity()`, wherever it is declared
 *      — on the module, in a chart's config descriptor, or by the view that points
 *      a shared chart type at one entity;
 *   2. whatever changes the identity must resync the export controls, because the
 *      id is only re-read on a sync. Without it the checkbox keeps ticking the
 *      previous entity's id, which is the failure the id change was meant to fix.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChartHostModule } from '@tba3/modules/common/charts/host/chartHostModule.js';
import { ContentModule } from '@tba3/module-base/modules/contentModule.js';
import { setExportDataset } from '../../../../../src/common/export/exportDataset.js';
import { configureModuleRuntime } from '@tba3/module-base/modules/moduleRuntime.js';
import { exportService } from '../../../../../src/common/export/exportService.js';
import { buildExportTargetId } from '../../../../../src/common/export/exportTargetId.js';

// A module only grows export controls for a host that registered an export
// service; the default is a no-op, which is what keeps the export graph out of a
// consumer that wants none. These cases are about the integrated behaviour, so
// they stand in for the host — bootstrapDashboardApp.js does exactly this.
configureModuleRuntime({ exportService, buildExportTargetId });

function makeFakeRenderer() {
    return {
        create: vi.fn().mockResolvedValue(undefined),
        destroy: vi.fn(),
        refresh: vi.fn().mockResolvedValue(undefined),
    };
}

function makeHostContainer(id) {
    const container = document.createElement('section');
    container.id = id;
    document.body.appendChild(container);
    return container;
}

const HOST_OPTIONS = {
    showModuleTitle: true,
    title: 'Chart',
    enableModuleExport: true,
    waitForStableLayout: false,
};

const idOf = (host) => host.getExportControlDefinition()?.id ?? null;

afterEach(() => {
    document.body.innerHTML = '';
    setExportDataset(null);
    vi.restoreAllMocks();
});

describe('a chart host takes its export identity from its config', () => {
    it('follows the entity the config reports, and is stable while it does not change', async () => {
        const container = makeHostContainer('focus-host');
        const state = { domain: 'leitidee-1' };
        const host = new ChartHostModule(
            'focus-host',
            container,
            {
                createRenderer: () => makeFakeRenderer(),
                getExportIdentity: () => state.domain,
            },
            HOST_OPTIONS,
        );
        await host.init({});

        const first = idOf(host);
        expect(first).toContain('leitidee-1');
        expect(idOf(host)).toBe(first);

        state.domain = 'leitidee-2';

        expect(idOf(host)).not.toBe(first);
        expect(idOf(host)).toContain('leitidee-2');
    });

    it('stays a bare module id when nothing declares an identity', async () => {
        const container = makeHostContainer('plain-host');
        const host = new ChartHostModule(
            'plain-host',
            container,
            {
                createRenderer: () => makeFakeRenderer(),
            },
            HOST_OPTIONS,
        );
        await host.init({});

        expect(idOf(host)).toBe('module-plain-host');
    });
});

describe('the export button follows the identity, not just the module', () => {
    it('rebuilds the header control under the new id when the entity changes', async () => {
        const container = makeHostContainer('resync-host');
        const state = { domain: 'a' };
        const host = new ChartHostModule(
            'resync-host',
            container,
            {
                createRenderer: () => makeFakeRenderer(),
                getExportIdentity: () => state.domain,
            },
            HOST_OPTIONS,
        );
        await host.init({});

        const before = idOf(host);

        // What an in-place update path must do: change the entity, then resync —
        // the step whose absence leaves the checkbox on the previous entity.
        state.domain = 'b';
        host.syncExportControls();

        const after = idOf(host);
        expect(after).not.toBe(before);
        // One control, not one per entity ever shown.
        expect(container.querySelectorAll('.module-export-button-wrapper')).toHaveLength(1);
    });
});

describe('the export label is the title the card shows', () => {
    /** The shared descriptor builder, as every non-chart ContentModule uses it. */
    class TitledCard extends ContentModule {
        async _doRenderContent() {}
        getExportControlDefinition() {
            return this._buildExportControlDefinition('info-box');
        }
    }

    it('follows a data-driven setTitle() over the glossary title', async () => {
        // WHY: a card whose subject changes retitles itself from the data. The
        // export toolbar, the report cart and the PDF footer must name the card
        // the way the user sees it, or the capture is unfindable. (Copy never comes
        // through setTitle() — the glossary owns it; this is a name.)
        const card = new TitledCard('retitled-card', makeHostContainer('retitled-card'), {
            showModuleTitle: true,
            glossaryKey: 'ma.overview.competence-distribution',
            glossaryData: {
                ma: {
                    overview: { 'competence-distribution': { title: 'Kompetenzstufenverteilung' } },
                },
            },
        });
        await card.init({});
        expect(card.getExportControlDefinition().title).toBe('Kompetenzstufenverteilung');

        card.setTitle('Mia Muster: Kompetenzstufe III');

        expect(card.getExportControlDefinition().title).toBe('Mia Muster: Kompetenzstufe III');
    });

    it('ignores a title option when the glossary entry has a title', async () => {
        // WHY: a literal `title:` beside a glossary key used to be silently dead on
        // screen — and nothing compared the two, so they drifted apart in eight
        // modules. The export label must agree with the card, and both with the glossary.
        const card = new TitledCard('drifted-card', makeHostContainer('drifted-card'), {
            showModuleTitle: true,
            title: 'Klassenübersicht',
            glossaryKey: 'en.class.class-table',
            glossaryData: {
                en: {
                    class: {
                        'class-table': { title: 'Tabellarische Übersicht der Schüler:innen' },
                    },
                },
            },
        });
        await card.init({});

        expect(card.container.querySelector('.content-module-title').textContent).toBe(
            'Tabellarische Übersicht der Schüler:innen',
        );
        expect(card.getExportControlDefinition().title).toBe(
            'Tabellarische Übersicht der Schüler:innen',
        );
    });
});

describe('the dataset is part of every identity', () => {
    it('separates the same chart captured in two datasets', async () => {
        const container = makeHostContainer('dataset-host');
        const host = new ChartHostModule(
            'dataset-host',
            container,
            {
                createRenderer: () => makeFakeRenderer(),
            },
            HOST_OPTIONS,
        );
        await host.init({});

        setExportDataset({ id: 'cls_8a', label: 'Klasse 8a' });
        const inA = idOf(host);

        setExportDataset({ id: 'cls_8b', label: 'Klasse 8b' });
        const inB = idOf(host);

        expect(inA).not.toBe(inB);
        expect(inA).toContain('cls-8a');
        expect(inB).toContain('cls-8b');
    });
});
