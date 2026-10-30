// @vitest-browser

import { describe, expect, it } from 'vitest';
import { html } from 'lit';
import { BaseModule, ContentModule } from '@tba3/module-base';
import { captureExportRoot } from '../../../../src/common/export/exportCapture.js';
import { mountModule } from '../../../../packages/modules/test/support/dom.js';

// A capture clones the live card, and a clone of a module element is a new instance:
// connected in the capture stage it would set itself up, render and register a second
// time under the same id. The stage keeps every copy inert, and html-to-image's own
// copy is never connected.

/** How often a module of each kind set itself up and rendered, live or copied. */
const counts = { setups: 0, renders: 0 };

class ProbeLeaf extends BaseModule {
    /** @override */
    _setup() {
        super._setup();
        counts.setups += 1;
    }

    /**
     * @override
     * @returns {unknown}
     */
    render() {
        counts.renders += 1;
        return html`<span class="probe-leaf">leaf</span>`;
    }
}
customElements.define('test-probe-leaf', ProbeLeaf);

/** @type {boolean|null} Whether a card's copy in the last capture was folded. */
let cloneFolded = null;

class ProbeCard extends ContentModule {
    /**
     * @override
     * @param {(live: Element) => Element|null} cloneOf
     */
    _prepareOwnClone(cloneOf) {
        cloneFolded = cloneOf(this)?.classList.contains('collapsed') ?? null;
    }

    /** @override */
    _setup() {
        super._setup();
        counts.setups += 1;
    }

    /** @override */
    async _renderBody() {
        const leaf = ProbeLeaf.create(`${this.id}-leaf`, {});
        this.contentContainer.replaceChildren(leaf);
        await leaf.updateComplete;
    }
}
customElements.define('test-probe-card', ProbeCard);

describe('export capture of module elements', () => {
    it('copies a card and its child modules without setting anything up again', async () => {
        const card = await mountModule(
            ProbeCard.create('probe-card', { showModuleTitle: true, title: 'Probe' }),
            {},
        );
        expect(counts).toEqual({ setups: 2, renders: 1 });

        const canvas = await captureExportRoot({ module: card });

        expect(canvas.width).toBeGreaterThan(0);
        expect(counts).toEqual({ setups: 2, renders: 1 });
        // The stage is gone and the live tree still holds exactly its own modules.
        expect(document.querySelectorAll('[data-tba-module]')).toHaveLength(2);
        expect(card.descendants().map((module) => module.id)).toEqual(['probe-card-leaf']);
    });

    it('exports a folded card open, and folds it again', async () => {
        const card = await mountModule(
            ProbeCard.create('folded-card', { showModuleTitle: true, title: 'Probe' }),
            {},
        );
        card.collapse();

        await captureExportRoot({ module: card });

        expect(cloneFolded).toBe(false);
        expect(card.classList.contains('collapsed')).toBe(true);
    });
});
