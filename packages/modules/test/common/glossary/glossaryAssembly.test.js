import { describe, it, expect } from 'vitest';
import { assembleGlossary } from '../../../src/common/glossary/glossaryAssembly.js';

describe('assembleGlossary', () => {
    it('composes fragments mounted at different depths of the same view', () => {
        // A view owns its header entry; a chart rendered inside that view owns its
        // own entry and sits in a different folder. Neither fragment knows the other,
        // so mounting them at overlapping prefixes has to merge rather than replace.
        const assembled = assembleGlossary(
            { en: { shared: { element_texts: { ger: { title: 'GER-Stufe' } } } } },
            {
                'en.overview': { header: { title: 'Übersicht' } },
                'en.overview.scatterplot': { title: 'Streudiagramm' },
            },
        );

        expect(assembled.en.overview['header'].title).toBe('Übersicht');
        expect(assembled.en.overview.scatterplot.title).toBe('Streudiagramm');
        expect(assembled.en.shared.element_texts.ger.title).toBe('GER-Stufe');
    });

    it('throws when an entry is still in the shared file and already in a fragment', () => {
        // A half-finished move: the text is in the module's fragment and still in the
        // shared glossary.json. Picking a winner would ship whichever copy the merge
        // happened to prefer, so the build stops.
        expect(() =>
            assembleGlossary(
                { ma: { group: { 'competence-level-distribution': { title: 'Alt' } } } },
                { 'ma.group.competence-level-distribution': { title: 'Neu' } },
            ),
        ).toThrow(/collision at 'ma\.group\.competence-level-distribution\.title'/);
    });

    it('throws when two fragments claim the same entry', () => {
        expect(() =>
            assembleGlossary(
                {},
                {
                    'sl.details': { results: { title: 'Aus der Ansicht' } },
                    'sl.details.results': { title: 'Aus dem Overlay' },
                },
            ),
        ).toThrow(/collision at 'sl\.details\.results\.title'/);
    });

    it('leaves the shared file untouched so the three barrels cannot leak into each other', () => {
        // enGlossary.js, maGlossary.js and slGlossary.js all import the same shared
        // glossary.json module instance. If assembly mutated it, whichever barrel loaded
        // first would push its fragments into the other two apps' trees.
        const shared = { en: { overview: {} }, ma: { overview: {} } };

        assembleGlossary(shared, { 'en.overview.scatterplot': { title: 'Streudiagramm' } });
        assembleGlossary(shared, { 'ma.overview.ring': { title: 'Aufgabenring' } });

        expect(shared).toEqual({ en: { overview: {} }, ma: { overview: {} } });
    });

    it('rejects a mount path that runs through an existing leaf', () => {
        expect(() =>
            assembleGlossary(
                { en: { overview: { title: 'Übersicht' } } },
                { 'en.overview.title.deeper': { title: 'x' } },
            ),
        ).toThrow(/runs through the leaf 'title'/);
    });

    it("fills the app's terms everywhere, alias texts included, and leaves runtime tokens", () => {
        // The scale term is fixed per app; `{{Domäne}}` is the card's to fill from its data.
        const assembled = assembleGlossary(
            {
                en: {
                    shared: {
                        element_texts: {
                            ger: {
                                title: '{{Stufe}}',
                                aliases: ['{{Stufe}}', { text: '{{ Skala }}', exact: true }],
                            },
                        },
                    },
                },
            },
            { 'en.overview.chart': { title: '{{Skala}}-Verteilung: {{Domäne}}' } },
            { terms: { Skala: 'GER', Stufe: 'GER-Stufe' } },
        );

        expect(assembled.en.shared.element_texts.ger).toEqual({
            title: 'GER-Stufe',
            aliases: ['GER-Stufe', { text: 'GER', exact: true }],
        });
        expect(assembled.en.overview.chart.title).toBe('GER-Verteilung: {{Domäne}}');
    });

    it('leaves every token alone without terms', () => {
        const assembled = assembleGlossary({ en: { title: '{{Stufe}}' } });

        expect(assembled.en.title).toBe('{{Stufe}}');
    });
});
