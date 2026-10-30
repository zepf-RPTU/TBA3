// @vitest-browser

import { afterEach, describe, expect, it } from 'vitest';
import { BaseModule, ContentModule } from '../../index.js';

// The three export walkers are final: a module adds its own part through a hook and the
// walker composes the tree. That is what keeps a nested table in the CSV and a nested
// folded card open in the image, and what rolls a failed preparation back exactly once,
// however deep the step that threw.

afterEach(() => {
    document.body.replaceChildren();
});

/**
 * @typedef {import('../../index.js').BaseOptions & {
 *   log: string[],
 *   fails?: boolean,
 * }} StepOptions
 */

/**
 * A module with one capture step, one clone fix-up and one table, each logged under its
 * id; `fails` makes its capture step throw.
 * @augments {BaseModule<StepOptions>}
 */
class Step extends BaseModule {
    /**
     * @override
     * @returns {Array<() => () => void>}
     */
    _captureSteps() {
        const { log, fails } = this.options;
        return [
            ...super._captureSteps(),
            () => {
                if (fails) throw new Error(`${this.id} failed`);
                log.push(`open ${this.id}`);
                return () => log.push(`close ${this.id}`);
            },
        ];
    }

    /** @override */
    _prepareOwnClone() {
        this.options.log.push(`clone ${this.id}`);
    }

    /**
     * @override
     * @param {'csv'|'json'} format
     * @returns {import('../../index.js').ExportDataBlock[]}
     */
    _ownExportData(format) {
        return [{ title: this.id, text: format }];
    }
}
customElements.define('test-export-step', Step);

/** A titled card: a folded one opens for the capture. */
class Card extends ContentModule {
    /** @override */
    async _renderBody() {}
}
customElements.define('test-export-walker-card', Card);

/**
 * A folded card holding `outer`, which holds `inner` and then `last`: three levels.
 * @param {{failing?: string}} [options] - The id of the step that throws.
 */
async function placeTree({ failing } = {}) {
    /** @type {string[]} */
    const log = [];
    const card = Card.create('card', { showModuleTitle: true });
    document.body.append(card);
    await card.updateComplete;
    card.collapse();
    const step = (/** @type {string} */ id) => Step.create(id, { log, fails: id === failing });
    const outer = step('outer');
    card.contentContainer.append(outer);
    outer.append(step('inner'), step('last'));
    return { card, log };
}

describe('the export walkers compose the module tree', () => {
    it('runs own steps before the children and undoes them in reverse', async () => {
        const { card, log } = await placeTree();

        const restore = card.prepareExportCapture();
        expect(card.classList.contains('collapsed')).toBe(false);
        expect(log).toEqual(['open outer', 'open inner', 'open last']);

        restore();
        expect(log.slice(3)).toEqual(['close last', 'close inner', 'close outer']);
        expect(card.classList.contains('collapsed')).toBe(true);
    });

    it('undoes everything opened before a step throws, two levels down, and rethrows', async () => {
        const { card, log } = await placeTree({ failing: 'last' });

        expect(() => card.prepareExportCapture()).toThrow('last failed');

        expect(log).toEqual(['open outer', 'open inner', 'close inner', 'close outer']);
        expect(card.classList.contains('collapsed')).toBe(true);
    });

    it('fixes the clone children first, then the module itself', async () => {
        const { card, log } = await placeTree();

        card.prepareExportClone(() => null);

        expect(log).toEqual(['clone inner', 'clone last', 'clone outer']);
    });

    it('collects the tables own first, then the children in document order', async () => {
        const { card } = await placeTree();

        expect(card.getExportDataText('csv')).toEqual([
            { title: 'outer', text: 'csv' },
            { title: 'inner', text: 'csv' },
            { title: 'last', text: 'csv' },
        ]);
    });
});
