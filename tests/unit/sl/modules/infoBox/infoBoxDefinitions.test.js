import { describe, it, expect } from 'vitest';
import {
    isLinkBlockDefinition,
    isTextBlockDefinition,
    resolveActiveSection,
    resolveSectionMeta,
} from '@tba3/modules/sl/modules/infoBox/infoBoxDefinitions.js';

/**
 * How `info_boxes.json` is read: which shape a block has and how a section is named. A
 * wrong reading here drops a block silently or labels a section with the wrong text.
 */

describe('block kinds', () => {
    it('tells text and link blocks apart by shape', () => {
        expect(isTextBlockDefinition({ text: 'Hallo' })).toBe(true);
        expect(isTextBlockDefinition({ text: 'Hallo', sublist: [] })).toBe(true);
        expect(isTextBlockDefinition('Hallo')).toBe(false);
        expect(isTextBlockDefinition({ text: 5 })).toBe(false);
        expect(isTextBlockDefinition([{ text: 'x' }])).toBe(false);

        expect(isLinkBlockDefinition({ type: 'link', token: 'token' })).toBe(true);
        expect(isLinkBlockDefinition({ type: 'link' })).toBe(false);
        expect(isLinkBlockDefinition({ link: 'token' })).toBe(false);
        expect(isLinkBlockDefinition('Link: token')).toBe(false);
        expect(isLinkBlockDefinition(null)).toBe(false);
    });
});

describe('resolveActiveSection', () => {
    const sections = [{ type: 'general' }, { type: 'praise' }];

    it('keeps the active section while it still exists, else falls back to the first', () => {
        expect(resolveActiveSection(sections, 'praise')).toBe(sections[1]);
        expect(resolveActiveSection(sections, 'alarm')).toBe(sections[0]);
        expect(resolveActiveSection(sections, null)).toBe(sections[0]);
        expect(resolveActiveSection([], 'praise')).toBeNull();
    });
});

describe('resolveSectionMeta', () => {
    const sectionTypes = {
        praise: { label: 'Stärken', icon: 'thumb_up', tooltip: 'Was gut läuft' },
        alarm: {
            label: 'Alarm',
            icon: 'warning',
            tooltip: 'Was auffällt',
            materialLinkSubjectMode: 'worst',
        },
    };

    it('reads label, icon and tooltip from the type definition', () => {
        expect(resolveSectionMeta({ type: 'praise' }, sectionTypes)).toEqual({
            key: 'praise',
            label: 'Stärken',
            icon: 'thumb_up',
            tooltipText: 'Was gut läuft',
            materialLinkSubjectMode: null,
        });
    });

    it('lets the section override the type-wide link mode', () => {
        expect(
            resolveSectionMeta({ type: 'alarm', materialLinkSubjectMode: 'extrema' }, sectionTypes)
                .materialLinkSubjectMode,
        ).toBe('extrema');
        expect(resolveSectionMeta({ type: 'alarm' }, sectionTypes).materialLinkSubjectMode).toBe(
            'worst',
        );
    });
});
