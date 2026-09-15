// @vitest-browser

/**
 * TablePresetManager — the preset button row must reflect the preset list.
 *
 * updatePresets() used to swap the preset *configs* and re-wire listeners while
 * leaving the rendered buttons untouched. That silently broke any caller whose
 * preset set changes size at runtime: the MA class table drops its two
 * Kompetenzstufe-based ±Schwellenwert presets when scoped to a single Leitidee
 * (KS is undefined per Leitidee), and the buttons for them stayed on screen,
 * inert. Fixing it in place is what lets the class table re-scope without being
 * destroyed and rebuilt.
 *
 * These tests lock the two halves of that contract:
 *  - the button row is re-rendered when the preset set actually changes, and a
 *    now-removed active preset is cleared rather than left dangling; and
 *  - it is NOT re-rendered when the labels are unchanged (EN/SL merely re-target
 *    a preset's sort column — rebuilding their buttons would make them flicker).
 */

import { describe, it, expect, vi } from 'vitest';
import { TablePresetManager } from '@tba3/modules/common/tables/internal/tablePresetManager.js';
import { Preset } from '@tba3/modules/common/tables/preset.js';

const preset = (label) => new Preset({ label, sort: [{ column: 'summedResult', dir: 'desc' }] });

/** Minimal Tabulator stub — the manager only drives filters/sort/data on it. */
function createTableStub() {
    return {
        on: vi.fn(),
        off: vi.fn(),
        clearFilter: vi.fn(),
        clearSort: vi.fn(),
        clearHeaderFilter: vi.fn(),
        addFilter: vi.fn(),
        setSort: vi.fn(),
        deselectRow: vi.fn(),
        getData: vi.fn(() => []),
        getHeaderFilters: vi.fn(() => []),
        setHeaderFilterValue: vi.fn(),
    };
}

/** Labels of the rendered preset buttons (excludes the leading Reset button). */
const renderedLabels = (container) =>
    [...container.querySelectorAll('[data-preset-index]')].map((b) => b.textContent);

function setup(presets) {
    const manager = new TablePresetManager();
    const table = createTableStub();
    const container = manager.createContainer(presets);
    document.body.appendChild(container);
    manager.initStateTracking('t1', presets, table, [], null, null);
    manager.attachListeners(presets, table);
    return { manager, table, container };
}

