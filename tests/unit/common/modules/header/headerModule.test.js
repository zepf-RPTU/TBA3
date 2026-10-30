// @vitest-browser

import { describe, it, expect, vi } from 'vitest';
import { createIcon } from '@tba3/module-base';
import { HeaderModule } from '../../../../../src/common/modules/header/headerModule.js';
import { createTestAppContext } from '../../../support/glossaryFixture.js';
import '../../../../../src/styles/header-module.css';

const context = createTestAppContext('en');

/** @returns {import('../../../../../src/common/modules/header/headerModule.js').HeaderRenderPayload} A payload with no controls. */
const basePayload = (overrides = {}) => ({
    headerText: 'Ansicht',
    subtitle: '',
    iconName: null,
    tour: false,
    controls: [],
    ...overrides,
});

/** @returns {Promise<{header: HeaderModule, onNotesClicked: ReturnType<typeof vi.fn>}>} */
async function renderHeader(payload = basePayload()) {
    const onNotesClicked = vi.fn();
    const header = HeaderModule.create('test-header', {
        context,
        onNotesClicked,
        onInfoClicked: vi.fn(),
        onControlChanged: vi.fn(),
    });
    document.body.appendChild(header);
    await show(header, payload);
    return { header, onNotesClicked };
}

/**
 * Hand the header a payload and wait until it shows it.
 * @param {HeaderModule} header
 * @param {import('../../../../../src/common/modules/header/headerModule.js').HeaderRenderPayload} payload
 * @returns {Promise<boolean>}
 */
function show(header, payload) {
    header.payload = payload;
    return header.updateComplete;
}

describe('HeaderModule action buttons', () => {
    it('labels the notes button from the glossary, unpressed, with its icon', async () => {
        await renderHeader();
        const button = document.querySelector('[data-header-action-button="notes-toggle"]');

        expect(button?.getAttribute('aria-label')).toBe(
            context.glossary.getRequiredEntryText(
                'general.buttons.element_texts.notes-toggle.label',
            ),
        );
        expect(button?.getAttribute('aria-pressed')).toBe('false');
        expect(button?.classList.contains('is-active')).toBe(false);
        expect(button?.querySelector('svg path')?.getAttribute('d')).toBe(
            createIcon('edit_note').querySelector('path')?.getAttribute('d'),
        );
    });

    it('reports a click without pressing itself; setActionPressed shows the state', async () => {
        // The app owns whether the drawer is open: a click it refuses must not leave
        // the button looking pressed.
        const { header, onNotesClicked } = await renderHeader();
        const button = /** @type {HTMLButtonElement} */ (
            document.querySelector('[data-header-action-button="notes-toggle"]')
        );

        button.click();

        expect(onNotesClicked).toHaveBeenCalledOnce();
        expect(button.getAttribute('aria-pressed')).toBe('false');

        header.setActionPressed('notes', true);
        await header.updateComplete;
        // An active button must look pressed, not only announce it.
        expect(button.getAttribute('aria-pressed')).toBe('true');
        expect(button.classList.contains('is-active')).toBe(true);
    });
});

