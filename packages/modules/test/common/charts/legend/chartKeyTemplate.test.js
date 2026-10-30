// @vitest-browser

/**
 * chartKeyTemplate — how the panel paints a renderer's key and hands clicks back.
 *
 * The templates keep no visibility state (the renderer does), so each test encodes what
 * the panel shows for a given state and what a click asks of the renderer.
 */
import { render } from 'lit';
import { describe, expect, it, vi } from 'vitest';
import { chartKeyTemplate } from '../../../../src/common/charts/legend/htmlLegendPanel.js';
import { subjects } from '../../../support/chartHarness.js';
import { required } from '../../../support/required.js';
import { legendPill as pill } from '../../../support/dom.js';

/**
 * @typedef {{isShown: (group: string, key: string) => boolean, toggle: import('vitest').Mock<(group: string, keys: string[]) => void>}} Toggles
 */

/**
 * A fresh panel, toggles whose off keys a test sets, and a paint of a key into the panel
 * with those toggles (or others).
 * @returns {{panel: HTMLElement, off: Set<string>, toggles: Toggles, paint: (key: import('../../../../src/common/charts/legend/htmlLegendPanel.js').ChartKey, toggles?: Toggles) => void}}
 */
function makePanel() {
    const panel = document.createElement('div');
    document.body.appendChild(panel);
    /** @type {Set<string>} `group/key` of every key that is off; a display entry's group is `-`. */
    const off = new Set();
    /** @type {Toggles} */
    const toggles = {
        isShown: (group, key) => !off.has(`${group}/${key}`),
        toggle: vi.fn((/** @type {string} */ _group, /** @type {string[]} */ _keys) => {}),
    };
    /** @type {(key: import('../../../../src/common/charts/legend/htmlLegendPanel.js').ChartKey, toggles?: Toggles) => void} */
    const paint = (key, { isShown, toggle } = toggles) =>
        render(
            chartKeyTemplate(key, {
                idPrefix: 'legend-test',
                hiddenNote: 'ausgeblendet',
                isShown,
                toggle,
                entryShown: (entry) => !off.has(`-/${entry}`),
                textSegments: () => null,
            }),
            panel,
        );
    return { panel, off, toggles, paint };
}

/** Two Lerngruppen behind a master pill. */
const GROUPS = {
    title: 'Lerngruppen',
    group: 'individual-group',
    masterLabel: 'Lerngruppen',
    items: [
        { key: '8a', label: '8a' },
        { key: '8b', label: '8b' },
    ],
};

