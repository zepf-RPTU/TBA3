/**
 * The notes export: a notebook's pages as one Markdown document, converted from the
 * stored Quill deltas. Covers exactly the formats the editor allows (bold, italic,
 * the three list kinds, module-link chips, which export as their text).
 */

import Delta from 'quill-delta';

/** @typedef {import('./notesStore.js').NotesPage} NotesPage */

/** Quill's list values → the Markdown item prefix. */
const LIST_PREFIX = Object.freeze({
    ordered: '1. ',
    bullet: '- ',
    checked: '- [x] ',
    unchecked: '- [ ] ',
});

/**
 * One editor line: its inline runs and the list it belongs to, if any.
 * @typedef {{runs: Array<{text: string, bold: boolean, italic: boolean}>, list: string|null}} DeltaLine
 */

/**
 * @param {string} text
 * @returns {string} The text with Markdown's inline syntax escaped.
 */
function escapeInline(text) {
    return text.replace(/[\\`*_[\]<]/g, '\\$&');
}

/**
 * Split a delta into lines (Quill keeps a line's list on the `\n` that ends it).
 * @param {import('quill').Op[]} ops
 * @returns {DeltaLine[]}
 */
function splitLines(ops) {
    /** @type {DeltaLine[]} */
    const lines = [];
    new Delta(ops).eachLine((line, attributes) => {
        const runs = line.ops.flatMap((op) =>
            typeof op.insert === 'string'
                ? [
                      {
                          text: op.insert,
                          bold: Boolean(op.attributes?.bold),
                          italic: Boolean(op.attributes?.italic),
                      },
                  ]
                : [],
        );
        const list = attributes.list;
        lines.push({ runs, list: typeof list === 'string' ? list : null });
    });
    return lines;
}

/**
 * One inline run, with its emphasis markers around the text but outside its edge
 * whitespace (`** fett**` is not bold in Markdown).
 * @param {DeltaLine['runs'][number]} run
 * @returns {string}
 */
function renderRun({ text, bold, italic }) {
    const marker = (bold ? '**' : '') + (italic ? '_' : '');
    const [, lead, core, trail] = /** @type {RegExpMatchArray} */ (
        text.match(/^(\s*)([\s\S]*?)(\s*)$/)
    );
    if (!marker || !core) return escapeInline(text);
    return `${lead}${marker}${escapeInline(core)}${[...marker].reverse().join('')}${trail}`;
}

/**
 * @param {DeltaLine} line
 * @returns {string} Its Markdown, block markers at the start escaped on a plain line.
 */
function renderLine({ runs, list }) {
    const text = runs.map(renderRun).join('');
    if (list && list in LIST_PREFIX) {
        return LIST_PREFIX[/** @type {keyof typeof LIST_PREFIX} */ (list)] + text;
    }
    return text.replace(/^(\s*)([#>+-])/, '$1\\$2').replace(/^(\s*\d+)([.)])/, '$1\\$2');
}

/**
 * @param {import('quill').Op[]} ops
 * @returns {string} The page body: a blank line between paragraphs, list items adjacent.
 */
function deltaToMarkdown(ops) {
    const lines = splitLines(ops).filter((line) => line.list || line.runs.length);
    return lines
        .map((line, index) => {
            const previous = lines[index - 1];
            const separator = !previous ? '' : previous.list && line.list ? '\n' : '\n\n';
            return separator + renderLine(line);
        })
        .join('');
}

/**
 * A notebook as Markdown: one `#` section per page, named like its tab.
 * @param {readonly NotesPage[]} pages - The pages, in tab order.
 * @returns {string}
 */
export function notesToMarkdown(pages) {
    return pages
        .map((page, index) => {
            const heading = `# ${escapeInline(page.name || String(index + 1))}`;
            const body = deltaToMarkdown(page.delta.ops);
            return body ? `${heading}\n\n${body}\n` : `${heading}\n`;
        })
        .join('\n');
}
