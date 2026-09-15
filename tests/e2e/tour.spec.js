/**
 * E2E test: the guided walkthrough of every dashboard view that has one.
 *
 * WHY the exact step sequence is asserted and not just "a tour opens": the
 * steps are *derived*, not authored — buildTourSteps() walks the view's
 * registered module tree and emits a card for every module whose glossary entry
 * carries `tutorial` copy, ordered by document position. Nothing in the view
 * code names those steps, so a module that silently stops registering, loses
 * its `glossaryKey`, or moves in the DOM changes the tour a user sees with no
 * other visible symptom. Pinning the titles per view is what makes that
 * regression fail here rather than in front of a teacher.
 *
 * The tail cards ("Schon gewusst? …") are shared across views but conditional:
 * each is dropped where its anchor does not exist (the welcome view has no
 * table, hence no export button). That per-view
 * difference is part of what is asserted.
 */

import { test, expect, describe } from './support/test.js';
import { clickNav, gotoApp, LOAD_TIMEOUT } from './support/app.js';

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
        button: '#welcomeViewButton',
        // `en.welcome.header` has no tutorial → no header step. The greeting
        // names annotated terms (Hör-/Leseverstehen), so the hover card has an
        // anchor; no table → the export card has none and is dropped.
        titles: [
            'Willkommen zur Ergebnisrückmeldung von VERA 8: Englisch',
            'Navigation',
            HOVER_CARD,
            NOTES_CARD,
        ],
    },
    {
        app: 'en',
        view: 'overview',
        button: '#overviewViewButton',
        // Grid order is left | centre | right, which is *not* the order the
        // view registers these three charts in — derivation sorts by DOM.
        titles: [
            'Übersicht',
            'GER-Verteilung: Hörverstehen',
            'Streuung der Schüler:innen: GER-Stufen mit Lösungsquoten für Hören und Lesen',
            'GER-Verteilung: Leseverstehen',
            ...TAIL_CARDS,
        ],
    },
    {
        app: 'en',
        view: 'class',
        button: '#classViewButton',
        // The only view with an override (EnClassViewModule.customizeTourSteps):
        // the filter button belongs to no module, and the selection modal is
        // closed during the tour so its card is deliberately centered.
        titles: [
            'Klassenübersicht',
            'Durchschnittliche Lösungsquoten der Klasse nach Stilen im Hör- und Leseverstehen',
            'Tabellarische Übersicht der Schüler:innen',
            'Visuelle Suche mit Streudiagramm',
            'Schüler:innen suchen und finden',
            ...TAIL_CARDS,
        ],
    },
    {
        app: 'en',
        view: 'item',
        button: '#itemViewButton',
        titles: [
            'Aufgabenübersicht',
            'Klassenübergreifende Lösungsrate ausgewählter Teilaufgaben',
            'Tabellarische Übersicht aller Aufgaben und Teilaufgaben',
            'Aufgabendetails',
            ...TAIL_CARDS,
        ],
    },
    {
        app: 'en',
        view: 'student',
        button: '#studentViewButton',
        // Left column (the two student tables, registered as grandchildren of
        // EnStudentTablesModule) before the right column — again DOM, not
        // registration, order.
        titles: [
            'Schüler:innenansicht',
            'Schüler:in im Detail',
            'Aufgaben des/der Schüler:in im Detail',
            'Individuelle Lösungsquoten nach Stilen',
            'Aufgabendetails',
            ...TAIL_CARDS,
        ],
    },
    {
        app: 'ma',
        view: 'class',
        button: '#combinedViewButton',
        // The competence-level bar starts collapsed; its card still anchors the step.
        titles: ['Kompetenzstufenverteilung der Klasse', 'Klassenübersicht', ...TAIL_CARDS],
    },
    {
        app: 'ma',
        view: 'item',
        button: '#itemViewButton',
        titles: ['Mittlere Lösungsquoten aller Teilaufgaben', 'Aufgabenübersicht', ...TAIL_CARDS],
    },
    {
        app: 'ma',
        view: 'student',
        button: '#studentViewButton',
        titles: [
            'Aufgabenlösungen des/der Schüler:in',
            'Lösungsquoten nach Leitideen (Schüler:in im Klassenvergleich)',
            ...TAIL_CARDS,
        ],
    },
    {
        app: 'sl',
        view: 'comparison',
        button: '#comparisonViewButton',
        titles: ['Deskriptive Ergebnisse', ...TAIL_CARDS],
    },
];

describe('guided walkthrough', () => {
    for (const { app, view, button, titles } of TOURS) {
        test(`the ${app} ${view} view tours its modules in reading order`, async ({ page }) => {
            const container = `#${app}-${view}-container`;
            /** @type {string[]} */
            const anchorWarnings = [];
            page.on('console', (msg) => {
                if (msg.type() === 'warning' && msg.text().includes('lost its anchor')) {
                    anchorWarnings.push(msg.text());
                }
            });

            await gotoApp(page, `/${app}/`);

            await clickNav(page, button);
            await page.waitForSelector('.header-module', { timeout: LOAD_TIMEOUT });
            // The shared header renders before the view it belongs to, and the
            // steps derive from the view's registered modules. Wait for the
            // view's first module shell to exist, then for the view to drop its
            // loading placeholder — asserting only the latter would pass
            // vacuously in the window before the placeholder is even raised.
            await page.waitForSelector(`${container} .module-container`, {
                state: 'attached',
                timeout: LOAD_TIMEOUT,
            });
            await page.waitForSelector(`${container}[data-view-rendering]`, {
                state: 'detached',
                timeout: LOAD_TIMEOUT,
            });

            const infoButton = page.locator('[data-header-action-button="tour-start"]');
            await infoButton.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
            await infoButton.click();

            const card = page.locator('.tutorial-tour-card-title');
            await card.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });

            // One progress dot per step — the tour's own count, read before walking.
            await expect(page.locator('.tutorial-tour-progress-dot')).toHaveCount(titles.length);

            const nextButton = page.locator('.tutorial-tour-next');
            for (let step = 0; step < titles.length; step += 1) {
                await expect(card).toHaveText(titles[step]);
                await expect(page.locator('.tutorial-tour-progress-dot.is-active')).toHaveCount(1);
                // Last step finishes the tour instead of advancing.
                await expect(nextButton).toHaveText(
                    step === titles.length - 1 ? 'Fertig' : 'Weiter',
                );
                await nextButton.click();
            }

            // Finishing must close the overlay AND release the header button —
            // a button left pressed means the next click closes nothing.
            await expect(page.locator('.tutorial-tour-overlay')).not.toHaveClass(/visible/);
            await expect(infoButton).toHaveAttribute('aria-pressed', 'false');

            // Every derived step anchors to a module that exists; only a
            // shell-level anchor can go missing, and that is a real defect.
            expect(anchorWarnings).toEqual([]);
        });
    }
});
