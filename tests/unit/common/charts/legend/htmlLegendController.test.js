// @vitest-browser

/**
 * HtmlLegendController — the visibility contract every SL HTML legend shares.
 *
 * Each test encodes a rule the charts rely on rather than a DOM shape:
 *  - a viewer's toggles survive a re-render (resize, data refresh), but keys that
 *    left the data are dropped and new ones start visible
 *  - a section's `minVisible` floor silently refuses the click that would empty it
 *  - a master pill is derived from its children in both directions
 *  - a toggle-all heading flips the whole section as one change
 *  - the chart hears exactly one `onChange` per state change, with the live state
 *  - reset detaches the listener without forgetting the state
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HtmlLegendController } from '@tba3/modules/common/charts/legend/htmlLegendController.js';

/** @returns {{host: any, panel: HTMLElement, controller: HtmlLegendController}} */
function makeController() {
    const panel = document.createElement('div');
    document.body.appendChild(panel);
    const host = { options: { legendContainer: panel } };
    return { host, panel, controller: new HtmlLegendController(host) };
}

const pill = (panel, group, key) =>
    /** @type {HTMLButtonElement} */ (
        panel.querySelector(`.legend-pill[data-type="${group}"][data-value="${key}"]`)
    );
const master = (panel, group) =>
    /** @type {HTMLButtonElement} */ (
        panel.querySelector(`.legend-pill[data-type="${group}"][data-master]`)
    );

const subjects = (keys, extra = {}) => ({
    title: 'Fächer',
    group: 'subject',
    items: keys.map((key) => ({ key, label: key })),
    ...extra,
});

