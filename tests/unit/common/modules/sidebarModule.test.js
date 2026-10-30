// @vitest-browser
/**
 * The rail's tap disclosure. `.sidebar:hover` is gated behind `@media (hover: hover)`
 * (sidebarModule.css), so on a touch device only `is-expanded` reveals the nav labels, the
 * page's only <h1> and the settings section.
 *
 * The competence-level menu appears once the palette registers the data's scales,
 * after setupViewNavigation() ran; the rail must still toggle wherever the user taps
 * the settings block.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { SidebarModule } from '../../../../src/common/modules/sidebarModule.js';
import { ResourceTracker } from '@tba3/module-base';
import { applyColorScheme } from '@tba3/modules/theme';
import { createTestAppContext } from '../../support/glossaryFixture.js';
import { queryHtml } from '../../../../packages/modules/test/support/dom.js';
import { scaleValueGroup } from '../../../../packages/modules/test/support/competenceScaleFixture.js';

/** The nav renders from `buttonId`, `icon` and `label`; the rest only completes the entries. */
const VIEW_CONFIG = {
    overview: {
        buttonId: 'overviewViewButton',
        icon: 'home',
        skeleton: /** @type {const} */ ('stack'),
        label: 'Übersicht',
        containerId: 'overview-container',
        headerGlossaryPath: 'test.overview.header',
        navigationGlossaryPath: 'test.overview.navigation',
        load: async () => null,
    },
    item: {
        buttonId: 'itemViewButton',
        icon: 'list_alt',
        skeleton: /** @type {const} */ ('stack'),
        label: 'Aufgaben',
        containerId: 'item-container',
        headerGlossaryPath: 'test.item.header',
        navigationGlossaryPath: 'test.item.navigation',
        load: async () => null,
    },
};

/** @type {ResourceTracker} */
let resources;
/** @type {SidebarModule} */
let sidebarModule;
/** @type {ReturnType<typeof createTestAppContext>} */
let context;

/** Land a scale in the app's palette, as the document store's `onLand` hook does. */
const registerScale = () =>
    context.palette.registerCompetenceLevelScales([
        scaleValueGroup(['A1', 'A2', 'B1', 'B2', 'C1'].map((nameShort) => ({ nameShort }))),
    ]);

/** @returns {HTMLElement} */
const rail = () => /** @type {HTMLElement} */ (document.querySelector('.sidebar'));

/**
 * @param {string} setting - `color-scheme` or `competence-level-theme`.
 * @returns {HTMLElement|null} The setting's menu trigger.
 */
const trigger = (setting) => rail().querySelector(`[data-header-action-button="${setting}"]`);

/**
 * Open a setting's menu.
 * @param {string} setting
 * @returns {HTMLElement} The open menu.
 */
function openMenu(setting) {
    /** @type {HTMLElement} */ (trigger(setting)).click();
    return queryHtml(rail(), `.sidebar-${setting}-menu:popover-open`);
}

/**
 * Pick an option from a setting's menu.
 * @param {string} setting
 * @param {string} id - The option's id.
 */
function pick(setting, id) {
    queryHtml(openMenu(setting), `[data-menu-item-id="${id}"]`).click();
}

/**
 * Reopen a setting's menu and read which option it marks chosen.
 * @param {string} setting
 * @returns {string|undefined}
 */
function checkedOption(setting) {
    const menu = openMenu(setting);
    const checked = /** @type {HTMLElement|null} */ (menu.querySelector('[aria-checked="true"]'));
    menu.hidePopover();
    return checked?.dataset.menuItemId;
}

beforeEach(() => {
    resources = new ResourceTracker('sidebarModule.test');
    context = createTestAppContext('en');
    sidebarModule = new SidebarModule({
        viewConfig: VIEW_CONFIG,
        resources,
        onViewSelected: () => {},
        context,
    });
    sidebarModule.render();
    sidebarModule.setupViewNavigation();
});

afterEach(() => {
    sidebarModule.destroy();
    resources.destroy();
    // The scheme and theme a test picked live on the page and in storage.
    localStorage.clear();
    delete document.documentElement.dataset.colorScheme;
    delete document.documentElement.dataset.competenceLevelTheme;
});

