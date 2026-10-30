import { describe, expect, it } from 'vitest';
import { notesToMarkdown } from '../../../../../src/common/modules/notes/notesMarkdown.js';

// The export is the reader's only copy of their notes outside this browser; a format
// the editor allows that comes out wrong (a list flattened, emphasis swallowing a
// space) changes what they wrote.

/**
 * @param {string|null} name
 * @param {import('quill').Op[]} ops
 * @returns {import('../../../../../src/common/modules/notes/notesStore.js').NotesPage}
 */
const page = (name, ops) => ({ id: 'p', name, delta: { ops } });

describe('notesToMarkdown', () => {
    it('heads each page with its tab name, or its number when unnamed', () => {
        const markdown = notesToMarkdown([
            page('Elternabend', [{ insert: 'Termin\n' }]),
            page(null, []),
        ]);

        expect(markdown).toBe('# Elternabend\n\nTermin\n\n# 2\n');
    });

    it('converts emphasis, the three list kinds and module-link chips', () => {
        const markdown = notesToMarkdown([
            page('A', [
                { insert: 'Sehr ' },
                { insert: 'wichtig ', attributes: { bold: true } },
                { insert: 'und ' },
                { insert: 'kursiv', attributes: { italic: true } },
                { insert: '\nEins' },
                { insert: '\n', attributes: { list: 'ordered' } },
                { insert: 'Punkt' },
                { insert: '\n', attributes: { list: 'bullet' } },
                { insert: 'Erledigt' },
                { insert: '\n', attributes: { list: 'checked' } },
                { insert: 'Offen' },
                { insert: '\n', attributes: { list: 'unchecked' } },
                { insert: 'Siehe ' },
                { insert: 'Klassenspiegel', attributes: { moduleLink: 'overview::table' } },
                { insert: '\n' },
            ]),
        ]);

        expect(markdown).toBe(
            '# A\n\n' +
                'Sehr **wichtig** und _kursiv_\n\n' +
                '1. Eins\n- Punkt\n- [x] Erledigt\n- [ ] Offen\n\n' +
                'Siehe Klassenspiegel\n',
        );
    });

    it('escapes Markdown syntax the reader typed as text', () => {
        const markdown = notesToMarkdown([page('A', [{ insert: '# 3. *nicht* fett\n1. Satz\n' }])]);

        expect(markdown).toBe('# A\n\n\\# 3. \\*nicht\\* fett\n\n1\\. Satz\n');
    });
});