describe('HtmlLegendController', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('seeds every key visible and renders pressed pills', () => {
        const { panel, controller } = makeController();
        const state = controller.render([subjects(['Deutsch', 'Mathe'])], () => {});

        expect(state).toEqual({ subject: { Deutsch: true, Mathe: true } });
        expect(pill(panel, 'subject', 'Mathe').getAttribute('aria-pressed')).toBe('true');
    });

    it('a pill click flips its key, repaints, and reports the change once', () => {
        const { panel, controller } = makeController();
        const onChange = vi.fn();
        let state = controller.render([subjects(['Deutsch', 'Mathe'])], onChange);

        pill(panel, 'subject', 'Mathe').click();

        expect(controller.isVisible('subject', 'Mathe')).toBe(false);
        expect(controller.anyHidden()).toBe(true);
        expect(pill(panel, 'subject', 'Mathe').getAttribute('aria-pressed')).toBe('false');
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith({
            group: 'subject',
            key: 'Mathe',
            state: state,
        });
    });

    it('keeps a hidden key hidden across a re-render, drops stale keys, seeds new ones', () => {
        const { panel, controller } = makeController();
        controller.render([subjects(['Deutsch', 'Mathe'])], () => {});
        pill(panel, 'subject', 'Mathe').click();

        const state = controller.render([subjects(['Mathe', 'Englisch'])], () => {});

        expect(state).toEqual({ subject: { Mathe: false, Englisch: true } });
        expect(pill(panel, 'subject', 'Mathe').getAttribute('aria-pressed')).toBe('false');
        expect(panel.querySelectorAll('.legend-pill')).toHaveLength(2);
    });

    it('minVisible refuses the click that would empty the group and leaves the pill pressed', () => {
        const { panel, controller } = makeController();
        const onChange = vi.fn();
        let state = controller.render(
            [subjects(['Deutsch', 'Mathe'], { minVisible: 1 })],
            onChange,
        );

        pill(panel, 'subject', 'Deutsch').click();
        pill(panel, 'subject', 'Mathe').click();

        expect(state.subject).toEqual({ Deutsch: false, Mathe: true });
        expect(pill(panel, 'subject', 'Mathe').getAttribute('aria-pressed')).toBe('true');
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('minVisible counts across sections that share a group', () => {
        const { panel, controller } = makeController();
        let state = controller.render(
            [
                {
                    title: 'Deutsch',
                    group: 'domain',
                    minVisible: 1,
                    items: [{ key: 'Deutsch|Lesen', label: 'L' }],
                },
                {
                    title: 'Mathe',
                    group: 'domain',
                    minVisible: 1,
                    items: [{ key: 'Mathe|Zahlen', label: 'Z' }],
                },
            ],
            () => {},
        );

        pill(panel, 'domain', 'Deutsch|Lesen').click();
        pill(panel, 'domain', 'Mathe|Zahlen').click();

        expect(state.domain).toEqual({ 'Deutsch|Lesen': false, 'Mathe|Zahlen': true });
    });

    it('without a floor a group can go fully dark', () => {
        const { panel, controller } = makeController();
        let state = controller.render([subjects(['Deutsch'])], () => {});

        pill(panel, 'subject', 'Deutsch').click();

        expect(state.subject.Deutsch).toBe(false);
    });

    it('a master pill is pressed while any child is on and turns all children off, then all on', () => {
        const { panel, controller } = makeController();
        const onChange = vi.fn();
        let state = controller.render(
            [
                {
                    title: 'Klassen',
                    group: 'individual-class',
                    masterLabel: 'Klassen',
                    items: [
                        { key: '8a', label: '8a' },
                        { key: '8b', label: '8b' },
                    ],
                },
            ],
            onChange,
        );

        pill(panel, 'individual-class', '8a').click();
        expect(master(panel, 'individual-class').getAttribute('aria-pressed')).toBe('true');

        master(panel, 'individual-class').click();
        expect(state['individual-class']).toEqual({ '8a': false, '8b': false });
        expect(master(panel, 'individual-class').getAttribute('aria-pressed')).toBe('false');
        expect(onChange).toHaveBeenLastCalledWith({
            group: 'individual-class',
            key: null,
            state: state,
        });

        master(panel, 'individual-class').click();
        expect(state['individual-class']).toEqual({ '8a': true, '8b': true });
        expect(pill(panel, 'individual-class', '8b').getAttribute('aria-pressed')).toBe('true');
    });

    it('a toggle-all heading flips its section as one change and respects the group floor', () => {
        const { panel, controller } = makeController();
        const onChange = vi.fn();
        let state = controller.render(
            [
                {
                    title: 'Deutsch',
                    group: 'domain',
                    minVisible: 1,
                    toggleAll: true,
                    items: [
                        { key: 'Deutsch|Lesen', label: 'L' },
                        { key: 'Deutsch|Hören', label: 'H' },
                    ],
                },
                {
                    title: 'Mathe',
                    group: 'domain',
                    minVisible: 1,
                    toggleAll: true,
                    items: [{ key: 'Mathe|Zahlen', label: 'Z' }],
                },
            ],
            onChange,
        );
        const heading = /** @type {HTMLElement} */ (
            panel.querySelector('.legend-section-title--clickable')
        );

        heading.click();
        expect(state.domain).toEqual({
            'Deutsch|Lesen': false,
            'Deutsch|Hören': false,
            'Mathe|Zahlen': true,
        });
        expect(onChange).toHaveBeenCalledTimes(1);

        // Mathe is now the last visible key: its heading may not empty the group.
        const headings = panel.querySelectorAll('.legend-section-title--clickable');
        /** @type {HTMLElement} */ (headings[1]).click();
        expect(state.domain['Mathe|Zahlen']).toBe(true);
        expect(onChange).toHaveBeenCalledTimes(1);

        heading.click();
        expect(state.domain['Deutsch|Hören']).toBe(true);
    });

    it('a custom-drawn section joins the state through the keys it returns, and persists too', () => {
        const { panel, controller } = makeController();
        const ksSection = {
            group: 'competency-level',
            render(target) {
                const button = document.createElement('button');
                button.className = 'legend-pill';
                button.setAttribute('data-type', 'competency-level');
                button.setAttribute('data-value', 'ia');
                button.setAttribute('aria-pressed', 'true');
                target.appendChild(button);
                return ['ia'];
            },
        };
        let state = controller.render([ksSection], () => {});

        expect(state).toEqual({ 'competency-level': { ia: true } });
        pill(panel, 'competency-level', 'ia').click();
        expect(state['competency-level'].ia).toBe(false);

        state = controller.render([ksSection], () => {});
        expect(state['competency-level'].ia).toBe(false);
        expect(pill(panel, 'competency-level', 'ia').getAttribute('aria-pressed')).toBe('false');
    });

    it('reset detaches the handler and empties the panel but keeps the state', () => {
        const { panel, controller } = makeController();
        const onChange = vi.fn();
        let state = controller.render([subjects(['Deutsch', 'Mathe'])], onChange);
        pill(panel, 'subject', 'Mathe').click();

        const stalePill = pill(panel, 'subject', 'Deutsch');
        controller.reset();
        controller.reset();

        expect(panel.innerHTML).toBe('');
        stalePill.click();
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(state.subject.Mathe).toBe(false);
    });

    it('renders nothing without a panel but still seeds the state', () => {
        const controller = new HtmlLegendController({ options: {} });

        const state = controller.render([subjects(['Deutsch'])], () => {});

        expect(state).toEqual({ subject: { Deutsch: true } });
    });
});
