import { getListFormat } from '../utils/numberFormat.js';

/**
 * Short form of a domain name, for axis ticks and legends where the full name will not
 * fit: its first letters, upper-cased. Letters only, so `Hören/Lesen` contributes no
 * slash; a label without letters keeps its first characters.
 * @param {string|null|undefined} domainLabel - The full domain name.
 * @param {number} [length] - How many letters to keep.
 * @returns {string} Empty for an absent label.
 */
export function getChartDomainAbbreviation(domainLabel, length = 2) {
    const label = typeof domainLabel === 'string' ? domainLabel.trim() : '';
    const letters = Array.from(label).filter((char) => /\p{L}/u.test(char));
    const source = letters.length > 0 ? letters.slice(0, length).join('') : label.slice(0, length);
    return source.toLocaleUpperCase('de-DE');
}

/**
 * A combined subject and domain label, naming a domain apart from those of other subjects.
 * Either half may be absent, so the separator is only drawn when both are present; a
 * domain named like its subject is not repeated.
 * @param {string} subjectLabel - The subject name (Deutsch, Mathematik, …).
 * @param {string|null|undefined} domainLabel - The domain name within that subject; absent for a Fach shown without one.
 * @param {{abbreviate?: boolean}} [options] - `abbreviate: false` keeps the domain's full name.
 * @returns {string} Whichever half exists when the other is absent.
 */
export function formatChartSubjectDomainLabel(
    subjectLabel,
    domainLabel,
    { abbreviate = true } = {},
) {
    const subject = typeof subjectLabel === 'string' ? subjectLabel.trim() : '';
    const domain = typeof domainLabel === 'string' ? domainLabel.trim() : '';

    if (!domain || domain === subject) return subject || domain;

    const shownDomain = abbreviate ? getChartDomainAbbreviation(domain) : domain;
    return subject ? `${subject}: ${shownDomain}` : shownDomain;
}

/**
 * `formatChartSubjectDomainLabel(…, {abbreviate: false})` as text runs, the Domäne's run
 * linked to the entry that explains that Domäne of that Fach: the name itself is never
 * matched as a term, since one name (`Lesen`) is a Domäne of several Fächer.
 * @param {import('../glossary/glossaryAnnotator.js').GlossaryAnnotator} glossary
 * @param {string} subjectName - The payload's `subject.name`.
 * @param {string|null} domainId - The payload's `domain.id`; null for a Fach shown without one.
 * @param {string|null|undefined} domainName - The payload's `domain.name`; absent for a Fach shown without one.
 * @returns {Array<{text: string, glossaryKey: string|null}>} The Fach as a plain run, then the Domäne's run.
 */
export function subjectDomainLabelRuns(glossary, subjectName, domainId, domainName) {
    const label = formatChartSubjectDomainLabel(subjectName, domainName, { abbreviate: false });
    const domain = typeof domainName === 'string' ? domainName.trim() : '';
    if (!domain) return [{ text: label, glossaryKey: null }];
    const prefix = label.slice(0, label.length - domain.length);
    return [
        ...(prefix ? [{ text: prefix, glossaryKey: null }] : []),
        { text: domain, glossaryKey: glossary.resolveDomainEntryKey(domainId, subjectName) },
    ];
}

/**
 * A Fach's named Domänen as one German list (`A und B`, `A, B und C`), each name linked
 * to the entry for that Domäne of that Fach, like `subjectDomainLabelRuns`.
 * @param {import('../glossary/glossaryAnnotator.js').GlossaryAnnotator} glossary
 * @param {string|null} subjectName - The payload's `subject.name`; null on a dashboard of one Fach.
 * @param {ReadonlyArray<{domainId: string|null, domainName: string|null}>} domains - In payload order; the rows that name no Domäne are left out.
 * @returns {Array<{text: string, glossaryKey: string|null}>} Empty for a Fach without a named Domäne.
 */
export function domainListRuns(glossary, subjectName, domains) {
    const named = domains.flatMap(({ domainId, domainName }) =>
        domainName ? [{ domainId, domainName }] : [],
    );
    let element = 0;
    return getListFormat()
        .formatToParts(named.map(({ domainName }) => domainName))
        .map((part) => {
            if (part.type !== 'element') return { text: part.value, glossaryKey: null };
            const { domainId } = named[element++];
            return {
                text: part.value,
                glossaryKey: glossary.resolveDomainEntryKey(domainId, subjectName),
            };
        });
}
