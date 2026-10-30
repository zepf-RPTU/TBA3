// @vitest-browser

import { describe, expect, it, vi } from 'vitest';
import {
    NavCardModule,
    viewNavCardItems,
} from '../../../../../src/common/modules/navCard/navCardModule.js';
import { createTestAppOptions } from '../../../support/glossaryFixture.js';
import { mountModule } from '../../../../../packages/modules/test/support/dom.js';

const glossaryData = {
    t: {
        'nav-cards': {
            element_texts: {
                'nav-overview': { title: 'Übersicht', description: 'Alles auf einen Blick' },
                'nav-group': { title: 'Lerngruppe', tooltip: 'Die Lerngruppe im Detail' },
            },
        },
    },
};

/** @returns {{[viewType: string]: any}} A resolved viewConfig as the shell hands it to views. */
const viewConfig = () => ({
    overview: {
        icon: 'bar_chart',
        label: 'Übersicht',
        navigationGlossaryPath: 't.nav-cards.element_texts.nav-overview',
    },
    group: {
        icon: 'groups',
        label: 'Lerngruppe',
        navigationGlossaryPath: 't.nav-cards.element_texts.nav-group',
    },
    help: {
        icon: 'help',
        label: 'Hilfe',
        navigationGlossaryPath: 't.nav-cards.element_texts.nav-help',
        sidebarPinBottom: true,
    },
});

/** @returns {Promise<{module: NavCardModule, onNavigate: ReturnType<typeof vi.fn>}>} */
async function renderCards(options = {}) {
    const onNavigate = vi.fn();
    const module = await mountModule(
        NavCardModule.create('cards', {
            context: { ...createTestAppOptions('en').context, glossaryData },
            items: viewNavCardItems(viewConfig(), 'icon'),
            onNavigate,
            ...options,
        }),
        {},
    );
    return { module, onNavigate };
}

/**
 * @param {string} view - The view the card links to.
 * @returns {HTMLElement}
 */
const card = (view) =>
    /** @type {HTMLElement} */ (document.querySelector(`.preview-item[href="#${view}"]`));

/** @returns {HTMLElement} */
const currentCard = () =>
    /** @type {HTMLElement} */ (document.querySelector('.preview-item[aria-current="page"]'));

describe('viewNavCardItems', () => {
    it('lists every advertised view with its sidebar name and glossary entry', () => {
        expect(viewNavCardItems(viewConfig(), 'labelIcon')).toEqual([
            {
                labelIcon: 'bar_chart',
                viewTarget: 'overview',
                label: 'Übersicht',
                glossaryPath: 't.nav-cards.element_texts.nav-overview',
            },
            {
                labelIcon: 'groups',
                viewTarget: 'group',
                label: 'Lerngruppe',
                glossaryPath: 't.nav-cards.element_texts.nav-group',
            },
        ]);
    });
});

describe('NavCardModule', () => {
    it('reads the card line and the tooltip from the view entry', async () => {
        await renderCards();

        expect(card('overview').querySelector('.preview-description')?.textContent).toBe(
            'Alles auf einen Blick',
        );
        expect(card('group').dataset.tooltipText).toBe('Die Lerngruppe im Detail');
    });

    it('navigates once per activation, with the item state patch, after a re-render', async () => {
        const statePatch = { layoutMode: 'chart-only' };
        const items = viewNavCardItems(viewConfig(), 'icon').map((item) =>
            item.viewTarget === 'group' ? { ...item, statePatch } : item,
        );
        const { module, onNavigate } = await renderCards({ items });
        // A content pass of its own: the cards are patched in place, not rebuilt.
        await module.refreshContent();

        // A card is a link: Enter follows it as a click, which the browser dispatches.
        card('group').click();
        card('overview').click();
        // A modified click is the browser's: a new tab, not the app's navigation.
        card('overview').dispatchEvent(
            new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }),
        );

        expect(onNavigate.mock.calls).toEqual([
            ['group', statePatch],
            ['overview', undefined],
        ]);
        expect(card('group').getAttribute('href')).toBe('#group');
        // Named by what it shows, title and description, not by a label over them.
        expect(card('group').hasAttribute('aria-label')).toBe(false);
        expect(card('group').querySelector('.preview-label')?.textContent?.trim()).toBe(
            'Lerngruppe',
        );
    });

    it('marks the current card inert but keeps its tooltip', async () => {
        const { module, onNavigate } = await renderCards();
        module.currentView = 'group';
        await module.updateComplete;

        const current = currentCard();
        current.click();

        expect(onNavigate).not.toHaveBeenCalled();
        expect(current.getAttribute('aria-current')).toBe('page');
        expect(current.hasAttribute('href')).toBe(false);
        expect(current.querySelector('.preview-label')?.textContent).toContain('Lerngruppe');
        expect(current.dataset.tooltipText).toBe('Die Lerngruppe im Detail');
        expect(current.querySelector('.preview-current-view')).not.toBeNull();
        expect(card('overview').tagName).toBe('A');
    });
});
