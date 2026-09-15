// @vitest-browser
/**
 * The rail's tap disclosure. `.sidebar:hover` is gated behind `@media (hover: hover)`
 * (sidebar.css), so on a touch device `is-expanded` is the *only* thing that reveals
 * the nav labels, the page's only <h1> and the settings section.
 *
 * The load-bearing case is the last one: setupThemeControls() rewrites
 * `.sidebar-settings-options` innerHTML immediately after setupViewNavigation() runs
 * (appModule.js), so a listener bound to the option buttons instead of the rail
 * would be silently dropped and the rail would stop toggling wherever the user taps
 * the settings block.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { SidebarModule } from '../../../../src/common/modules/sidebarModule.js';
import { ResourceTracker } from '@tba3/module-base/utils/resourceTracker.js';

const VIEW_CONFIG = {
    overview: { buttonId: 'overviewViewButton', icon: 'home', label: 'Übersicht' },
    item: { buttonId: 'itemViewButton', icon: 'list_alt', label: 'Aufgaben' },
};

/** @type {ResourceTracker} */
let resources;
/** @type {SidebarModule} */
let sidebarModule;
/** @type {string[]} */
let selectedViews;

/** @returns {HTMLElement} The rendered rail. */
const rail = () => /** @type {HTMLElement} */ (document.querySelector('.sidebar'));

beforeEach(() => {
    document.body.innerHTML = '';
    selectedViews = [];
    resources = new ResourceTracker('sidebarModule.test');
    sidebarModule = new SidebarModule({
        sidebarConfig: { title: 'Testboard' },
        viewConfig: VIEW_CONFIG,
        defaultView: 'overview',
        glossaryData: null,
        resources,
        onThemeChanged: () => {},
        onViewSelected: (viewType) => selectedViews.push(viewType),
    });
    sidebarModule.render();
    sidebarModule.setupViewNavigation();
});

afterEach(() => {
    sidebarModule.destroy();
    resources.destroy();
    document.body.innerHTML = '';
});

describe('SidebarModule rail disclosure', () => {
    it('toggles is-expanded when the rail itself is tapped', () => {
        expect(rail().classList.contains('is-expanded')).toBe(false);

        rail().querySelector('.sidebar-header').click();
        expect(rail().classList.contains('is-expanded')).toBe(true);

        // Round-trip: a second tap on the rail closes it again.
        rail().querySelector('.sidebar-header').click();
        expect(rail().classList.contains('is-expanded')).toBe(false);
    });

    it('collapses on a nav button and still switches the view', () => {
        rail().querySelector('.sidebar-header').click();
        expect(rail().classList.contains('is-expanded')).toBe(true);

        document.getElementById('itemViewButton').click();

        expect(rail().classList.contains('is-expanded')).toBe(false);
        expect(selectedViews).toEqual(['item']);
    });

    it('leaves the rail alone when a button inside it is tapped', () => {
        // The nav button's own handler collapses; what must not happen is the
        // delegated rail handler toggling it back open on the same click.
        document.getElementById('overviewViewButton').click();
        expect(rail().classList.contains('is-expanded')).toBe(false);
    });

    it('collapses on a click outside the sidebar', () => {
        rail().querySelector('.sidebar-header').click();
        expect(rail().classList.contains('is-expanded')).toBe(true);

        const outside = document.createElement('div');
        document.body.appendChild(outside);
        outside.click();

        expect(rail().classList.contains('is-expanded')).toBe(false);
    });

    it('still toggles after setupThemeControls() has rebuilt the settings options', () => {
        // The hazard: setupThemeControls() replaces .sidebar-settings-options
        // innerHTML wholesale. A listener on the option buttons would be gone.
        sidebarModule.setupThemeControls();
        expect(rail().querySelectorAll('[data-ks-theme-option]').length).toBeGreaterThan(0);

        rail().querySelector('.sidebar-settings').click();
        expect(rail().classList.contains('is-expanded')).toBe(true);
    });

    it('does not expand under a mouse, which has :hover to do the job', () => {
        // `.is-expanded` is the ungated twin of the hover rule: :hover ends when the
        // cursor leaves but the class does not, so a mouse that set it would latch a
        // 250px rail over the dashboard with nothing to close it.
        rail()
            .querySelector('.sidebar-header')
            .dispatchEvent(new PointerEvent('click', { pointerType: 'mouse', bubbles: true }));

        expect(rail().classList.contains('is-expanded')).toBe(false);
    });

    it('expands under a touch pointer', () => {
        rail()
            .querySelector('.sidebar-header')
            .dispatchEvent(new PointerEvent('click', { pointerType: 'touch', bubbles: true }));

        expect(rail().classList.contains('is-expanded')).toBe(true);
    });

    it('collapses on Escape', () => {
        rail().querySelector('.sidebar-header').click();
        expect(rail().classList.contains('is-expanded')).toBe(true);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

        expect(rail().classList.contains('is-expanded')).toBe(false);
    });

    it('collapses on an outside click that stops its own propagation', () => {
        // Several in-content controls do exactly this — the table's preview
        // trigger, a progress-bar column header, a scatterplot point — which is
        // why the document listener is registered in the capture phase.
        rail().querySelector('.sidebar-header').click();
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
