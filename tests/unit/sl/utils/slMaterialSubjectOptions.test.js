import { describe, it, expect } from 'vitest';
import {
    deriveMaterialSubjectOptions,
    MATERIAL_SUBJECT_OPTIONS,
} from '@tba3/modules/sl/utils/slSubjectConfig.js';

/**
 * Which subjects the Materialien view offers a button for.
 *
 * The list was hardcoded as `Gesamt / Deutsch / Englisch / Mathe` in two places, so
 * every dataset offered all four regardless of what it carries. For a school that sat
 * only Englisch that meant Deutsch and Mathe buttons leading to pages with no
 * school-side data behind them — not an export gap to be filled: that school never
 * sat those subjects, so the pages can never exist.
 *
 * The intersection runs both ways, which is the point of the two edge cases below: a
 * subject is offered only when the *dataset* has it AND the *material content* has
 * pages for it.
 */
const row = (subjectName) => ({ subject: { name: subjectName } });
const values = (options) => options.map((option) => option.value);

describe('deriveMaterialSubjectOptions', () => {
    it('offers only the subjects the dataset actually carries', () => {
        // A school that sat Englisch and nothing else.
        expect(values(deriveMaterialSubjectOptions([row('Englisch'), row('Englisch')]))).toEqual([
            'Gesamt',
            'Englisch',
        ]);
    });

    it('keeps Gesamt first and the canonical order for a full dataset', () => {
        // Payload order must not leak into the button order — the row order here is
        // deliberately not the display order.
        expect(
            values(
                deriveMaterialSubjectOptions([row('Mathematik'), row('Englisch'), row('Deutsch')]),
            ),
        ).toEqual(['Gesamt', 'Deutsch', 'Englisch', 'Mathe']);
    });

    it('maps the payload spelling Mathematik onto the Mathe page key', () => {
        // The payload says "Mathematik"; materialContent.json is keyed "Mathe". A
        // button carrying the payload spelling would resolve to no page at all.
        expect(values(deriveMaterialSubjectOptions([row('Mathematik')]))).toEqual([
            'Gesamt',
            'Mathe',
        ]);
    });

    it('drops a subject the material content has no pages for', () => {
        // The demo fixture `sl` ships Französisch, and it now shows in every other view
        // since the exclusion list was removed. It still gets no material button,
        // because materialContent.json has nothing to show for it.
        expect(values(deriveMaterialSubjectOptions([row('Deutsch'), row('Französisch')]))).toEqual([
            'Gesamt',
            'Deutsch',
        ]);
    });

    it('does not count a Landesschnitt as a subject the school sat', () => {
        // A state average is appended to the export, not sat by the school, and every page
        // behind these buttons is school-side. An export can ship exactly this shape — a
        // Deutsch and a Mathematik Landesschnitt with no school row behind either — which
        // is the case item 13 is about.
        expect(
            values(
                deriveMaterialSubjectOptions([
                    row('Englisch'),
                    { type: 'state', ...row('Deutsch') },
                    { type: 'state', ...row('Mathematik') },
                ]),
            ),
        ).toEqual(['Gesamt', 'Englisch']);
    });

    it('falls back to Gesamt alone rather than inventing buttons', () => {
        expect(values(deriveMaterialSubjectOptions([]))).toEqual(['Gesamt']);
        expect(values(deriveMaterialSubjectOptions(undefined))).toEqual(['Gesamt']);
    });

    it('carries the glossary keys the header controls annotate with', () => {
        // The buttons are glossary-annotated; dropping the key silently removes the
        // annotation rather than failing.
        expect(deriveMaterialSubjectOptions([row('Deutsch')])).toEqual([
            { value: 'Gesamt', label: 'Gesamt', glossarySubKey: 'general' },
            { value: 'Deutsch', label: 'Deutsch', glossarySubKey: 'de' },
        ]);
        expect(values(MATERIAL_SUBJECT_OPTIONS)).toEqual([
            'Gesamt',
            'Deutsch',
            'Englisch',
            'Mathe',
        ]);
    });
});