describe('HeaderModule controls', () => {
    /** @type {import('../../../../../src/common/modules/header/headerModule.js').RenderedControlItem[]} */
    const items = [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
    ];
    const payload = ({ hidden = false, value = 'a', choices = items } = {}) =>
        basePayload({
            controls: [
                { type: 'modeSwitch', id: 'mode', options: { items: choices, value } },
                { type: 'modeSwitch', id: 'viz', options: { items: choices, value: 'a', hidden } },
            ],
        });
    /**
     * @param {string} id
     * @returns {HTMLElement}
     */
    const switchOf = (id) =>
        /** @type {HTMLElement} */ (document.getElementById(`test-header-${id}`));

    it('reveals a hidden control and moves a value in place, keeping the elements', async () => {
        // A rebuilt header would drop the element under the pointer and the focus on
        // the control just used.
        const { header } = await renderHeader(payload({ hidden: true }));
        const modeSwitch = switchOf('mode');
        const vizSwitch = switchOf('viz');
        expect(vizSwitch.hidden).toBe(true);

        await show(header, payload({ hidden: false, value: 'b' }));

        expect(switchOf('mode')).toBe(modeSwitch);
        expect(switchOf('viz')).toBe(vizSwitch);
        expect(vizSwitch.hidden).toBe(false);
        expect(modeSwitch.querySelector('[data-mode="b"]')?.getAttribute('aria-pressed')).toBe(
            'true',
        );
    });

    it('takes new choices into the control it already shows', async () => {
        const { header } = await renderHeader(payload());
        const modeSwitch = switchOf('mode');

        await show(header, payload({ choices: [...items, { value: 'c', label: 'C' }] }));

        expect(switchOf('mode')).toBe(modeSwitch);
        expect(switchOf('mode').querySelectorAll('[data-mode]')).toHaveLength(3);
    });

    it('shows a disabled choice disabled and never makes it the active one', async () => {
        // It names a choice that exists but cannot be made yet; a stored value naming
        // it must not come up pressed. `aria-disabled`, not `disabled`: it stays
        // focusable, so its tooltip can say why.
        const choices = [{ value: 'x', label: 'X', disabled: true }, ...items];
        await renderHeader(payload({ choices, value: 'x' }));
        const unavailable = /** @type {HTMLButtonElement} */ (
            switchOf('mode').querySelector('[data-mode="x"]')
        );

        expect(unavailable.getAttribute('aria-disabled')).toBe('true');
        expect(unavailable.disabled).toBe(false);
        expect(unavailable.getAttribute('aria-pressed')).toBe('false');
        unavailable.click();
        await Promise.resolve();
        expect(switchOf('mode').querySelector('[aria-pressed="true"]')?.textContent).toBe('A');
    });

    it('keeps the focus on a choice it makes active, in a named group', async () => {
        // A natively disabled active button would drop the focus to the page the moment
        // Enter chose it, and keep the active choice out of the tab order.
        await renderHeader(
            basePayload({
                controls: [
                    {
                        type: 'modeSwitch',
                        id: 'mode',
                        options: { items, value: 'a', label: 'Fach' },
                    },
                ],
            }),
        );
        const modeSwitch = switchOf('mode');
        expect(modeSwitch.getAttribute('role')).toBe('group');
        expect(modeSwitch.getAttribute('aria-label')).toBe('Fach');
        const choice = /** @type {HTMLButtonElement} */ (
            modeSwitch.querySelector('[data-mode="b"]')
        );

        choice.focus();
        choice.click();
        await Promise.resolve();

        expect(choice.getAttribute('aria-pressed')).toBe('true');
        expect(choice.getAttribute('aria-disabled')).toBe('true');
        expect(choice.disabled).toBe(false);
        expect(document.activeElement).toBe(choice);
    });

    it('makes no choice active when none can be made', async () => {
        await renderHeader(payload({ choices: [{ value: 'x', label: 'X', disabled: true }] }));

        expect(switchOf('mode').querySelector('[aria-pressed="true"]')).toBeNull();
    });

    it('drops a control the next view does not declare', async () => {
        const { header } = await renderHeader(payload());

        await show(
            header,
            basePayload({
                controls: [{ type: 'modeSwitch', id: 'mode', options: { items, value: 'a' } }],
            }),
        );

        expect(document.getElementById('test-header-viz')).toBeNull();
        expect(switchOf('mode')).not.toBeNull();
    });

    it('throws on a control type it has no module for', async () => {
        const { header } = await renderHeader();

        await expect(
            show(
                header,
                basePayload({
                    controls: [{ type: /** @type {any} */ ('buttonGroup'), id: 'x', options: {} }],
                }),
            ),
        ).rejects.toThrow("unknown control type 'buttonGroup'");
    });
});

describe('HeaderModule row fit', () => {
    /**
     * A header in a box of the given width, its layout sheet applied.
     * @param {number} widthPx
     * @param {number} controlCount - Mode switches with two choices each.
     * @returns {Promise<{header: HeaderModule, box: HTMLElement}>}
     */
    async function headerIn(widthPx, controlCount) {
        const box = document.createElement('div');
        box.style.width = `${widthPx}px`;
        document.body.appendChild(box);
        const header = HeaderModule.create(`fit-header-${widthPx}-${controlCount}`, {
            context,
            onNotesClicked: vi.fn(),
            onInfoClicked: vi.fn(),
            onControlChanged: vi.fn(),
        });
        box.appendChild(header);
        await show(header, controlsPayload(controlCount));
        return { header, box };
    }

    /**
     * @param {number} count
     * @returns {import('../../../../../src/common/modules/header/headerModule.js').HeaderRenderPayload}
     */
    const controlsPayload = (count) =>
        basePayload({
            headerText: 'Aufgabenansicht',
            controls: Array.from({ length: count }, (_, index) => ({
                type: /** @type {const} */ ('modeSwitch'),
                id: `mode-${index}`,
                options: {
                    items: [
                        { value: 'a', label: 'Lerngruppe' },
                        { value: 'b', label: 'Schüler:innen' },
                    ],
                    value: 'a',
                },
            })),
        });

    /**
     * @param {HeaderModule} header
     * @returns {Promise<boolean>} Whether it settled stacked.
     */
    const stackedAfterFit = async (header) => {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        return header.classList.contains('header-module--stacked');
    };

    it('keeps one row while title, controls and actions fit it', async () => {
        const { header } = await headerIn(1400, 1);
        expect(await stackedAfterFit(header)).toBe(false);
    });

    it('stacks the controls when one row cannot hold them', async () => {
        const { header } = await headerIn(500, 2);
        expect(await stackedAfterFit(header)).toBe(true);
    });

    it('decides by what it shows: more controls at the same width stack it', async () => {
        const { header } = await headerIn(1000, 1);
        expect(await stackedAfterFit(header)).toBe(false);

        await show(header, controlsPayload(5));
        expect(await stackedAfterFit(header)).toBe(true);
    });

    it('follows a resize both ways', async () => {
        const { header, box } = await headerIn(1400, 2);
        expect(await stackedAfterFit(header)).toBe(false);

        box.style.width = '500px';
        await expect.poll(() => header.classList.contains('header-module--stacked')).toBe(true);

        box.style.width = '1400px';
        await expect.poll(() => header.classList.contains('header-module--stacked')).toBe(false);
    });
});
