// @vitest-browser
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    renderSectionBlocks,
    renderSectionButtons,
} from '../../../../src/sl/modules/infoBox/infoBoxSectionDom.js';
import { createTestContext } from '../../../support/glossaryFixture.js';
import { required } from '../../../support/required.js';

/**
 * The section buttons drawn into the host.
 * @returns {HTMLButtonElement[]} In order.
 */
const sectionButtons = () =>
    [...host.querySelectorAll('.info-box-section-btn')].map(
        (button) => /** @type {HTMLButtonElement} */ (button),
    );

/**
 * The DOM one info-box section becomes. The grouping rules — text items share a list,
 * a link group breaks it, sublists nest — are what the stylesheet lays out, so a wrong
 * tree renders as wrong spacing rather than as an error.
 */

/** @type {HTMLDivElement} */
let host;
/** @type {import('../../../../src/common/context/index.js').ModuleContext['glossary']} */
let glossary;

beforeEach(() => {
    ({ glossary } = createTestContext('sl'));
    host = document.createElement('div');
    document.body.replaceChildren(host);
});

describe('renderSectionBlocks', () => {
    it('groups consecutive text entries into one list and breaks it at a link group', () => {
        renderSectionBlocks(
            glossary,
            host,
            [
                { type: 'text', segments: [{ text: 'eins' }], children: [] },
                { type: 'text', segments: [{ text: 'zwei' }], children: [] },
                { type: 'links', links: [{ label: 'Material', onActivate: async () => {} }] },
                { type: 'text', segments: [{ text: 'drei' }], children: [] },
            ],
            () => {},
        );

        const sequence = required(host.querySelector('.info-box-block-sequence'));
        expect([...sequence.children].map((child) => child.className)).toEqual([
            'info-box-block-list layout-stack',
            'btn-group btn-group--wrap info-box-link-list',
            'info-box-block-list layout-stack',
        ]);
        expect(sequence.children[0].querySelectorAll('li')).toHaveLength(2);
    });

    it('nests children as a sublist and renders nothing for an empty section', () => {
        renderSectionBlocks(
            glossary,
            host,
            [
                {
                    type: 'text',
                    segments: [{ text: 'Fach' }],
                    children: [{ type: 'text', segments: [{ text: 'Domäne' }], children: [] }],
                },
            ],
            () => {},
        );

        expect(host.querySelector('li > ul.info-box-block-sublist > li')?.textContent).toBe(
            'Domäne',
        );

        renderSectionBlocks(glossary, host, [], () => {});
        expect(host.children).toHaveLength(0);
    });

    it('escapes markup in a text and wraps resolved values in spans', () => {
        renderSectionBlocks(
            glossary,
            host,
            [
                {
                    type: 'text',
                    segments: [{ text: '<b>x</b> ' }, { runs: [{ text: '42 %' }] }],
                    children: [],
                },
            ],
            () => {},
        );

        const html = required(host.querySelector('li')).innerHTML;
        expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
        expect(html).toContain('<span class="info-box-placeholder-value">42 %</span>');
    });

    it('links a Domäne value by the key of its run, not by its name', () => {
        renderSectionBlocks(
            glossary,
            host,
            [
                {
                    type: 'text',
                    segments: [
                        {
                            runs: [
                                { text: 'Englisch (' },
                                { text: 'Lesen', glossaryKey: 'leseverstehen' },
                                { text: ')' },
                            ],
                        },
                    ],
                    children: [],
                },
            ],
            () => {},
        );

        const value = required(host.querySelector('.info-box-placeholder-value'));
        expect(value.textContent).toBe('Englisch (Lesen)');
        expect(
            [...value.querySelectorAll('[data-glossary-key]')].map((term) => [
                term.textContent,
                term.getAttribute('data-glossary-key'),
            ]),
        ).toEqual([['Lesen', 'leseverstehen']]);
    });

    it('calls onLinkActivate with the link, and disables a link that cannot be activated', () => {
        const onLinkActivate = vi.fn();
        const active = { label: 'Öffnen', onActivate: async () => {} };
        renderSectionBlocks(
            glossary,
            host,
            [
                {
                    type: 'links',
                    links: [active, { label: 'Aus', onActivate: null }],
                },
            ],
            onLinkActivate,
        );

        const buttons = host.querySelectorAll('button');
        expect(buttons).toHaveLength(2);
        // Focusable, so its tooltip can say the page is not there yet in the prototype.
        expect(buttons[1].getAttribute('aria-disabled')).toBe('true');
        expect(buttons[1].dataset.tooltipText).toBeTruthy();

        buttons[1].click();
        buttons[0].click();
        expect(onLinkActivate.mock.calls).toEqual([[active]]);
    });
});

describe('section buttons', () => {
    const metas = [
        { key: 'general', icon: 'article', tooltipText: 'Allgemein' },
        { key: 'praise', icon: 'lightbulb', tooltipText: 'Stärken' },
    ];

    it('renders one button per section, marking the active one', () => {
        renderSectionButtons(host, metas, 'praise', () => {});

        const buttons = sectionButtons();
        expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
            'Allgemein',
            'Stärken',
        ]);
        expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual([
            'false',
            'true',
        ]);
        expect(buttons[1].classList.contains('is-active')).toBe(true);
        expect(buttons[0].getAttribute('aria-label')).toBe('Allgemein');
        expect(buttons[0].querySelector('svg')).not.toBeNull();
    });

    it('moves the active mark without rebuilding, and reports a pressed section', () => {
        renderSectionButtons(host, metas, 'praise', () => {});
        const before = sectionButtons()[0];

        const onSelect = vi.fn();
        renderSectionButtons(host, metas, 'general', onSelect);

        const after = sectionButtons()[0];
        expect(after).toBe(before);
        expect(after.getAttribute('aria-pressed')).toBe('true');
        expect(host.querySelectorAll('.is-active')).toHaveLength(1);

        after.click();
        expect(onSelect).toHaveBeenCalledWith('general');
    });
});
