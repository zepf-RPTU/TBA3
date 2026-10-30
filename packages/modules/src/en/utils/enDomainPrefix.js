/**
 * The "H-01" rule: a mode-bound item number carries its domain's one-letter
 * abbreviation while the combined 'all' domain mode is showing, and is unprefixed once
 * a single domain is selected (`itemNumberLabel`); a label outside any mode always
 * carries it (`withDomainPrefix`). Every label reads it here, so none can disagree
 * about a number.
 */

import { getChartDomainAbbreviation } from '../../common/charts/domainLabelFormatter.js';

/**
 * Prefix a name with its domain abbreviation.
 * @param {string} name - The item number as the payload delivers it.
 * @param {string} domainLabel
 * @returns {string} The display number, e.g. `H-01`.
 */
export function withDomainPrefix(name, domainLabel) {
    return `${getChartDomainAbbreviation(domainLabel, 1)}-${name}`;
}

/**
 * The item number a mode shows: domain-prefixed in `all`, as delivered in one domain.
 * @param {string} name
 * @param {string} domainLabel
 * @param {string} mode - `'all'` or a domain id.
 * @returns {string}
 */
export function itemNumberLabel(name, domainLabel, mode) {
    return mode === 'all' ? withDomainPrefix(name, domainLabel) : name;
}