describe('TablePresetManager preset button row', () => {
    it('renders a Reset button plus one button per preset', () => {
        const { container } = setup([preset('Stärkste 5'), preset('Schwächste 5')]);

        expect(container.querySelector('[data-table-preset-action="reset"]')).toBeTruthy();
        expect(renderedLabels(container)).toEqual(['Stärkste 5', 'Schwächste 5']);
    });

    it('exposes the selected preset via aria-pressed; Reset is an action and carries none', () => {
        const { container } = setup([preset('Stärkste 5'), preset('Schwächste 5')]);
        const reset = container.querySelector('[data-table-preset-action="reset"]');

        container.querySelector('[data-preset-index="1"]').click();
        expect(
            container.querySelector('[data-preset-index="1"]').getAttribute('aria-pressed'),
        ).toBe('true');
        expect(
            container.querySelector('[data-preset-index="0"]').getAttribute('aria-pressed'),
        ).toBe('false');
        expect(reset.hasAttribute('aria-pressed')).toBe(false);

        reset.click();
        expect(
            container.querySelector('[data-preset-index="1"]').getAttribute('aria-pressed'),
        ).toBe('false');
        expect(reset.hasAttribute('aria-pressed')).toBe(false);
    });

    it('re-renders the buttons when the preset set shrinks (Gesamt 4 → Leitidee 2)', () => {
        const gesamt = [
            preset('Stärkste 5'),
            preset('Schwächste 5'),
            preset('1 Punkt über Schwellenwert'),
            preset('1 Punkt unter Schwellenwert'),
        ];
        const { manager, table, container } = setup(gesamt);
        expect(renderedLabels(container)).toHaveLength(4);

        manager.updatePresets([preset('Stärkste 5'), preset('Schwächste 5')], table);

        expect(renderedLabels(container)).toEqual(['Stärkste 5', 'Schwächste 5']);
    });

    it('re-renders when the set grows back (Leitidee 2 → Gesamt 4)', () => {
        const { manager, table, container } = setup([preset('Stärkste 5'), preset('Schwächste 5')]);

        manager.updatePresets(
            [
                preset('Stärkste 5'),
                preset('Schwächste 5'),
                preset('1 Punkt über Schwellenwert'),
                preset('1 Punkt unter Schwellenwert'),
            ],
            table,
        );

        expect(renderedLabels(container)).toHaveLength(4);
        // The regrown buttons are wired: clicking one applies its preset to the table.
        container.querySelector('[data-preset-index="3"]').click();
        expect(table.setSort).toHaveBeenCalled();
    });

    it('clears an active preset that no longer exists in the new set', () => {
        const gesamt = [
            preset('Stärkste 5'),
            preset('Schwächste 5'),
            preset('1 Punkt über Schwellenwert'),
            preset('1 Punkt unter Schwellenwert'),
        ];
        const { manager, table, container } = setup(gesamt);

        // Activate "1 Punkt unter Schwellenwert" (index 3) — it has no Leitidee equivalent.
        container.querySelector('[data-preset-index="3"]').click();
        expect(
            container.querySelector('[data-preset-index="3"]').classList.contains('is-active'),
        ).toBe(true);

        manager.updatePresets([preset('Stärkste 5'), preset('Schwächste 5')], table);

        // No dangling active index: nothing may render as active.
        expect(container.querySelectorAll('.is-active')).toHaveLength(0);
    });

    it('renders a disabled preset with aria-disabled and ignores its clicks', () => {
        const disabled = new Preset({
            label: 'Unter KS',
            sort: [{ column: 'name', dir: 'asc' }],
            disabled: true,
        });
        const { table, container } = setup([disabled, preset('Stärkste 5')]);
        const disabledButton = container.querySelector('[data-preset-index="0"]');

        expect(disabledButton.getAttribute('aria-disabled')).toBe('true');
        expect(
            container.querySelector('[data-preset-index="1"]').hasAttribute('aria-disabled'),
        ).toBe(false);

        disabledButton.click();
        expect(table.setSort).not.toHaveBeenCalled();
        expect(disabledButton.getAttribute('aria-pressed')).toBe('false');

        container.querySelector('[data-preset-index="1"]').click();
        expect(table.setSort).toHaveBeenCalled();
    });

    it('re-renders when only a preset’s disabled state changes', () => {
        const { manager, table, container } = setup([preset('Unter KS')]);

        manager.updatePresets(
            [
                new Preset({
                    label: 'Unter KS',
                    sort: [{ column: 'name', dir: 'asc' }],
                    disabled: true,
                }),
            ],
            table,
        );

        expect(
            container.querySelector('[data-preset-index="0"]').getAttribute('aria-disabled'),
        ).toBe('true');
    });

    it('does NOT re-render the buttons when the labels are unchanged', () => {
        // EN/SL only re-target a preset's sort column; their button row must survive
        // untouched, otherwise it would flicker on every mode switch.
        const { manager, table, container } = setup([preset('Stärkste 5'), preset('Schwächste 5')]);
        const before = [
            ...container.querySelectorAll('[data-preset-button], [data-table-preset-button]'),
        ];

        manager.updatePresets(
            [
                new Preset({
                    label: 'Stärkste 5',
                    sort: [{ column: 'd1SummedResult', dir: 'desc' }],
                }),
                new Preset({
                    label: 'Schwächste 5',
                    sort: [{ column: 'd1SummedResult', dir: 'asc' }],
                }),
            ],
            table,
        );

        const after = [
            ...container.querySelectorAll('[data-preset-button], [data-table-preset-button]'),
        ];
        expect(after).toHaveLength(before.length);
        // Same DOM nodes — proof nothing was rebuilt.
        after.forEach((node, i) => expect(node).toBe(before[i]));
    });
});
