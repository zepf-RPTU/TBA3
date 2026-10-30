/**
 * Owns the glossary data: entry lookup and term annotation of HTML, plain text and SVG.
 *
 * Annotation only produces `data-glossary-key` spans; the popups are
 * `tooltipService.init()`'s. The term matcher is built from the alias metadata on the
 * `namespace.shared.element_texts` entries, the Domäne lookup from their `domains`. One
 * instance per app, handed down in the app's context (`createModuleContext`).
 */

import {
    GLOSSARY_TERM_TAB_STOP,
    aliasText,
    glossaryTermAttrs,
    missingGlossaryText,
    resolveDotPath,
} from '@tba3/module-base/glossary';

/** Cap for the annotation cache, to bound memory. */
const ANNOTATION_CACHE_LIMIT = 500;

const EXACT_TERM_BOUNDARY_CHAR_CLASS = '[\\p{L}\\p{M}\\p{N}_]';
const LETTER_ONLY_EXACT_TERM_REGEX = /^[\p{L}\p{M}]+$/u;

/** @typedef {import('@tba3/module-base/glossary').GlossaryEntry} GlossaryEntry */

/**
 * A term entry of the namespace. `domains` names the payload Domänen it explains, each
 * by its `domain.id` and, where the dashboard spans several Fächer, the `subject.name`.
 * @typedef {GlossaryEntry & {domains?: Array<{id: string, subject?: string}>}} TermEntry
 */

/**
 * The lookup key of one Domäne of one Fach.
 * @param {string} domainId
 * @param {string|null|undefined} subjectName - Absent for a Domäne claimed without a Fach.
 * @returns {string}
 */
function domainClaimKey(domainId, subjectName) {
    return JSON.stringify([subjectName ?? null, domainId]);
}

/**
 * What a matched alias resolves to.
 * @typedef {object} GlossaryTermDefinition
 * @property {string} key - The canonical entry key.
 * @property {boolean} exact - Whether the alias matches only on word boundaries.
 */

export class GlossaryAnnotator {
    /** @type {{[key: string]: TermEntry} | null} The namespace's `shared.element_texts` */
    #entries = null;

    /** @type {import('@tba3/module-base/glossary').GlossaryTree | null} Full glossary data for getEntryText() dot-path lookups */
    #data = null;

    /** @type {RegExp|null} Matches every alias, longest first */
    #regex = null;

    /**
     * Every character an alias can start with, as one class. A string containing none
     * of them cannot contain a term: every table cell holding a count, a percentage or
     * an icon, and the annotator runs on every cell on every redraw.
     * @type {RegExp|null}
     */
    #firstCharRegex = null;

    /**
     * Every alias, lower-cased, to what it resolves to. Lower-cased because the match
     * regex is case-insensitive, so every lookup is one.
     * @type {Map<string, GlossaryTermDefinition>}
     */
    #terms = new Map();

    /**
     * Every claimed Domäne (`domainClaimKey`) to the entry that explains it. Never part
     * of the term matcher: a Domäne's name is no term (`resolveDomainEntryKey`).
     * @type {Map<string, string>}
     */
    #domainEntries = new Map();

    /** @type {Map<string, string>} Cache for annotateHTML results (raw → annotated) */
    #cache = new Map();

    /**
     * @type {Map<string, {title?: string, body?: string}>}
     * Entries supplied by the data payload, not by `glossary.json`.
     * Not part of the term matcher (see `registerPayloadEntries`).
     */
    #payloadEntries = new Map();

    #initialized = false;

    get isInitialized() {
        return this.#initialized;
    }

    /**
     * Build the annotator over a glossary tree. A tree without `shared.element_texts`
     * under `namespace` leaves the annotator uninitialised (`isInitialized` false):
     * `annotateHTML` returns its input and no term is matched.
     * @param {import('@tba3/module-base/glossary').GlossaryTree|null} glossaryData - The assembled tree; `null` leaves the annotator uninitialised too.
     * @param {string} namespace - Top-level key whose `shared.element_texts` is the term index (tba3: 'en', 'ma', 'sl')
     */
    constructor(glossaryData, namespace) {
        if (!glossaryData) {
            console.warn('GlossaryAnnotator: no glossary data provided');
            return;
        }

        this.#data = glossaryData;
        const shared = glossaryData[namespace]?.shared;
        if (!shared?.element_texts) {
            console.warn(
                `GlossaryAnnotator: no shared.element_texts under namespace '${namespace}'`,
            );
            return;
        }
        this.#entries = shared.element_texts;
        this.#buildTermLookup();
        this.#buildDomainLookup();
        this.#buildRegex();
        this.#initialized = true;
    }

