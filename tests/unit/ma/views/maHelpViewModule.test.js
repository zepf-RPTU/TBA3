// @vitest-browser

import { describe, it, expect, beforeAll } from 'vitest';
import { MaHelpViewModule } from '../../../../src/ma/views/maHelpViewModule.js';
import { maGlossary } from '../../../../src/ma/maGlossary.js';
import { initGlossaryForTests } from '../../support/glossaryFixture.js';

/**
 * The help page's copy lives in `ma.help`; the view keeps only the markup and the icons.
 * These tests pin that every string still resolves and reads as it did when it was
 * written into the template.
 */

async function renderHelp(viewConfig = {}) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const view = new MaHelpViewModule('ma-help', container, {
        glossaryData: maGlossary,
        viewConfig,
    });
    await view._renderView();
    return { view, container };
}

beforeAll(() => initGlossaryForTests('ma'));

describe('MaHelpViewModule', () => {
    it('resolves every string it renders from the glossary', async () => {
        const { container } = await renderHelp();

        expect(container.innerHTML).not.toContain('Missing glossary entry');
        expect(container.querySelector('#helpDidacticTitle')?.textContent).toBe(
            'Didaktische Hinweise',
        );
        expect(container.querySelector('.help-notice-message')?.textContent).toBe(
            'Dieser Teil der Rückmeldung ist vorerst nur ein Platzhalter und befindet sich in Bearbeitung.',
        );
        expect(container.textContent).toContain(
            'Förderideen sind konkrete Vorschläge und Ansätze zur individuellen Unterstützung von Schüler:innen basierend auf ihren Leistungsdaten.',
        );
        expect(container.textContent).toContain(
            'Übersicht: Kompetenzstufenverteilung und Lösungsquoten der Klasse',
        );
    });

    it('keeps the icons in the view and sets each symbol label beside its glyph', async () => {
        const { container } = await renderHelp();
        const symbolsCard = [...container.querySelectorAll('.help-card')].find(
            (card) => card.querySelector('h3')?.textContent === 'Symbole',
        );

        expect([...symbolsCard.querySelectorAll('li')].map((li) => li.textContent.trim())).toEqual([
            expect.stringContaining('Willkommen / Startseite'),
            expect.stringContaining('Übersicht / Statistiken'),
            expect.stringContaining('Klasse'),
            expect.stringContaining('Aufgaben'),
            expect.stringContaining('Schüler:in'),
            expect.stringContaining('Export / Download'),
        ]);
        // The export answer carries the download glyph inside its sentence.
        const exportAnswer = [...container.querySelectorAll('.help-card-content p')].find((p) =>
            p.textContent.includes('Kann ich Daten exportieren?'),
        );
        expect(exportAnswer?.textContent).toContain('Überall dort, wo ein Export-Symbol (');
        expect(exportAnswer?.querySelector('svg')).not.toBeNull();
    });

    it('names the view the back link returns to', async () => {
        const { view, container } = await renderHelp({
            item: { icon: 'list_alt', label: 'Aufgaben' },
        });
        view.setPreviousView('item');

        expect(container.querySelector('.help-back-btn')?.textContent.trim()).toContain(
            'Zurück zur vorherigen Ansicht: Aufgaben',
        );
    });
});
