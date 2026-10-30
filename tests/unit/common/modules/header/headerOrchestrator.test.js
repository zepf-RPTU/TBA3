// @vitest-browser
import { describe, expect, it, vi } from 'vitest';

import { HeaderOrchestrator } from '../../../../../src/common/modules/header/headerOrchestrator.js';
import { missingGlossaryText } from '@tba3/module-base/glossary';

import { createState } from '@tba3/module-base';
import { createTestAppContext } from '../../../support/glossaryFixture.js';
import { stateChoiceControl } from '../../../../../src/common/modules/header/stateChoiceControl.js';
import { queryHtml } from '../../../../../packages/modules/test/support/dom.js';
/** @typedef {import('../../../../../src/common/modules/header/modeSwitchModule.js').ModeSwitchModule} ModeSwitchModule */

/** @typedef {import('../../../../../src/common/modules/header/headerOrchestrator.js').HeaderControlDeclaration} HeaderControlDeclaration */
/** @typedef {import('../../../../../src/common/modules/header/headerModule.js').HeaderControlChange} HeaderControlChange */
/** @typedef {import('@tba3/module-base/glossary').GlossaryTree} GlossaryTree */

// Pins the per-control onChange dispatch (a change reaches exactly the declaring
// control) and how the view's glossary entry reaches the rendered header.

const VIEW_CONFIG = {
    summary: { headerGlossaryPath: 'x.summary.header' },
    group: { headerGlossaryPath: 'x.group.header' },
    item: { headerGlossaryPath: 'x.item.header' },
};

/**
 * @param {{[viewType: string]: HeaderControlDeclaration[]}} [viewControls]
 * @param {GlossaryTree} [glossary]
 */
async function makeOrchestrator(viewControls = {}, glossary = {}) {
    const orchestrator = new HeaderOrchestrator({
        ownerName: 'TestApp',
        headerId: 'test-header',
        headerClassName: 'test-header-container',
        viewConfig: VIEW_CONFIG,
        glossaryData: glossary,
        viewControls,
        context: createTestAppContext('en'),
        onNotesClicked: () => {},
        onInfoClicked: () => {},
    });
    // The coordinator places the header; it renders once it is in the document.
    const { header } = orchestrator;
    document.body.replaceChildren(header);
    await orchestrator.init();
    return { orchestrator, header };
}

const items = [{ value: 'a', label: 'A' }];

describe('HeaderOrchestrator control changes', () => {
    it('ignores an unknown control id, and any change before a view is shown', async () => {
        const onChange = vi.fn();
        const { orchestrator, header } = await makeOrchestrator({
            summary: [{ type: 'select', id: 'metric-select', options: { items }, onChange }],
        });

        expect(() =>
            header.options.onControlChanged('metric-select', { value: 'x' }),
        ).not.toThrow();
        await orchestrator.updateForView('summary');
        expect(() => header.options.onControlChanged('nope', { value: 'x' })).not.toThrow();

        expect(onChange).not.toHaveBeenCalled();
    });

    it('routes a change to the onChange of the control that declared it', async () => {
        const onMetricChange = vi.fn();
        const onOtherChange = vi.fn();
        const { orchestrator, header } = await makeOrchestrator({
            summary: [
                {
                    type: 'select',
                    id: 'metric-select',
                    options: { items },
                    onChange: onMetricChange,
                },
                {
                    type: 'modeSwitch',
                    id: 'view-mode',
                    options: { items },
                    onChange: onOtherChange,
                },
            ],
        });
        await orchestrator.updateForView('summary');

        header.options.onControlChanged('metric-select', { value: 'x' });

        expect(onMetricChange).toHaveBeenCalledWith({ value: 'x' });
        expect(onOtherChange).not.toHaveBeenCalled();
    });

    it("prefers the current view's declaration when two views declare the same control id", async () => {
        // EN builds its domain switch once per view, so three units share one id. A
        // flat first-match scan would run the group view's handler for a change
        // made on the item view.
        const onGroupChange = vi.fn();
        const onItemChange = vi.fn();
        /**
         * @param {(data: HeaderControlChange) => void} onChange
         * @returns {HeaderControlDeclaration}
         */
        const domainSwitch = (onChange) => ({
            type: 'modeSwitch',
            id: 'domain-switch',
            options: { items },
            onChange,
        });
        const { orchestrator, header } = await makeOrchestrator({
            group: [domainSwitch(onGroupChange)],
            item: [domainSwitch(onItemChange)],
        });

        await orchestrator.updateForView('item');
        header.options.onControlChanged('domain-switch', { value: 'ho' });

        expect(onItemChange).toHaveBeenCalledWith({ value: 'ho' });
        expect(onGroupChange).not.toHaveBeenCalled();
    });

    it('builds no controls for the title-first render of a view that waits for data', async () => {
        // Controls may read the data; the title needs only the glossary.
        const injectState = vi.fn();
        const { orchestrator } = await makeOrchestrator({
            group: [{ type: 'modeSwitch', id: 'm', options: { items }, injectState }],
        });

        await orchestrator.updateForView('group', { withControls: false });

        expect(injectState).not.toHaveBeenCalled();
    });
});