    /**
     * Register entries the data payload supplies, keyed for explicit lookup only.
     *
     * Competence-level descriptions arrive this way: the scales vary by state, so the
     * text cannot live in `glossary.json` (see
     * `CompetenceLevelPalette#getLevelDescriptions`).
     *
     * These never enter `#terms` or `#regex`: level names are short, ambiguous tokens,
     * and `I`, `V` or `A1` as aliases would wrap roman numerals and stray letters in
     * ordinary prose. Payload entries resolve only where a renderer stamped
     * `data-glossary-key`.
     *
     * Merged over a static entry of the same key, so an entry keeps its `glossary.json`
     * aliases and title while taking its body from the data.
     * @param {Map<string, {title?: string, body?: string}>} entries - Canonical key to entry.
     */
    registerPayloadEntries(entries) {
        for (const [key, entry] of entries) {
            if (typeof key === 'string' && key && entry) this.#payloadEntries.set(key, entry);
        }
    }

    /**
     * Get a glossary entry by its canonical key (`resolveEntryKey` turns a term into one).
     * @param {string} key
     * @returns {GlossaryEntry | null} The entry, with payload text merged over the static one, or null when no entry has that key.
     */
    getEntry(key) {
        const staticEntry = this.#entries?.[key] ?? null;
        const payloadEntry = this.#payloadEntries.get(key) ?? null;
        if (!payloadEntry) return staticEntry;

        // Payload wins field by field.
        return staticEntry ? { ...staticEntry, ...payloadEntry } : payloadEntry;
    }

