// @vitest-browser

/**
 * TaskRingGridController — programmatic Leitidee selection.
 *
 * The chart-only views share one focused Leitidee through app state; the view
 * that did not click seeds its grid with it (`create({ selectedDomain })`) or
 * moves the selection on a live grid (`selectDomain`). Both must behave exactly
 * like a ring click minus the report: the view already knows the Leitidee, so
 * `onDomainSelected` must stay silent, and a ring that cannot be clicked (an
 * empty Leitidee, a grid without domain selection) cannot be selected either.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTaskRingGridController } from '@tba3/modules/ma/modules/charts/taskRing/taskRingGridController.js';

const itemArray = [
    { iqbId: 'i1', domain: 'zo', competenceLevel: 'II', percentageCorrect: 50 },
    { iqbId: 'i2', domain: 'rf', competenceLevel: 'III', percentageCorrect: 40 },
];
const domains = [
    { domain: 'zo', domainLabel: 'Zahlen und Operationen' },
    { domain: 'rf', domainLabel: 'Raum und Form' },
    { domain: 'gm', domainLabel: 'Größen und Messen' },
];

/** A host over a hand-built grid: one selectable ring per populated Leitidee, an inert one for `gm`. */
function makeHost({ selectedDomain = 'zo' } = {}) {
    const container = document.createElement('div');
    document.body.appendChild(container);

    for (const domain of ['overall', 'zo', 'rf', 'gm']) {
        const item = document.createElement('div');
        item.className = 'task-ring-chart-item';
        item.dataset.domain = domain;
        if (domain !== 'gm') item.classList.add('task-ring-chart-item--selectable');
        if (domain === selectedDomain) item.classList.add('domain-ring-highlight', 'selected');
        container.appendChild(item);
    }

    const onDomainSelected = vi.fn();
    return {
        id: 'ring-grid',
        configState: { selectedDomain },
        destroyed: false,
        charts: [],
        onDomainSelected,
        getOption: (key) => (key === 'onDomainSelected' ? onDomainSelected : undefined),
        contentContainer: container,
    };
}

const selectedRings = (host) =>
    Array.from(host.contentContainer.querySelectorAll('.selected')).map(
        (item) => item.dataset.domain,
    );

describe('TaskRingGridController.selectDomain', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('moves the highlight and the state to the requested ring without reporting it', () => {
        const host = makeHost();
        const rf = host.contentContainer.querySelector('[data-domain="rf"]');
        rf.classList.add('domain-ring-highlight', 'hover');

        expect(getTaskRingGridController(host).selectDomain('rf')).toBe(true);

        expect(selectedRings(host)).toEqual(['rf']);
        expect(rf.classList.contains('hover')).toBe(false);
        expect(host.configState.selectedDomain).toBe('rf');
        expect(host.onDomainSelected).not.toHaveBeenCalled();
    });

    it('does nothing for the ring that is already selected', () => {
        const host = makeHost();

        expect(getTaskRingGridController(host).selectDomain('zo')).toBe(false);

        expect(selectedRings(host)).toEqual(['zo']);
        expect(host.configState.selectedDomain).toBe('zo');
    });

    it.each([
        ['an unknown Leitidee', 'xx'],
        ['a Leitidee without tasks', 'gm'],
        ['no Leitidee', null],
    ])('leaves the selection alone for %s', (_label, domainId) => {
        const host = makeHost();

        expect(getTaskRingGridController(host).selectDomain(domainId)).toBe(false);

        expect(selectedRings(host)).toEqual(['zo']);
        expect(host.configState.selectedDomain).toBe('zo');
        expect(host.onDomainSelected).not.toHaveBeenCalled();
    });
});

describe('TaskRingGridController.create — the seeded Leitidee', () => {
    beforeEach(() => {
        // The build itself is deferred to a frame that never fires here: the
        // seed is resolved synchronously, before the frame.
        vi.stubGlobal('requestAnimationFrame', () => 1);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        document.body.innerHTML = '';
    });

    it('is selected before the frame, ahead of the previous selection', () => {
        const host = makeHost({ selectedDomain: 'zo' });

        getTaskRingGridController(host).create({
            itemArray,
            studentArray: [],
            domains,
            selectedDomain: 'rf',
        });

        expect(host.configState.selectedDomain).toBe('rf');
    });

    it('falls back to the first populated ring when it names no such ring', () => {
        const host = makeHost({ selectedDomain: null });

        getTaskRingGridController(host).create({
            itemArray,
            studentArray: [],
            domains,
            selectedDomain: 'gm',
        });

        expect(host.configState.selectedDomain).toBe('zo');
    });

    it('keeps the previous selection when no seed is passed', () => {
        const host = makeHost({ selectedDomain: 'rf' });

        getTaskRingGridController(host).create({ itemArray, studentArray: [], domains });

        expect(host.configState.selectedDomain).toBe('rf');
    });
});
