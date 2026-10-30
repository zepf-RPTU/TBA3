/**
 * E2E test: the guided walkthrough of every dashboard view that has one.
 *
 * The exact step sequence is asserted because the steps are derived, not authored:
 * buildTourSteps() walks the view's registered module tree and emits a card for every
 * module whose glossary entry carries `tutorial` copy, ordered by document position. A
 * module that stops registering, loses its `glossaryKey` or moves in the DOM changes
 * the tour with no other symptom.
 *
 * The tail cards ("Schon gewusst? …") are shared across views but conditional: each is
 * dropped where its anchor does not exist (the welcome view has no table, hence no
 * export button).
 *
 * Every step scrolls its anchor into view, so each also checks that the fixed shell
 * itself was not scrolled.
 */

import { test, expect } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT_MS, parkPointer } from './support/app.js';
import { expectViewportCannotScroll } from './support/viewport.js';

const HOVER_CARD = 'Schon gewusst? – Erklärungen per Mouseover';
const EXPORT_CARD = 'Schon gewusst? – Inhalte herunterladen';
const NOTES_CARD = 'Schon gewusst? – Eigene Notizen';
const TAIL_CARDS = [HOVER_CARD, EXPORT_CARD, NOTES_CARD];

/**
 * Expected card titles per view, in order: view header (where the view's
 * `header` glossary entry has a tutorial), then the view's modules in reading
 * order, then the applicable shared tail cards.
 */
const TOURS = [
    {
        app: 'en',
        view: 'welcome',
        // `en.welcome.header` has no tutorial → no header step. The greeting shows
        // before the data and names no domain, so no annotated term anchors the
        // hover card; no table → no export card either.
        titles: ['Willkommen zur Ergebnisrückmeldung von VERA-8', 'Navigation', NOTES_CARD],
    },
    {
        app: 'en',
        view: 'overview',
        // Grid order is left | centre | right: the steps follow the DOM.
        titles: [
            'Übersicht',
            'GER-Verteilung: Hören',
            'Lösungsquoten: Hören und Lesen',
            'GER-Verteilung: Lesen',
            ...TAIL_CARDS,
        ],
    },
    {
        app: 'en',
        view: 'group',
        // The only view with extras (EnGroupViewModule.tourExtras): the filter button
        // belongs to no module, and the selection modal is closed during the tour, so
        // its card is centered.
        titles: [
            'Lerngruppenübersicht',
            'Durchschnittliche Lösungsquoten der Lerngruppe nach Stilen im Hören und Lesen',
            'Tabellarische Übersicht der Schüler:innen',
            'Visuelle Suche mit Streudiagramm',
            'Schüler:innen suchen und finden',
            ...TAIL_CARDS,
        ],
    },
    {
        app: 'en',
        view: 'item',
        titles: [
            'Aufgabenübersicht',
            'Lösungsquoten der Lerngruppe für ausgewählte Teilaufgaben',
            'Tabellarische Übersicht aller Aufgaben und Teilaufgaben',
            'Aufgabendetails',
            ...TAIL_CARDS,
        ],
    },
    {
        app: 'en',
        view: 'student',
        // Left column (the two student tables, grandchildren of EnStudentTablesModule)
        // before the right column: DOM order again.
        titles: [
            'Ergebnisse einzelner Schüler:innen',
            'Schüler:in im Detail',
            'Teilaufgaben des/der Schüler:in im Detail',
            'Individuelle Lösungsquoten nach Stilen',
            'Aufgabendetails',
            ...TAIL_CARDS,
        ],
    },
    {
        app: 'ma',
        view: 'group',
        titles: ['Kompetenzstufenverteilung der Lerngruppe', 'Lerngruppenübersicht', ...TAIL_CARDS],
    },
    {
        app: 'ma',
        view: 'item',
        titles: ['Mittlere Lösungsquoten aller Teilaufgaben', 'Aufgabenübersicht', ...TAIL_CARDS],
    },
    {
        app: 'ma',
        view: 'student',
        titles: [
            'Aufgabenlösungen des/der Schüler:in',
            'Lösungsquoten (Schüler:in im Lerngruppenvergleich)',
            ...TAIL_CARDS,
        ],
    },
    {
        app: 'sl',
        view: 'comparison',
        titles: ['Deskriptive Ergebnisse', ...TAIL_CARDS],
    },
];

test.describe('guided walkthrough', () => {
    for (const { app, view, titles } of TOURS) {
        test(`the ${app} ${view} view tours its modules in reading order`, async ({ page }) => {
            const container = `#${app}-${view}-container`;
            /** @type {string[]} */
            const anchorWarnings = [];
            page.on('console', (msg) => {
                if (msg.type() === 'warning' && msg.text().includes('lost its anchor')) {
                    anchorWarnings.push(msg.text());
                }
            });

            // The steps derive from the view's registered modules, so its first module
            // shell must exist before the tour starts.
            await gotoApp(page, `/${app}/#${view}`);
            await page.waitForSelector(`${container} .module-container`, {
                state: 'attached',
                timeout: LOAD_TIMEOUT_MS,
            });

            const infoButton = page.locator('[data-header-action-button="tour-start"]');
            await infoButton.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
            await infoButton.click();

            const card = page.getByRole('dialog').getByRole('heading', { level: 2 });
            await card.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });

            // One progress dot per step — the tour's own count, read before walking.
            await expect(page.locator('.tutorial-tour-progress-dot')).toHaveCount(titles.length);

            const nextButton = page.locator('.tutorial-tour-next');
            for (let step = 0; step < titles.length; step += 1) {
                await expect(card).toHaveText(titles[step]);
                // The card is a dialog named by its heading, and tells a screen reader
                // where it is; the dots are hidden from it.
                await expect(page.getByRole('dialog', { name: titles[step] })).toContainText(
                    `Schritt ${step + 1} von ${titles.length}`,
                );
                await expect(page.locator('.tutorial-tour-progress-dot.is-active')).toHaveCount(1);
                await expectViewportCannotScroll(page, `tour step ${step}`);
                await expect(nextButton).toHaveText(
                    step === titles.length - 1 ? 'Fertig' : 'Weiter',
                );
                await nextButton.click();
                // The card glides to its next anchor under the resting pointer (see
                // `parkPointer`).
                await parkPointer(page);
            }

            // Finishing closes the overlay and releases the header button: left pressed,
            // its next click would close nothing.
            await expect(page.locator('.tutorial-tour-overlay:popover-open')).toHaveCount(0);
            await expect(infoButton).toHaveAttribute('aria-pressed', 'false');
            await expectViewportCannotScroll(page, 'closing the tour');

            // Every derived step anchors to a module that exists; only a
            // shell-level anchor can go missing, and that is a real defect.
            expect(anchorWarnings).toEqual([]);
        });
    }
});
