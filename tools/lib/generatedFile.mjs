import fs from 'node:fs';

/**
 * @param {string} outPath - An absolute path.
 * @returns {string} The committed text with LF line endings, or `''` when absent.
 */
function committedText(outPath) {
    return fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8').replace(/\r\n/g, '\n') : '';
}

/**
 * A whole API answer as the fixtures store it: four-space JSON with a trailing newline.
 * @param {unknown} document
 * @returns {string}
 */
export function serializeFixture(document) {
    return `${JSON.stringify(document, null, 4)}\n`;
}

/**
 * Write generated files, or with `--check` on the command line verify the committed
 * copies match. The comparison ignores line endings: the writer emits LF, and an editor
 * may have saved a doc as CRLF since — a difference the check does not exist to catch.
 * For the same reason only files whose content differs are rewritten.
 * @param {object} job - What to write and what to say.
 * @param {{ outPath: string, content: string }[]} job.files - Absolute paths and their
 *   rendered content, LF line endings.
 * @param {string} job.staleMessage - Printed to stderr, followed by the stale paths, when a
 *   committed copy differs.
 * @param {string} job.okMessage - Printed when every committed copy matches.
 * @param {string} job.wroteMessage - Printed after writing.
 */
export function generateOrCheck({ files, staleMessage, okMessage, wroteMessage }) {
    const stale = files.filter(({ outPath, content }) => committedText(outPath) !== content);
    if (process.argv.includes('--check')) {
        if (stale.length > 0) {
            console.error(staleMessage);
            for (const { outPath } of stale) console.error(`  ${outPath}`);
            process.exit(1);
        }
        console.log(okMessage);
        return;
    }
    for (const { outPath, content } of stale) fs.writeFileSync(outPath, content);
    console.log(wroteMessage);
}
