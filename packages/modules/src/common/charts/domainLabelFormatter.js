const DOMAIN_LETTER_PATTERN = /\p{L}/u;
const DEFAULT_DOMAIN_LABEL_LOCALE = 'de-DE';
const DEFAULT_DOMAIN_LABEL_LENGTH = 2;

/**
 * Trim a label, treating anything that is not a string as absent.
 * @param {*} value - The raw label.
 * @returns {string} The trimmed label, or an empty string.
 */
function normalizeChartLabel(value) {
    return typeof value === 'string' ? value.trim() : '';
}

/**
 * The abbreviation length to use, falling back to the shared default.
 * @param {*} length - A configured length, which may be absent or invalid.
 * @returns {number} A positive integer length.
 */
function getDomainLabelLength(length) {
    return Number.isInteger(length) && length > 0 ? length : DEFAULT_DOMAIN_LABEL_LENGTH;
}

/**
 * The letters of a label, with punctuation and spacing dropped.
 * An abbreviation is built from letters only, so `Hören/Lesen` does not contribute a slash.
 * @param {string} label - The label to scan.
 * @returns {Array<string>} Its letter characters, in order.
 */
function getLetterChars(label) {
    return Array.from(label).filter((char) => DOMAIN_LETTER_PATTERN.test(char));
}

/**
 * Short form of a domain name, for axis ticks and legends where the full name will not fit.
 * @param {string} domainLabel - The full domain name.
 * @param {object} [options] - A `length` override for how many letters to keep.
 * @returns {string} The abbreviation, or an empty string for an absent label.
 */
export function getChartDomainAbbreviation(domainLabel, options = {}) {
    const normalizedDomainLabel = normalizeChartLabel(domainLabel);
    if (!normalizedDomainLabel) {
        return '';
    }

    const length = getDomainLabelLength(options.length);
    const letters = getLetterChars(normalizedDomainLabel);
    const source =
        letters.length > 0
            ? letters.slice(0, length).join('')
            : normalizedDomainLabel.slice(0, length);

    return source.toLocaleUpperCase(options.locale || DEFAULT_DOMAIN_LABEL_LOCALE);
}

/**
 * A domain label at chart scale: the full name when it fits, otherwise its abbreviation.
 * @param {string} domainLabel - The full domain name.
 * @param {object} [options] - Length and abbreviation overrides.
 * @returns {string} The label to draw, or an empty string for an absent name.
 */
function formatChartDomainLabel(domainLabel, options = {}) {
    const normalizedDomainLabel = normalizeChartLabel(domainLabel);
    if (!normalizedDomainLabel) {
        return '';
    }

    if (options.abbreviate === false) {
        return normalizedDomainLabel;
    }

    return getChartDomainAbbreviation(normalizedDomainLabel, options);
}

/**
 * A combined subject and domain label, for SL charts that show several subjects at once.
 * Either half may be absent, so the separator is only drawn when both are present.
 * @param {string} subjectLabel - The subject name (Deutsch, Mathematik, …).
 * @param {string} domainLabel - The domain name within that subject.
 * @param {object} [options] - Length and abbreviation overrides.
 * @returns {string} The combined label, or whichever half exists.
 */
export function formatChartSubjectDomainLabel(subjectLabel, domainLabel, options = {}) {
    const normalizedSubjectLabel = normalizeChartLabel(subjectLabel);
    const normalizedDomainLabel = normalizeChartLabel(domainLabel);

    if (!normalizedDomainLabel || normalizedDomainLabel === normalizedSubjectLabel) {
        return normalizedSubjectLabel || normalizedDomainLabel;
    }

    const formattedDomainLabel = formatChartDomainLabel(normalizedDomainLabel, options);
    if (!normalizedSubjectLabel) {
        return formattedDomainLabel;
    }

    return `${normalizedSubjectLabel}: ${formattedDomainLabel}`;
}