describe('HeaderOrchestrator follows the app state', () => {
    const layoutItems = [
        { value: 'both', label: 'Beides' },
        { value: 'chart', label: 'Nur Diagramm' },
    ];
    /**
     * @param {HTMLElement} header
     * @returns {string|undefined} The mode of the pressed switch button.
     */
    const pressed = (header) =>
        /** @type {HTMLElement|null} */ (header.querySelector('[aria-pressed="true"]'))?.dataset
            .mode;

    it('re-syncs the shown controls when anyone else writes the state they read', async () => {
        // A view (MA ring click, a student pick) or a navigation patch writes keys a
        // header control shows; the header must follow without being told.
        const ctx = { state: createState({ layoutMode: 'both', displayMode: 'charts' }) };
        const { orchestrator, header } = await makeOrchestrator({
            item: [
                stateChoiceControl(ctx, {
                    type: 'modeSwitch',
                    id: 'layout',
                    stateKey: 'layoutMode',
                    items: layoutItems,
                    resolveHidden: () => ctx.state.displayMode.value === 'charts',
                }),
            ],
        });
        await orchestrator.updateForView('item');
        const control = queryHtml(header, '#test-header-layout');
        expect(control.hidden).toBe(true);

        ctx.state.displayMode.value = 'table';
        ctx.state.layoutMode.value = 'chart';
        await /** @type {ModeSwitchModule} */ (control).updateComplete;

        // Patched in place: the same element, now shown and on the written value.
        expect(header.querySelector('#test-header-layout')).toBe(control);
        expect(control.hidden).toBe(false);
        expect(pressed(header)).toBe('chart');
    });

    it("a control's own change writes the state once and renders the header once", async () => {
        // The write re-runs the header effect, whose sync must not report a change
        // back: that would loop.
        const ctx = { state: createState({ layoutMode: 'both' }) };
        const declaration = stateChoiceControl(ctx, {
            type: 'modeSwitch',
            id: 'layout',
            stateKey: 'layoutMode',
            items: layoutItems,
        });
        const onChange = vi.spyOn(declaration, 'onChange');
        const { orchestrator, header } = await makeOrchestrator({ item: [declaration] });
        await orchestrator.updateForView('item');

        /** @type {HTMLButtonElement} */ (header.querySelector('[data-mode="chart"]')).click();
        await /** @type {ModeSwitchModule} */ (queryHtml(header, '#test-header-layout'))
            .updateComplete;

        expect(onChange).toHaveBeenCalledTimes(1);
        expect(ctx.state.layoutMode.value).toBe('chart');
        expect(pressed(header)).toBe('chart');
    });

    it('stops following a view once another is asked for', async () => {
        const ctx = { state: createState({ layoutMode: 'both', groupMode: 'a' }) };
        const injectState = vi.fn((control) => {
            control.options.value = ctx.state.layoutMode.value;
        });
        const injectGroupState = vi.fn((control) => {
            control.options.value = ctx.state.groupMode.value;
        });
        const { orchestrator } = await makeOrchestrator({
            item: [
                { type: 'modeSwitch', id: 'layout', options: { items: layoutItems }, injectState },
            ],
            group: [
                {
                    type: 'modeSwitch',
                    id: 'group-mode',
                    options: { items },
                    injectState: injectGroupState,
                },
            ],
        });
        await orchestrator.updateForView('item');
        // Followed while shown, so the silence below is the switch's doing.
        injectState.mockClear();
        ctx.state.layoutMode.value = 'chart';
        expect(injectState).toHaveBeenCalled();

        await orchestrator.updateForView('group');
        injectState.mockClear();
        injectGroupState.mockClear();

        ctx.state.layoutMode.value = 'both';

        expect(injectState).not.toHaveBeenCalled();
        expect(injectGroupState).not.toHaveBeenCalled();
    });
});

