// @vitest-browser

import { signal } from '@preact/signals-core';
import { describe, expect, it } from 'vitest';
import { BaseModule, ContentModule } from '../../index.js';
import { DEFAULT_RUNTIME } from '../../src/modules/moduleRuntime.js';

class Scope extends BaseModule {
    /**
     * The options a child of this module inherits, as the module hands them on from inside.
     * @returns {import('../../index.js').BaseOptions}
     */
    childOptions() {
        return this._childOptions();
    }
}
customElements.define('test-export-scope', Scope);

class Card extends ContentModule {
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
customElements.define('test-export-card', Card);

class BrokenCard extends Card {
    /** @override */
    _setup() {
        super._setup();
        throw new Error('setup failed');
    }
}
customElements.define('test-export-broken-card', BrokenCard);

/**
 * A module context whose export service records every control it creates.
 * @returns {{context: import('../../index.js').BaseOptions['context'], registered: import('../../index.js').ExportControlDefinition[]}}
 */
function recordingContext() {
    /** @type {import('../../index.js').ExportControlDefinition[]} */
    const registered = [];
    const runtime = {
        ...DEFAULT_RUNTIME,
        exportService: {
            createModuleExportControl: (
                /** @type {import('../../index.js').ExportControlDefinition} */ definition,
            ) => {
                registered.push(definition);
                return { template: () => null, update() {}, dispose() {} };
            },
        },
    };
    const context = { documents: { ensure: async () => {} }, glossaryData: null, runtime };
    return { context, registered };
}

describe('ContentModule export view', () => {
    it('names the view it sits in, threaded from the view through the child options', async () => {
        // Export file names and report captions carry the view. The hash cannot
        // supply it: a view's cards register before the router syncs the hash.
        const { context, registered } = recordingContext();
        const view = Scope.create('group-module', { viewKey: 'group', context });
        const section = Scope.create('section', { ...view.childOptions() });
        const card = Card.create('card', {
            ...section.childOptions(),
            showModuleTitle: true,
            title: 'Card',
            enableModuleExport: true,
        });

        document.body.append(card);
        await card.updateComplete;
        // The control settles once per task, in a microtask.
        await Promise.resolve();

        expect(registered.map((definition) => definition.view)).toEqual(['group']);
    });

    it('registers no export target for a card whose setup failed', async () => {
        // The card never renders, so no toolbar carries the control, and a failed
        // setup skips `_teardown()`: the registration would point at nothing.
        const { context, registered } = recordingContext();
        const card = BrokenCard.create('broken-card', {
            context,
            showModuleTitle: true,
            title: 'Card',
            enableModuleExport: true,
        });

        document.body.append(card);
        await expect(card.updateComplete).rejects.toThrow('setup failed');
        await Promise.resolve();

        expect(registered).toEqual([]);
        card.remove();
    });

    it('registers nothing for a card titled before it connects, and once it has', async () => {
        // A sync queued before the first connect ran ahead of `_setup()`: it registered a
        // target nothing showed, then threw reading the resources it follows the identity with.
        const { context, registered } = recordingContext();
        const card = Card.create('early-card', {
            context,
            showModuleTitle: true,
            title: 'Card',
            enableModuleExport: true,
        });

        card.setTitle('Early title');
        await Promise.resolve();
        expect(registered).toEqual([]);

        document.body.append(card);
        await card.updateComplete;
        await Promise.resolve();
        expect(registered.map((definition) => definition.title)).toEqual(['Early title']);
        card.remove();
    });

    it('brings the control once a signal its type reads turns ready, outside a content pass', async () => {
        // The follower used to start with the first control, so a type that starts out
        // null never got one until something else synced it.
        const { context, registered } = recordingContext();
        const ready = signal(false);
        class LateCard extends ContentModule {
            /** @override */
            async _renderBody() {}

            /**
             * @override
             * @returns {'visual'|null} An image once ready.
             */
            _getExportType() {
                return ready.value ? 'visual' : null;
            }
        }
        customElements.define('test-export-late-card', LateCard);
        const card = LateCard.create('late-card', {
            context,
            showModuleTitle: true,
            title: 'Card',
            enableModuleExport: true,
        });

        document.body.append(card);
        await card.updateComplete;
        await Promise.resolve();
        expect(registered).toEqual([]);

        ready.value = true;
        await Promise.resolve();
        expect(registered.map((definition) => definition.moduleId)).toEqual(['late-card']);
        card.remove();
    });
});