describe('SidebarModule rail disclosure', () => {
    it('still toggles after the scales landing has rebuilt the settings options', () => {
        // There before the scales land, so the rail does not grow once they do.
        expect(trigger('competence-level-theme')).not.toBeNull();
        registerScale();
        expect(trigger('competence-level-theme')).not.toBeNull();

        queryHtml(rail(), '.sidebar-settings').click();
        expect(rail().classList.contains('is-expanded')).toBe(true);
    });

    it('applies a colour scheme another tab already stored', () => {
        // Every tab shares localStorage: a scheme picked elsewhere is stored but not shown
        // here, so the click must not be taken for a repeat of the active choice.
        localStorage.removeItem('tba3_color_scheme');
        applyColorScheme('light');
        localStorage.setItem('tba3_color_scheme', 'dark');

        pick('color-scheme', 'dark');

        expect(document.documentElement.dataset.colorScheme).toBe('dark');
        expect(checkedOption('color-scheme')).toBe('dark');
    });

    it('re-renders the competence-level menu on a scheme switch and its options still apply', () => {
        // Landesvorgabe's availability depends on the scheme's surface, so a scheme
        // switch re-renders the competence-level menu; its options must still apply.
        applyColorScheme('light');
        registerScale();

        pick('color-scheme', 'dark');
        pick('competence-level-theme', 'grayscale');

        expect(document.documentElement.dataset.competenceLevelTheme).toBe('grayscale');
        expect(checkedOption('competence-level-theme')).toBe('grayscale');
    });

    it('names the current value on the trigger, whose text shows only the setting', () => {
        pick('color-scheme', 'light');
        expect(trigger('color-scheme')?.getAttribute('aria-label')).toBe('Darstellung: Hell');

        pick('color-scheme', 'dark');
        expect(trigger('color-scheme')?.getAttribute('aria-label')).toBe('Darstellung: Dunkel');
    });

    it('keeps the rail expanded while a settings menu is open', () => {
        // The shell's tokens are not loaded here; the rail's collapsed width is. No
        // transition, so the width is read at its end. Read before the menu's `toggle`
        // focuses its first row, so `:has(:focus-visible)` plays no part.
        rail().style.setProperty('--sidebar-rail-width', '60px');
        rail().style.transition = 'none';
        expect(rail().getBoundingClientRect().width).toBe(60);

        const menu = openMenu('color-scheme');
        expect(rail().getBoundingClientRect().width).toBeGreaterThan(200);

        menu.hidePopover();
        expect(rail().getBoundingClientRect().width).toBe(60);
    });

    it('does not expand under a mouse, which has :hover to do the job', () => {
        // :hover ends when the cursor leaves but `.is-expanded` does not, so a mouse
        // that set it would latch the expanded rail over the dashboard.
        queryHtml(rail(), '.sidebar-header').dispatchEvent(
            new PointerEvent('click', { pointerType: 'mouse', bubbles: true }),
        );

        expect(rail().classList.contains('is-expanded')).toBe(false);
    });

    it('expands under a touch pointer', () => {
        queryHtml(rail(), '.sidebar-header').dispatchEvent(
            new PointerEvent('click', { pointerType: 'touch', bubbles: true }),
        );

        expect(rail().classList.contains('is-expanded')).toBe(true);
    });

    it('collapses on Escape', () => {
        queryHtml(rail(), '.sidebar-header').click();
        expect(rail().classList.contains('is-expanded')).toBe(true);

        document.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
        );

        expect(rail().classList.contains('is-expanded')).toBe(false);
    });

    it('stays expanded on an Escape another surface already handled', () => {
        // Escape closes the innermost open thing only: a rename input or a glossary
        // popup that took the key leaves the rail for the next one.
        queryHtml(rail(), '.sidebar-header').click();
        const input = document.createElement('input');
        document.body.appendChild(input);
        input.addEventListener('keydown', (event) => event.preventDefault());

        input.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
        );

        expect(rail().classList.contains('is-expanded')).toBe(true);
        input.remove();
    });

    it('collapses on an outside click that stops its own propagation', () => {
        // In-content controls do this (the table's preview trigger, a progress-bar
        // column header, a scatterplot point), so the document listener is
        // registered in the capture phase.
        queryHtml(rail(), '.sidebar-header').click();
        expect(rail().classList.contains('is-expanded')).toBe(true);

        const outside = document.createElement('div');
        document.body.appendChild(outside);
        outside.addEventListener('click', (event) => event.stopPropagation());
        outside.click();

        expect(rail().classList.contains('is-expanded')).toBe(false);
    });

    it('drops the document listener when the tracker is destroyed', () => {
        // The listener lives on document, so it outlives the sidebar's own DOM
        // unless the coordinator's tracker takes it down.
        const detached = rail();
        detached.classList.add('is-expanded');
        resources.destroy();

        document.body.click();
        expect(detached.classList.contains('is-expanded')).toBe(true);
    });
});
