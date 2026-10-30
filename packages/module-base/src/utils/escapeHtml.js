const HTML_ESCAPE_RE = /[&<>"']/g;
/** @type {{[char: string]: string}} */
const HTML_ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * Escape HTML special characters to prevent XSS in template literals.
 * @param {unknown} str - Coerced to string.
 * @returns {string}
 */
export function escapeHtml(str) {
    return String(str).replace(HTML_ESCAPE_RE, (c) => HTML_ESCAPE_MAP[c]);
}
