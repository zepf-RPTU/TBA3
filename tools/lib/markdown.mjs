/**
 * The markdown the tools read: H1 lines, `##` headings and one heading's section. Regex
 * on purpose — tools/check-structure.mjs must run without node_modules.
 */

/**
 * @param {string} text - A markdown document.
 * @returns {string[]} Every `# ` heading's text, in order.
 */
export function h1LinesOf(text) {
    return [...text.matchAll(/^# (.*)$/gm)].map((match) => match[1]);
}

/**
 * @param {string} text - A markdown document.
 * @returns {Set<string>} The `## ` heading titles, trailing whitespace trimmed.
 */
export function headingsOf(text) {
    return new Set([...text.matchAll(/^## (.+?)\s*$/gm)].map((match) => match[1]));
}

/**
 * @param {string} text - A markdown document.
 * @param {string} heading - A `## ` heading title, taken literally.
 * @returns {string} The body under that heading up to the next `## `, or `''` when absent.
 */
export function sectionOf(text, heading) {
    const match = text.match(
        new RegExp(String.raw`^## ${heading}\s*$([\s\S]*?)(?=^## |(?![\s\S]))`, 'm'),
    );
    return match ? match[1] : '';
}

/**
 * @param {string} text - A markdown document with LF line endings.
 * @param {string} heading - A `## ` heading title, taken literally.
 * @param {string} body - Replaces everything between the heading line and the next `## `.
 * @returns {string} The document with that body; unchanged when the heading is absent.
 */
export function replaceSection(text, heading, body) {
    return text.replace(
        new RegExp(String.raw`^(## ${heading}[ \t]*\n)[\s\S]*?(?=^## |(?![\s\S]))`, 'm'),
        (_, headingLine) => headingLine + body,
    );
}