    /**
     * @param {string} keyOrTerm - A canonical key, a display term, or an alias in any casing.
     * @returns {string|null} Null when nothing matches.
     */
    resolveEntryKey(keyOrTerm) {
        if (!keyOrTerm || typeof keyOrTerm !== 'string') return null;
        if (this.#entries?.[keyOrTerm] || this.#payloadEntries.has(keyOrTerm)) return keyOrTerm;
        return this.#terms.get(keyOrTerm.toLowerCase())?.key ?? null;
    }

    /**
     * The entry that explains a payload Domäne, found by what the data says the Domäne
     * is, never by its display name: `Lesen` is a Domäne of Deutsch, Englisch and
     * Französisch alike, so a name is never matched as free text. A claim with a Fach
     * answers only for that Fach, one without only without a Fach.
     * @param {string|null|undefined} domainId - The payload's `domain.id`.
     * @param {string|null} [subjectName] - The payload's `subject.name`; null on a dashboard of one Fach.
     * @returns {string|null} The canonical entry key; null when no entry claims that Domäne.
     */
    resolveDomainEntryKey(domainId, subjectName = null) {
        if (!domainId) return null;
        return this.#domainEntries.get(domainClaimKey(domainId, subjectName)) ?? null;
    }

    /**
     * The term entries of the namespace: what a glossary search lists.
     * @returns {Array<[string, GlossaryEntry]>} Canonical key and entry, in authoring order; empty while uninitialised.
     */
    getEntries() {
        return Object.entries(this.#entries ?? {});
    }

    /**
     * Resolve a dot path into the whole tree, not only the namespace's terms; resolves
     * even while uninitialised, as long as there is a tree.
     * @param {string} dotPath - Path into the assembled glossary tree, e.g. `en.overview.subtitle`.
     * @returns {string|null} The leaf value; null where the tree has no text there.
     */
    getEntryText(dotPath) {
        const resolved = resolveDotPath(this.#data, dotPath);
        return typeof resolved === 'string' && resolved.length > 0 ? resolved : null;
    }

    /**
     * `getEntryText` for copy that must exist.
     * @param {string} dotPath - Path into the assembled glossary tree, e.g. `en.overview.subtitle`.
     * @returns {string} The leaf value, or a visible placeholder marking the gap.
     */
    getRequiredEntryText(dotPath) {
        return this.getEntryText(dotPath) ?? missingGlossaryText(dotPath);
    }

    /**
     * Annotate an HTML string: wrap glossary terms in interactive spans, skipping
     * content inside tags and already-annotated glossary spans.
     * @param {string} html - Markup to annotate; returned unchanged when the annotator is not initialised.
     * @param {Set<string>} [excludeKeys] - Keys to skip (prevents circular refs in nested popups)
     * @param {{focusable?: boolean}} [options] - `focusable: false` for markup inside a control that takes focus itself.
     * @returns {string}
     */
    annotateHTML(html, excludeKeys, { focusable = true } = {}) {
        if (!html || !this.#regex || !this.#initialized) return html;
        const regex = this.#regex;
        // The two markups of one string differ, so they cache apart.
        const cacheKey = focusable ? html : `\u0000${html}`;

        // Only calls without excludeKeys are cached (the Tabulator path).
        if (!excludeKeys) {
            const cached = this.#cache.get(cacheKey);
            if (cached !== undefined) return cached;
        }

        if (this.#firstCharRegex && !this.#firstCharRegex.test(html)) return html;

        const TAG_REGEX = /(<[^>]+>)/g;
        const segments = html.split(TAG_REGEX);

        let spanDepth = 0;
        /** @type {number[]} */
        const glossarySpanDepths = [];

        const annotated = segments.map((segment) => {
            if (segment.startsWith('<')) {
                if (segment.startsWith('</span')) {
                    if (
                        glossarySpanDepths.length > 0 &&
                        spanDepth === glossarySpanDepths[glossarySpanDepths.length - 1]
                    ) {
                        glossarySpanDepths.pop();
                    }
                    spanDepth = Math.max(0, spanDepth - 1);
                } else if (
                    segment.startsWith('<span') &&
                    (segment.charAt(5) === '>' ||
                        segment.charAt(5) === ' ' ||
                        segment.charAt(5) === '/')
                ) {
                    spanDepth++;
                    if (segment.includes('data-glossary-key')) {
                        glossarySpanDepths.push(spanDepth);
                    }
                }
                return segment;
            }

            if (glossarySpanDepths.length > 0) return segment;

            return segment.replace(regex, (match) => {
                const entry = this.#terms.get(match.toLowerCase());
                if (!entry || excludeKeys?.has(entry.key)) return match;
                return `<span ${glossaryTermAttrs(entry.key, '', { focusable })}>${match}</span>`;
            });
        });

        const result = annotated.join('');

        if (!excludeKeys) {
            // Drop the oldest entry, not the whole cache: a table one row past the
            // limit would otherwise re-annotate every cell.
            if (this.#cache.size >= ANNOTATION_CACHE_LIMIT) {
                this.#cache.delete(/** @type {string} */ (this.#cache.keys().next().value));
            }
            this.#cache.set(cacheKey, result);
        }

        return result;
    }

    /**
     * Split plain text into glossary-aware text runs: the text between matches as plain
     * runs, each matched alias as a run carrying the canonical key it resolves to.
     * @param {string} text
     * @returns {Array<{ text: string, glossaryKey: string|null }>} In source order; empty for an empty string.
     */
    getTextSegments(text) {
        if (typeof text !== 'string' || text.length === 0) return [];
        if (!this.#regex || !this.#initialized) return [{ text, glossaryKey: null }];

        const segments = [];
        let lastIndex = 0;
        for (const match of text.matchAll(this.#regex)) {
            if (match.index > lastIndex) {
                segments.push({ text: text.slice(lastIndex, match.index), glossaryKey: null });
            }
            segments.push({
                text: match[0],
                glossaryKey: this.#terms.get(match[0].toLowerCase())?.key ?? null,
            });
            lastIndex = match.index + match[0].length;
        }
        if (lastIndex < text.length) {
            segments.push({ text: text.slice(lastIndex), glossaryKey: null });
        }
        return segments;
    }

    /**
     * Stamp glossary attributes on an SVG/HTML selection so it triggers popups; the
     * cursor and SVG hit-testing come from `glossary-popup.css`.
     * @template {d3.BaseType} E
     * @template D
     * @param {d3.Selection<E, D, any, any>} selection
     * @param {string|null|undefined} glossaryKey - Null takes a stamp off (and leaves an
     *        unstamped node as it is), so a caller may pass a lookup that found nothing,
     *        and a node a redraw reuses for another label keeps no link to its last term.
     */
    stampGlossaryAttr(selection, glossaryKey) {
        selection
            .attr('data-glossary-key', glossaryKey || null)
            .classed('glossary-term', Boolean(glossaryKey));
        for (const [name, value] of Object.entries(GLOSSARY_TERM_TAB_STOP)) {
            selection.attr(name, glossaryKey ? value : null);
        }
    }

    /**
     * Replace an SVG text/tspan node's content with glossary-aware tspans.
     * @template {d3.BaseType} E
     * @template D
     * @param {d3.Selection<E, D, any, any>} selection
     * @param {string} text
     * @param {object} [options]
     * @param {Array<{ text: string, glossaryKey: string|null }>} [options.segments] - Reuse these runs instead of re-splitting `text`.
     * @param {boolean} [options.force=false] - Rebuild as tspans even when no run carries a glossary key.
     * @returns {boolean} True when tspans were built; false when the node was set as plain text.
     */
    renderTextSegments(selection, text, options = {}) {
        const { segments = null, force = false } = options;
        const textValue = typeof text === 'string' ? text : String(text ?? '');
        const resolvedSegments = segments ?? this.getTextSegments(textValue);
        const hasGlossarySegments = resolvedSegments.some((segment) => segment.glossaryKey);

        if (!force && !hasGlossarySegments) {
            selection.text(textValue);
            return false;
        }

        selection.text(null);
        resolvedSegments.forEach((segment) => {
            const tspan = selection.append('tspan').text(segment.text);
            if (segment.glossaryKey) this.stampGlossaryAttr(tspan, segment.glossaryKey);
        });

        return hasGlossarySegments;
    }

    /**
     * Build the namespace's term lookup from the entries' alias metadata. An alias is
     * bare text or `{text, exact}`; one that names two entries (in any casing) warns and
     * keeps the first.
     */
    #buildTermLookup() {
        for (const [key, entry] of Object.entries(this.#entries ?? {})) {
            for (const alias of Array.isArray(entry?.aliases) ? entry.aliases : []) {
                const text = aliasText(alias).trim();
                if (!text) continue;
                const term = { key, exact: typeof alias === 'object' && Boolean(alias.exact) };
                const lower = text.toLowerCase();
                const existing = this.#terms.get(lower);
                if (!existing) {
                    this.#terms.set(lower, term);
                } else if (existing.key !== term.key || existing.exact !== term.exact) {
                    console.warn(
                        `GlossaryAnnotator: duplicate term '${text}' maps to both '${existing.key}' and '${term.key}'`,
                    );
                }
            }
        }
    }

    /**
     * Build the Domäne lookup from the entries' `domains`. A Domäne two entries claim
     * warns and keeps the first.
     */
    #buildDomainLookup() {
        for (const [key, entry] of Object.entries(this.#entries ?? {})) {
            for (const { id, subject } of entry?.domains ?? []) {
                const claim = domainClaimKey(id, subject);
                const existing = this.#domainEntries.get(claim);
                if (!existing) {
                    this.#domainEntries.set(claim, key);
                } else if (existing !== key) {
                    console.warn(
                        `GlossaryAnnotator: duplicate domain '${id}'${subject ? ` of '${subject}'` : ''} maps to both '${existing}' and '${key}'`,
                    );
                }
            }
        }
    }

    /** Build the regex for matching glossary terms, longest first. */
    #buildRegex() {
        const terms = [...this.#terms.keys()].sort((a, b) => b.length - a.length);
        if (terms.length === 0) return;

        const escaped = terms.map((term) => {
            const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const entry = this.#terms.get(term);
            if (entry?.exact) {
                return this.#buildExactTermPattern(term, escapedTerm);
            }
            return escapedTerm;
        });

        this.#regex = new RegExp(`(${escaped.join('|')})`, 'giu');

        // Every alternative of that regex begins with a literal from this set: the
        // exact-match patterns only add lookarounds, which never move where a match
        // starts. So the guard in annotateHTML() cannot skip a match.
        const firstChars = [...new Set(terms.map((term) => term[0]))]
            .join('')
            .replace(/[\]\\^-]/g, '\\$&');
        this.#firstCharRegex = new RegExp(`[${firstChars}]`, 'iu');
    }

    /**
     * Build the regex fragment for one exact-match alias.
     * @param {string} term - The alias, lower-cased; decides whether it needs the stricter guard.
     * @param {string} escapedTerm - The same alias, regex-escaped.
     * @returns {string} A pattern matching the alias only on word boundaries; a letter-only code also refuses to match inside dot-delimited abbreviations such as `d.h.` or `4.M.1`.
     */
    #buildExactTermPattern(term, escapedTerm) {
        const standardPattern = `(?<!${EXACT_TERM_BOUNDARY_CHAR_CLASS})${escapedTerm}(?!${EXACT_TERM_BOUNDARY_CHAR_CLASS})`;

        if (!LETTER_ONLY_EXACT_TERM_REGEX.test(term)) {
            return standardPattern;
        }

        return `(?<!${EXACT_TERM_BOUNDARY_CHAR_CLASS})(?<!${EXACT_TERM_BOUNDARY_CHAR_CLASS}\\.)${escapedTerm}(?!\\.${EXACT_TERM_BOUNDARY_CHAR_CLASS})(?!${EXACT_TERM_BOUNDARY_CHAR_CLASS})`;
    }
}
