// @vitest-browser
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render } from 'lit';

import { tableFilterMenu } from '../../../../src/common/tables/internal/tableFilterMenu.js';
import { createTestContext } from '../../../support/glossaryFixture.js';
import { required } from '../../../support/required.js';

// The values live in the owning table; the panel reads and writes them through the
// passed accessors.

/** @type {import('../../../../src/common/tables/internal/tableFilterMetadata.js').TableFilterDescriptor[]} */
const DESCRIPTORS = [
    { field: 'name', title: 'Name', type: 'input', params: {} },
    {
        field: 'gender',
        title: 'Geschlecht',
        type: 'list',
        params: { values: { w: 'Weiblich', m: 'Männlich', d: 'Divers' } },
    },
];

/** @type {import('../../../../src/common/context/index.js').GlossaryAnnotator} */
let glossary;

beforeAll(() => {
    glossary = createTestContext().glossary;
});

/**
 * A panel element, asserted present.
 * @template {keyof HTMLElementTagNameMap} K
 * @param {ParentNode} parent
 * @param {string} selector
 * @param {K} tag - Types the result.
 * @returns {HTMLElementTagNameMap[K]}
 */
const find = (parent, selector, tag) =>
    required(parent.querySelector(/** @type {K} */ (selector)), `${tag} ${selector}`);

/**
 * Mount the menu over an in-memory value store and open it.
 * @param {{[field: string]: import('../../../../src/common/tables/internal/tableFilterMetadata.js').TableFilterValue}} [initial] - The values set before it opens.
 */
function openPanel(initial = {}) {
    const values = { ...initial };
    const onChange = vi.fn((/** @type {string} */ field, /** @type {any} */ value) => {
        values[field] = value;
    });
    const onClearAll = vi.fn(() => {
        for (const field of Object.keys(values)) delete values[field];
    });
    const headerActions = document.createElement('div');
    document.body.appendChild(headerActions);
    render(
        tableFilterMenu({
            activeCount: 0,
            getDescriptors: () => DESCRIPTORS,
            getValue: (field) => values[field] ?? (field === 'gender' ? [] : ''),
            getRows: () => [],
            onChange,
            onClearAll,
            glossary,
        }),
        headerActions,
    );
    find(headerActions, 'button[aria-expanded]', 'button').click();
    const panel = find(headerActions, '.table-filter-panel', 'ul');
    return { panel, onChange, onClearAll };
}

/**
 * @param {HTMLElement} panel
 * @returns {HTMLButtonElement} The Geschlecht list's summary button: the control its label names.
 */
const summaryButton = (panel) => {
    const label = [...panel.querySelectorAll('label')].find(
        (node) => node.textContent?.trim() === 'Geschlecht',
    );
    return /** @type {HTMLButtonElement} */ (required(required(label).control, 'Geschlecht'));
};

/**
 * @param {HTMLElement} panel
 * @param {string} value
 * @returns {HTMLButtonElement} The Geschlecht list's checkbox for that value.
 */
const option = (panel, value) =>
    find(
        required(
            document.getElementById(required(summaryButton(panel).getAttribute('aria-controls'))),
        ),
        `[data-menu-item-id="${value}"]`,
        'button',
    );

/**
 * Check or uncheck one option of the Geschlecht list, expanding it first when needed.
 * @param {HTMLElement} panel
 * @param {string} value
 */
function toggleOption(panel, value) {
    if (summaryButton(panel).getAttribute('aria-expanded') !== 'true') summaryButton(panel).click();
    option(panel, value).click();
}

/**
 * @param {HTMLElement} panel
 * @returns {HTMLButtonElement|null} Its clear-all action, present only while a filter is set.
 */
const clearAll = (panel) => panel.querySelector('button.table-filter-clear');

describe('table filter panel', () => {
    it("shows a list's checkboxes only once its summary button expands it", () => {
        const { panel } = openPanel();
        const button = summaryButton(panel);
        expect(button.getAttribute('aria-expanded')).toBe('false');
        expect(panel.querySelector('.table-filter-options')).toBeNull();

        button.click();

        expect(button.getAttribute('aria-expanded')).toBe('true');
        const list = find(panel, 'ul.table-filter-options', 'ul');
        expect(button.getAttribute('aria-controls')).toBe(list.id);
        expect(list.querySelectorAll('[role="checkbox"]')).toHaveLength(3);
    });

    it('hands every checked value on, and a second click takes it out', () => {
        const { panel, onChange } = openPanel();

        toggleOption(panel, 'd');
        toggleOption(panel, 'w');

        expect(onChange).toHaveBeenLastCalledWith('gender', ['d', 'w']);
        toggleOption(panel, 'd');
        expect(onChange).toHaveBeenLastCalledWith('gender', ['w']);
    });

    it('keeps a selected value no option offers when another is checked', () => {
        // Derived options follow the persistent filters; a value they no longer
        // offer has no checkbox, and checking another must not drop it.
        const { panel, onChange } = openPanel({ gender: ['x'] });

        toggleOption(panel, 'w');

        expect(onChange).toHaveBeenLastCalledWith('gender', ['x', 'w']);
    });

    it("shows each option's state as the column menu's checkbox glyph", () => {
        const { panel } = openPanel();
        /** @param {string} value */
        const glyphState = (value) =>
            find(option(panel, value), '.icon-swap', 'span').dataset.state;

        toggleOption(panel, 'w');

        expect(glyphState('w')).toBe('on');
        expect(glyphState('m')).toBe('off');
    });

    it('names the selection on the summary button', () => {
        const { panel } = openPanel();
        const summary = () => summaryButton(panel).textContent?.trim();
        expect(summary()).toBe('Alle');

        toggleOption(panel, 'm');
        expect(summary()).toBe('Männlich');

        toggleOption(panel, 'd');
        expect(summary()).toBe('2 ausgewählt');
    });

    it('marks a filtering field and offers clear-all only while one filters', () => {
        const { panel } = openPanel();
        expect(clearAll(panel)).toBeNull();

        toggleOption(panel, 'w');

        expect(
            required(summaryButton(panel).closest('.table-filter-field')).classList.contains(
                'is-active',
            ),
        ).toBe(true);
        expect(clearAll(panel)).not.toBeNull();

        toggleOption(panel, 'w');
        expect(panel.querySelectorAll('.table-filter-field.is-active')).toHaveLength(0);
        expect(clearAll(panel)).toBeNull();
    });

    it('clear-all drops every value, re-renders unmarked and keeps focus in the panel', () => {
        const { panel, onClearAll } = openPanel();
        toggleOption(panel, 'w');

        required(clearAll(panel)).click();

        expect(onClearAll).toHaveBeenCalledOnce();
        expect(panel.querySelectorAll('.table-filter-field.is-active')).toHaveLength(0);
        expect(panel.querySelectorAll('[role="checkbox"][aria-checked="true"]')).toHaveLength(0);
        expect(summaryButton(panel).textContent?.trim()).toBe('Alle');
        expect(clearAll(panel)).toBeNull();
        expect(panel.contains(document.activeElement)).toBe(true);
    });
});