/**
 * Render `viewType`'s header from `glossary`, with `controls` declared on it.
 * @param {GlossaryTree} glossary
 * @param {string} viewType
 * @param {HeaderControlDeclaration[]} [controls]
 * @returns {Promise<HTMLElement>} The header container.
 */
async function renderHeader(glossary, viewType, controls = []) {
    const { orchestrator, header } = await makeOrchestrator({ [viewType]: controls }, glossary);
    await orchestrator.updateForView(viewType);
    return header;
}

/**
 * A mode switch whose items each name their own glossary entry.
 * @param {NonNullable<HeaderControlDeclaration['options']['items']>} keyedItems
 * @returns {HeaderControlDeclaration}
 */
const modeSwitch = (keyedItems) => ({
    type: 'modeSwitch',
    id: 'x',
    options: { glossarySubKey: 'none', items: keyedItems },
});

/**
 * @param {HTMLElement} header
 * @returns {string|null|undefined}
 */
const titleOf = (header) => header.querySelector('.header-module-title')?.textContent;
/**
 * @param {HTMLElement} header
 * @returns {string|null|undefined}
 */
const subtitleOf = (header) => header.querySelector('.header-module-subtitle')?.textContent;

describe('HeaderOrchestrator.updateForView: glossary header copy', () => {
    it('renders the glossary title, the stripped subtitle and the control labels', async () => {
        // The glossary is the single source of header subtitles: this read is the
        // only writer of `subtitle`.
        const header = await renderHeader(
            {
                x: {
                    group: {
                        header: {
                            title: 'Lerngruppenübersicht',
                            subtitle: '<p>Wie steht die <b>Lerngruppe</b>?</p>',
                            interface: { 'domain-all': { label: 'Alle' } },
                        },
                    },
                },
            },
            'group',
            [
                {
                    type: 'modeSwitch',
                    id: 'domain',
                    options: {
                        items: [{ value: 'all', glossarySubKey: 'domain-all' }],
                    },
                },
            ],
        );

        expect(titleOf(header)).toBe('Lerngruppenübersicht');
        expect(subtitleOf(header)).toBe('Wie steht die Lerngruppe?');
        expect(header.querySelector('[data-mode="all"]')?.textContent).toBe('Alle');
    });

    it('renders no subtitle for an entry without subtitle copy', async () => {
        const header = await renderHeader(
            { x: { group: { header: { title: 'Lerngruppe' } } } },
            'group',
        );

        expect(titleOf(header)).toBe('Lerngruppe');
        expect(header.querySelector('.header-module-subtitle')).toBeNull();
    });

    it("fills the app's tokens into title and subtitle, empty until set, and redraws on them", async () => {
        // The welcome header names the payload's Fach, which is known only once the data
        // lands; the header shows before, so the token reads empty meanwhile.
        const { orchestrator, header } = await makeOrchestrator(
            {},
            { x: { group: { header: { title: '{{Fach}} VERA-8', subtitle: 'Fach: {{Fach}}' } } } },
        );
        await orchestrator.updateForView('group');
        expect(titleOf(header)).toBe('VERA-8');
        expect(subtitleOf(header)).toBe('Fach:');

        orchestrator.setTokens({ Fach: 'Englisch' });
        await header.updateComplete;

        expect(titleOf(header)).toBe('Englisch VERA-8');
        expect(subtitleOf(header)).toBe('Fach: Englisch');
    });

    it('renders the missing-title marker when the entry has no title', async () => {
        // The glossary owns header copy; the marker makes a missing entry visible.
        const header = await renderHeader(
            { x: { group: { header: { subtitle: 'nur Text' } } } },
            'group',
        );

        expect(titleOf(header)).toBe(missingGlossaryText('x.group.header'));
        expect(subtitleOf(header)).toBe('nur Text');
        expect(titleOf(await renderHeader({}, 'item'))).toBe(missingGlossaryText('x.item.header'));
    });
});