describe('chartKeyTemplate', () => {
    it('presses a pill while its key is on, and hands a click back as its group and key', () => {
        const { panel, off, toggles, paint } = makePanel();
        off.add('subject/Mathe');
        paint([subjects(['Deutsch', 'Mathe'])], toggles);

        expect(pill(panel, 'Deutsch').getAttribute('aria-pressed')).toBe('true');
        expect(pill(panel, 'Mathe').getAttribute('aria-pressed')).toBe('false');

        pill(panel, 'Deutsch').click();
        expect(toggles.toggle).toHaveBeenCalledExactlyOnceWith('subject', ['Deutsch']);
    });

    it('presses a master pill while any child is on, and hands back every child', () => {
        const { panel, off, toggles, paint } = makePanel();
        off.add('individual-group/8a');
        paint([GROUPS], toggles);
        expect(pill(panel, 'Lerngruppen').getAttribute('aria-pressed')).toBe('true');

        pill(panel, 'Lerngruppen').click();
        expect(toggles.toggle).toHaveBeenCalledExactlyOnceWith('individual-group', ['8a', '8b']);

        off.add('individual-group/8b');
        paint([GROUPS], toggles);
        expect(pill(panel, 'Lerngruppen').getAttribute('aria-pressed')).toBe('false');
    });

    it('makes a toggle-all heading a button that hands back its own section only', () => {
        const { panel, toggles, paint } = makePanel();
        paint(
            [
                {
                    title: 'Deutsch',
                    group: 'domain',
                    toggleAll: true,
                    items: [
                        { key: 'Deutsch|Lesen', label: 'L' },
                        { key: 'Deutsch|Hören', label: 'H' },
                    ],
                },
                {
                    title: 'Mathe',
                    group: 'domain',
                    toggleAll: true,
                    items: [{ key: 'Mathe|Zahlen', label: 'Z' }],
                },
            ],
            toggles,
        );
        const heading = /** @type {HTMLElement} */ (
            panel.querySelector('.legend-section-title--clickable')
        );
        // A click target the keyboard cannot reach; a native button can.
        expect(heading.tagName).toBe('BUTTON');
        expect(heading.getAttribute('aria-pressed')).toBe('true');

        heading.click();
        expect(toggles.toggle).toHaveBeenCalledExactlyOnceWith('domain', [
            'Deutsch|Lesen',
            'Deutsch|Hören',
        ]);
    });

    it('a re-render with unchanged sections keeps the pills, their state and the focus', () => {
        const { panel, off, toggles, paint } = makePanel();
        paint([subjects(['Deutsch', 'Mathe'])], toggles);
        const kept = pill(panel, 'Deutsch');
        kept.focus();
        off.add('subject/Mathe');
        const latest = { ...toggles, toggle: vi.fn() };

        paint([subjects(['Deutsch', 'Mathe'])], latest);

        expect(pill(panel, 'Deutsch')).toBe(kept);
        expect(document.activeElement).toBe(kept);
        expect(pill(panel, 'Mathe').getAttribute('aria-pressed')).toBe('false');
        // The kept pills report to the latest render's toggles.
        kept.click();
        expect(latest.toggle).toHaveBeenCalledTimes(1);
        expect(toggles.toggle).not.toHaveBeenCalled();
    });

    it('patches the pills in place when a section changes', () => {
        const { panel, toggles, paint } = makePanel();
        paint([subjects(['Deutsch', 'Mathe'])], toggles);
        const before = pill(panel, 'Deutsch');

        paint([subjects(['Deutsch', 'Mathe'], { title: 'Fach' })], toggles);

        expect(pill(panel, 'Deutsch')).toBe(before);
        expect(panel.querySelector('.legend-section-title')?.textContent?.trim()).toBe('Fach');
        expect(panel.querySelectorAll('.legend-pill')).toHaveLength(2);
    });

    it('a pill swatch dims with its pill; a section without a group lists its entries only', () => {
        const { panel, off, toggles, paint } = makePanel();
        off.add('level/ia');
        paint(
            [
                {
                    title: 'Stufen',
                    group: 'level',
                    items: [{ key: 'ia', label: 'Ia', swatch: { color: 'rgb(1, 2, 3)' } }],
                },
                {
                    title: 'Bewertung',
                    items: [{ label: 'niedrig' }],
                },
            ],
            toggles,
        );

        const swatch = /** @type {HTMLElement} */ (
            pill(panel, 'Ia').querySelector('.legend-swatch')
        );
        expect(swatch.style.backgroundColor).toBe('rgb(1, 2, 3)');
        expect(pill(panel, 'Ia').classList.contains('is-inactive')).toBe(true);

        const key = /** @type {HTMLElement} */ (panel.querySelector('.legend-swatch-list'));
        expect(key.textContent?.trim()).toBe('niedrig');
        // The list is named after its heading.
        const labelledBy = required(key.getAttribute('aria-labelledby'));
        expect(document.getElementById(labelledBy)?.textContent?.trim()).toBe('Bewertung');
        expect(key.querySelector('.legend-pill')).toBeNull();
    });

    it('a hidden key entry says so to assistive technology, which the fade alone does not', () => {
        const { panel, off, paint } = makePanel();
        off.add('-/school');
        paint([
            {
                items: [
                    { key: 'school', label: 'Schulschnitt' },
                    { key: 'state', label: 'Landesschnitt' },
                ],
            },
        ]);

        const entries = panel.querySelectorAll('.legend-swatch-item');
        expect(entries[0].textContent?.replace(/\s+/g, ' ').trim()).toBe(
            'Schulschnitt, ausgeblendet',
        );
        expect(entries[1].querySelector('.visually-hidden')).toBeNull();
    });

    it('marks a pill whose label holds a glossary run, and no other', () => {
        // The run cannot be a tab stop inside the pill's button; the marker lets the
        // pill's own keyboard focus open the run's popup.
        const { panel, toggles, paint } = makePanel();
        paint(
            [
                {
                    group: 'comparison',
                    items: [
                        {
                            key: 'state',
                            label: 'L = Landesschnitt',
                            labelSegments: [
                                { text: 'L = ', glossaryKey: null },
                                { text: 'Landesschnitt', glossaryKey: 'landesschnitt' },
                            ],
                        },
                        { key: 'school', label: 'Schule' },
                    ],
                },
            ],
            toggles,
        );

        expect(pill(panel, 'L = Landesschnitt').hasAttribute('data-glossary-focus')).toBe(true);
        expect(pill(panel, 'Schule').hasAttribute('data-glossary-focus')).toBe(false);
    });
});
