// @vitest-browser
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    renderBlockText,
    renderEmptyState,
    renderSectionBlocks,
    renderSectionButtons,
    setActiveSectionButton,
} from '@tba3/modules/sl/modules/infoBox/infoBoxSectionDom.js';
import {
    VALUE_MARKER_CLOSE,
    VALUE_MARKER_OPEN,
} from '@tba3/modules/sl/modules/infoBox/infoBoxTextResolver.js';
import { initGlossaryForTests } from '../../../support/glossaryFixture.js';

/**
 * The DOM one info-box section becomes. The grouping rules — text items share a list,
 * a link group breaks it, sublists nest — are what the stylesheet lays out, so a wrong
 * tree renders as wrong spacing rather than as an error.
 */

let host;

beforeEach(() => {
    initGlossaryForTests('sl');
    host = document.createElement('div');
    document.body.replaceChildren(host);
});

describe('renderSectionBlocks', () => {
    it('groups consecutive text entries into one list and breaks it at a link group', () => {
        renderSectionBlocks(
            host,
            [
                { type: 'text', text: 'eins', children: [] },
                { type: 'text', text: 'zwei', children: [] },
                { type: 'links', links: [{ label: 'Material', onActivate: () => {} }] },
                { type: 'text', text: 'drei', children: [] },
            ],
            () => {},
        );

        const sequence = host.querySelector('.info-box-block-sequence');
        expect([...sequence.children].map((child) => child.className)).toEqual([
            'info-box-block-list layout-stack',
            'btn-group btn-group--wrap info-box-link-list',
            'info-box-block-list layout-stack',
        ]);
        expect(sequence.children[0].querySelectorAll('li')).toHaveLength(2);
    });

    it('nests children as a sublist and renders nothing for an empty section', () => {
        renderSectionBlocks(
            host,
            [
                {
                    type: 'text',
                    text: 'Fach',
                    children: [{ type: 'text', text: 'Domäne', children: [] }],
                },
            ],
            () => {},
        );

        expect(host.querySelector('li > ul.info-box-block-sublist > li')?.textContent).toBe(
            'Domäne',
        );

        renderSectionBlocks(host, [], () => {});
        expect(host.children).toHaveLength(0);
    });

    it('calls onLinkActivate with the link, and disables a link that cannot be activated', () => {
        const onLinkActivate = vi.fn();
        const active = { label: 'Öffnen', onActivate: () => {} };
        renderSectionBlocks(
            host,
            [
                {
                    type: 'links',
                    links: [
                        active,
                        { label: 'Aus', disabled: true, onActivate: () => {} },
                        { label: '' },
                    ],
                },
            ],
            onLinkActivate,
        );

        const buttons = host.querySelectorAll('button');
        expect(buttons).toHaveLength(2);
        expect(buttons[1].disabled).toBe(true);

        buttons[0].click();
        expect(onLinkActivate).toHaveBeenCalledWith(active);
    });
});

describe('renderBlockText', () => {
    it('escapes markup and turns the value markers into spans', () => {
        const html = renderBlockText(`<b>x</b> ${VALUE_MARKER_OPEN}42 %${VALUE_MARKER_CLOSE}`);

        expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
        expect(html).toContain('<span class="info-box-placeholder-value">42 %</span>');
    });
});

describe('renderEmptyState', () => {
    it('replaces the content with the shared empty sentence', () => {
        host.innerHTML = '<p>alt</p>';
        renderEmptyState(host);

        expect(host.children).toHaveLength(1);
        expect(host.firstElementChild.className).toBe('info-box-empty-state text-muted');
        expect(host.textContent).not.toContain('Missing glossary entry');
        expect(host.textContent.trim().length).toBeGreaterThan(0);
    });
});

describe('section buttons', () => {
    const metas = [
        { key: 'general', icon: 'article', tooltipText: 'Allgemein' },
        { key: null, icon: 'article', tooltipText: 'x' },
        { key: 'praise', icon: 'lightbulb', tooltipText: 'Stärken' },
    ];

    it('renders one button per keyed section, marking the active one', () => {
        renderSectionButtons(host, metas, 'praise');

        const buttons = host.querySelectorAll('.info-box-section-btn');
        expect([...buttons].map((button) => button.dataset.sectionKey)).toEqual([
            'general',
            'praise',
        ]);
        expect([...buttons].map((button) => button.getAttribute('aria-pressed'))).toEqual([
            'false',
            'true',
        ]);
        expect(buttons[1].classList.contains('is-active')).toBe(true);
        expect(buttons[0].getAttribute('aria-label')).toBe('Allgemein');
        expect(buttons[0].querySelector('svg')).not.toBeNull();
    });

    it('moves the active mark without rebuilding', () => {
        renderSectionButtons(host, metas, 'praise');
        const before = host.querySelectorAll('.info-box-section-btn')[0];

        setActiveSectionButton(host, 'general');

        const after = host.querySelectorAll('.info-box-section-btn')[0];
        expect(after).toBe(before);
        expect(after.getAttribute('aria-pressed')).toBe('true');
        expect(host.querySelectorAll('.is-active')).toHaveLength(1);
    });
});