describe('HeaderOrchestrator.updateForView: glossary control labels', () => {
    /**
     * @param {{[subKey: string]: import('@tba3/module-base/glossary').GlossaryEntry}} glossaryInterface - The summary header's control labels.
     * @returns {GlossaryTree} A glossary with that header entry.
     */
    const glossaryWith = (glossaryInterface) => ({
        x: { summary: { header: { title: 'Übersicht', interface: glossaryInterface } } },
    });
    const glossary = glossaryWith({
        'domain-switch': { label: 'Domäne', tooltip: 'Hören oder Lesen' },
        'domain-ho': { label: '<i>Hören</i>' },
        'metric-lq': { label: 'Lösungsquote' },
    });

    it('labels the control and its keyed items from the glossary, leaving data-derived ones alone', async () => {
        // One glossary entry per key, resolved per part: an item without a key (a
        // data-derived choice) keeps its declared label rather than inherit the control's.
        const header = await renderHeader(glossary, 'summary', [
            {
                type: 'select',
                id: 'domain-switch',
                options: {
                    glossarySubKey: 'domain-switch',
                    label: 'declared',
                    items: [
                        { value: 'ho', glossarySubKey: 'domain-ho' },
                        { value: 'le', label: 'LE' },
                        { value: 'lq', glossarySubKey: 'metric-lq' },
                    ],
                },
            },
        ]);

        expect(header.querySelector('.control-label')?.textContent).toBe('Domäne');
        expect(header.querySelector('select')?.dataset.tooltipText).toBe('Hören oder Lesen');
        expect([...header.querySelectorAll('option')].map((option) => option.textContent)).toEqual([
            'Hören',
            'LE',
            'Lösungsquote',
        ]);
    });

    it("falls back to the app's own labels for a control several views share, the view's winning", async () => {
        // The dataset selector and the domain switch sit in several views; their
        // wording lives once per app, and a view that words one differently still can.
        const header = await renderHeader(
            {
                x: {
                    header: { interface: { shared: { label: 'App' }, own: { label: 'App' } } },
                    summary: {
                        header: { title: 'Übersicht', interface: { own: { label: 'View' } } },
                    },
                },
            },
            'summary',
            [
                modeSwitch([
                    { value: 'a', glossarySubKey: 'shared' },
                    { value: 'b', glossarySubKey: 'own' },
                ]),
            ],
        );

        expect(queryHtml(header, '[data-mode="a"]').textContent).toBe('App');
        expect(queryHtml(header, '[data-mode="b"]').textContent).toBe('View');
    });

    it('renders the missing-entry marker for a keyed item whose entry has no label', async () => {
        // No code caption can mask a missing entry; the tooltip still resolves.
        const header = await renderHeader(
            glossaryWith({ 'tooltip-only': { tooltip: 'nur Tooltip' } }),
            'summary',
            [modeSwitch([{ value: 'm', glossarySubKey: 'tooltip-only' }])],
        );

        const button = queryHtml(header, '[data-mode="m"]');
        expect(button.textContent).toBe(
            missingGlossaryText('x.summary.header.interface.tooltip-only'),
        );
        expect(button.dataset.tooltipText).toBe('nur Tooltip');
    });

    it("names the app's shared entry for a missing label the app declares, the view's otherwise", async () => {
        // The marker must send the author to where the label belongs; a shared
        // control's label lives once per app, not under the view that shows it.
        const header = await renderHeader(
            {
                x: {
                    header: { interface: { shared: { tooltip: 'nur Tooltip' } } },
                    summary: { header: { title: 'Übersicht' } },
                },
            },
            'summary',
            [
                modeSwitch([
                    { value: 'a', glossarySubKey: 'shared' },
                    { value: 'b', glossarySubKey: 'own' },
                ]),
            ],
        );

        expect(queryHtml(header, '[data-mode="a"]').textContent).toBe(
            missingGlossaryText('x.header.interface.shared'),
        );
        expect(queryHtml(header, '[data-mode="b"]').textContent).toBe(
            missingGlossaryText('x.summary.header.interface.own'),
        );
    });
});
