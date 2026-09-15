import { describe, it, expect } from 'vitest';
import { assembleGlossary } from '@tba3/modules/common/glossary/glossaryAssembly.js';

describe('assembleGlossary', () => {
    it('composes fragments mounted at different depths of the same view', () => {
        // A view owns its header entry; a chart rendered inside that view owns its
        // own entry and sits in a different folder. Neither fragment can be
        // expected to know the other exists, so mounting them at overlapping
        // prefixes has to merge rather than replace.
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
        // This is the half-finished move: the text was copied into the module's
        // fragment but not deleted from packages/modules/src/common/glossary/glossary.json. Picking a winner would
        // ship whichever copy the merge happened to prefer, so the build stops.
        expect(() =>
            assembleGlossary(
                { ma: { class: { 'competence-distribution': { title: 'Alt' } } } },
                { 'ma.class.competence-distribution': { title: 'Neu' } },
            ),
        ).toThrow(/collision at 'ma\.class\.competence-distribution\.title'/);
    });

    it('throws when two fragments claim the same entry', () => {
        expect(() =>
            assembleGlossary(
                {},
                {
                    'sl.overview': { results: { title: 'Aus der Ansicht' } },
                    'sl.overview.results': { title: 'Aus dem Overlay' },
                },
            ),
        ).toThrow(/collision at 'sl\.overview\.results\.title'/);
    });

    it('leaves the shared file untouched so the three barrels cannot leak into each other', () => {
        // enGlossary.js, maGlossary.js and slGlossary.js all import the same
        // packages/modules/src/common/glossary/glossary.json module instance. If assembly mutated it, whichever
        // barrel loaded first would push its fragments into the other two apps' trees.
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
});
