/**
 * The "H-01" rule: an item number carries its domain's one-letter abbreviation
 * while the combined 'all' domain mode is showing, and is unprefixed once a
 * single domain is selected.
 *
 * The single home of that rule. The Nr. column formatter/sorter, the item
 * preview title, the item/student-data exports and the item lollipop's labels
 * all read it here, so the table and the chart cannot disagree about a number.
 */

/**
 * Domain abbreviation = first letter uppercased (e.g. "Hörverstehen" → "H").
 * @param {string} domainName - The domain's display name.
 * @returns {string} Its one-letter abbreviation, empty when no name was given.
 */
function getDomainAbbreviation(domainName) {
    return domainName ? domainName.charAt(0).toUpperCase() : '';
}

/**
 * Prefix a name with its domain abbreviation when a domain label is present.
 * @param {string} name - The item number as the payload delivers it.
 * @param {string} [domainLabel] - The row's domain; without it the name is returned unchanged.
 * @returns {string} The display number, e.g. `H-01`.
 */
export function withDomainPrefix(name, domainLabel) {
    return domainLabel ? `${getDomainAbbreviation(domainLabel)}-${name}` : name;
}
