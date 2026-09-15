// @vitest-browser

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ScatterplotFilterModule } from '@tba3/modules/en/modules/charts/scatterplot/scatterplotFilterModule.js';

const hostOptions = vi.hoisted(() => []);
const selections = vi.hoisted(() => []);

vi.mock('@tba3/modules/common/charts/host/chartHostModule.js', () => ({
    ChartHostModule: class {
        constructor(id, _container, _config, options) {
            this.id = id;
            hostOptions.push(options);
        }
        async init() {}
        setTouchSelectionArmed() {}
        getSelectedIds() {
            return new Set();
        }
        setSelectedIds(ids) {
            selections.push(ids);
        }
        mount() {}
        async hydrate() {}
        whenSettled() {
            return Promise.resolve();
        }
        get childModules() {
            return new Set();
        }
        destroy() {}
    },
}));

vi.mock('@tba3/modules/common/glossary/glossaryAnnotator.js', () => ({
    glossaryAnnotator: {
        getRequiredEntryText: (path) => path,
        annotateHTML: (html) => html,
    },
}));

describe('ScatterplotFilterModule', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        hostOptions.length = 0;
        selections.length = 0;
    });

    it("hands its chart the page's comparison selection, read-only", async () => {
        // WHY: the descriptor reads `comparisonState` from its host's options. Passed as
        // render data it never arrived, so the dialog drew every comparison group whatever
        // the page showed.
        const comparisonState = {
            getActiveModes: () => ['state'],
            isActive: (id) => id === 'state',
            setActive: () => {},
        };
        const modal = new ScatterplotFilterModule('filter', document.body, {
            enConfig: { domainIds: ['ho', 'le'], domainLabels: ['Hören', 'Lesen'] },
            styleAverages: null,
            comparisonState,
        });

        await modal.show();

        const state = hostOptions[0]?.comparisonState;
        expect(state?.getActiveModes()).toEqual(['state']);
        expect(state?.isActive('school')).toBe(false);
        // Read-only: without `setActive` the chart builds no ⌀ menu of its own.
        expect(state?.setActive).toBeUndefined();

        await modal.destroy();
    });

    it('selects only the students the chart plots', async () => {
        // WHY: "Alle auswählen" selected every record, including a student without a
        // usable percentage in one domain, who draws no point. Confirming then filtered
        // the class table to a row no point on the chart stood for.
        const enConfig = {
            domainIds: ['lv', 'sp'],
            domainLabels: ['Hören', 'Lesen'],
            fieldName: (domainId, suffix) => `en-${domainId}${suffix}`,
        };
        const studentArray = [
            { studentId: 's1', 'en-lvPercentage': '60.0%', 'en-spPercentage': '40.0%' },
            // No `Richtig` aggregation in `sp`, so no percentage there and no point.
            { studentId: 's2', 'en-lvPercentage': '70.0%' },
        ];
        const modal = new ScatterplotFilterModule('filter', document.body, {
            enConfig,
            styleAverages: null,
            studentArray,
        });
        await modal.show();

        /** @type {HTMLButtonElement} */ (
            document.querySelector('[data-scatterplot-filter-action="select-all"]')
        ).click();

        expect([...selections.at(-1)]).toEqual(['s1']);

        await modal.destroy();
    });
});
