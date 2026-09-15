const HTML_ESCAPE_RE = /[&<>"']/g;
const HTML_ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * Escape HTML special characters to prevent XSS in template literals.
 * @param {*} str - Value to escape (coerced to string)
 * @returns {string} Safe HTML string
 */
export function escapeHtml(str) {
    return String(str).replace(HTML_ESCAPE_RE, (c) => HTML_ESCAPE_MAP[c]);
}
