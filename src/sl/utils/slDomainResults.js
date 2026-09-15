/**
 * Groups a flat domain-results array by subject+domain into a 2D structure.
 * Each inner array contains all class-level entries for one subject+domain combo.
 * @param {Array} domainResults - Flat array from DataStore (DOMAIN_RESULTS)
 * @returns {Array<Array<object>>} Grouped 2D array
 */
export function groupDomainResultsBySubjectDomain(domainResults) {
    if (!domainResults?.length) return [];
    const groups = new Map();
    for (const item of domainResults) {
        const key = `${item.fach}|${item.domaene ?? ''}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
    }
    return [...groups.values()];
}

/**
 * Builds domain options from a flat domain-results array
 * Works directly with the flat DOMAIN_RESULTS from DataStore — no 2D adapter needed.
 * @param {Array} domainResults - Flat array of domain result objects
 * @returns {Array<{index: number, subject: string, domain: string, label: string}>} Domain options
 */
export function buildDomainOptions(domainResults) {
    const grouped = groupDomainResultsBySubjectDomain(domainResults);

    // Pre-compute subject→domain-count for hasSingleDomain check
    const subjectDomainCounts = new Map();
    for (const group of grouped) {
        if (group.length === 0) continue;
        const subject = group[0].fach;
        subjectDomainCounts.set(subject, (subjectDomainCounts.get(subject) || 0) + 1);
    }

    return grouped
        .map((domainGroup, index) => {
            if (domainGroup.length === 0) return null;

            const firstResult = domainGroup[0];
            const subject = firstResult.fach;
            const domain = firstResult.domaene;

            const subjectLabel = firstResult.fachbezeichnung || subject;
            const hasSingleDomain = subjectDomainCounts.get(subject) === 1;
            const label = hasSingleDomain
                ? subjectLabel
                : `${subjectLabel}: ${firstResult.domaenenbezeichnung || domain}`;

            return { index, subject, domain, label };
        })
        .filter((option) => option !== null);
}
