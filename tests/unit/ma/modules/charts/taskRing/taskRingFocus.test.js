// @vitest-browser

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { TaskRingFocusChart } from '@tba3/modules/ma/modules/charts/taskRing/taskRingFocus.js';
import {
    registerItemCompetenceScales,
    resetCompetenceLevelPalette,
} from '@tba3/modules/common/services/competenceLevelPalette.js';
import { itemPayloadRows } from '../../../../support/competenceScaleFixture.js';
import { initGlossaryForTests } from '../../../../support/glossaryFixture.js';

/**
 * The focus chart drawn for real: the ring through `taskRingFigure.js`, the two text
 * blocks and the placeholder notice under it. Items are shaped as `buildItemArray` builds
 * them, but off the fixtures' beaten path — unpiloted items, items the per-item
 * aggregation does not cover, an Aufgabenniveau ladder that does not sort alphabetically.
 */

const students = [
    { studentId: 's1', firstName: 'Ada', lastName: 'Berg' },
    { studentId: 's2', firstName: 'Bo', lastName: 'Kern' },
];

const item = (iqbId, competenceLevel, fields = {}) => ({
    iqbId,
    name: iqbId,
    exerciseName: `Übung ${iqbId}`,
    domain: 'zo',
    competenceLevel,
    total: 2,
    correctCount: 1,
    percentageCorrect: 50,
    pilotierungswert: null,
    results: [],
    ...fields,
});

async function renderFocus(items) {
    const container = document.createElement('div');
    container.id = `focus-${Math.random().toString(36).slice(2)}`;
    container.style.width = '600px';
    document.body.appendChild(container);
    const chart = new TaskRingFocusChart(container.id, items, students, {
        domain: 'zo',
        domainLabel: 'Zahlen und Operationen',
    });
    await chart.create();
    return container;
}

const blocks = (container) => [...container.querySelectorAll('.task-ring-focus-text-block')];
const listTexts = (block) =>
    [...block.querySelectorAll('.task-ring-focus-text-block-list-item')].map((li) =>
        li.textContent.trim(),
    );

beforeAll(() => initGlossaryForTests('ma'));
afterEach(() => resetCompetenceLevelPalette());

describe('TaskRingFocusChart', () => {
    it('lists the Aufgabenniveaus in the order of the registered item scale', async () => {
        // WHY: the ladder is the payload's. Sorted alphabetically, `hoch, mittel, niedrig`
        // put the hardest Niveau first.
        registerItemCompetenceScales(itemPayloadRows(['niedrig', 'mittel', 'hoch']));
        const container = await renderFocus([
            item('a1', 'hoch'),
            item('a2', 'niedrig'),
            item('a3', 'mittel'),
        ]);

        expect(listTexts(blocks(container)[1])).toEqual([
            expect.stringContaining(' niedrig '),
            expect.stringContaining(' mittel '),
            expect.stringContaining(' hoch '),
        ]);
    });

    it('draws no Ø tick when no item of the Leitidee was piloted', async () => {
        // WHY: unpiloted items arrive as `pilotierungswert: null`. The tick used to point
        // at 0 % (null read as zero) or 50 % (nothing piloted), always "based on pilot
        // studies" — a benchmark no study measured.
        const unpiloted = await renderFocus([item('a1', 'II'), item('a2', 'III')]);
        expect(unpiloted.querySelectorAll('.task-ring-expected-tick-line')).toHaveLength(0);
        expect(unpiloted.querySelectorAll('.task-ring-expected-tick-symbol')).toHaveLength(0);

        const piloted = await renderFocus([
            item('a1', 'II', { pilotierungswert: 0.6 }),
            item('a2', 'III'),
        ]);
        expect(piloted.querySelectorAll('.task-ring-expected-tick-line')).toHaveLength(1);
    });

    it('leaves an item without result counts out of the notable tasks', async () => {
        // WHY: an item the per-item aggregation does not cover has no success rate. Read
        // as 0 %, it dragged the mean down and was itself listed as the weakest task.
        const container = await renderFocus([
            item('a1', 'II', { percentageCorrect: 100 }),
            item('a2', 'II', { percentageCorrect: 90 }),
            item('a3', 'II', { total: 0, correctCount: 0, percentageCorrect: null }),
        ]);

        expect(listTexts(blocks(container)[0])).toEqual([]);
        expect(
            blocks(container)[0].querySelector('.task-ring-focus-text-block-empty')?.textContent,
        ).toBe('Keine auffälligen Aufgaben gefunden');
    });

    it('reads its copy from the glossary', async () => {
        const container = await renderFocus([item('a1', 'II')]);
        const [notable, competencies] = blocks(container);
        const notice = container.querySelector('.help-notice');

        expect(notable.querySelector('.task-ring-focus-text-block-title')?.textContent).toBe(
            'Auffällige Aufgaben:',
        );
        expect(notable.querySelector('.task-ring-focus-text-block-note')?.textContent).toContain(
            'Aufgaben mit unterdurchschnittlicher Lösungsquote',
        );
        expect(competencies.querySelector('.task-ring-focus-text-block-title')?.textContent).toBe(
            'Leitideen und Fähigkeiten (Kompetenzen):',
        );
        expect(notice?.getAttribute('aria-label')).toBe('Hinweis zur Bearbeitung dieses Bereichs');
        expect(notice?.textContent).toContain(
            'Dieser Teil der Rückmeldung ist vorerst nur ein Platzhalter und befindet sich in Bearbeitung.',
        );
    });
});
