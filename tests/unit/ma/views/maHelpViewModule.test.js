// @vitest-browser

import { describe, it, expect } from 'vitest';
import { MaHelpViewModule } from '../../../../src/ma/views/maHelpViewModule.js';
import { viewOptions } from '../../support/viewOptions.js';
import { maGlossary } from '../../../../src/ma/maGlossary.js';
import { createTestAppOptions } from '../../support/glossaryFixture.js';

/**
 * The help page's copy lives in `ma.help`; the view keeps only the markup and the icons.
 */

async function renderHelp(viewConfig = {}, appState = viewOptions().appState) {
    /** @type {import('../../support/viewOptions.js').TestViewOptions} */
    const options = {
        context: { ...createTestAppOptions('ma').context, glossaryData: maGlossary },
        viewConfig,
        appState,
    };
    const view = MaHelpViewModule.create(
        'ma-help',
        /** @type {MaHelpViewModule['options']} */ (options),
    );
    document.body.append(view);
    await view.contentComplete;
    return { view, container: view };
}

describe('MaHelpViewModule', () => {
    it('resolves every string it renders from the glossary', async () => {
        const { container } = await renderHelp();

        expect(container.innerHTML).not.toContain('Missing glossary entry');
    });

    it('names the view the back link returns to, and follows the next switch', async () => {
        // The link reads previousView from app state, on the first render and on every
        // later switch; the app does not tell it after each show.
        const { appState } = viewOptions({ previousView: 'item' });
        const { container } = await renderHelp(
            {
                item: { icon: 'list_alt', label: 'Aufgaben' },
                group: { icon: 'groups', label: 'Lerngruppe' },
            },
            appState,
        );
        const backLink = () => container.querySelector('.help-back-btn')?.textContent.trim();

        expect(backLink()).toContain('Zurück zur vorherigen Ansicht: Aufgaben');

        appState.previousView.value = 'group';
        expect(backLink()).toContain('Zurück zur vorherigen Ansicht: Lerngruppe');
    });
});
