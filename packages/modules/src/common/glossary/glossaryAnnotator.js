/**
 * GlossaryAnnotator — Singleton service for glossary term annotation.
 *
 * Owns all static glossary data and pure-text transformations:
 *  - HTML annotation (wraps glossary terms with interactive spans)
 *  - Glossary entry lookup (`getEntry`, `getEntryText`)
 *  - SVG element stamping (`stampGlossaryAttr`)
 *
 * Annotation is pure: it produces `data-glossary-key` spans. The interactive
 * popup behavior is handled separately by TooltipService.initGlossaryPopups().
 *
 * The term matcher is namespace-scoped. It is built from explicit alias
 * metadata on `namespace.shared.element_texts` entries.
 *
 * Usage:
 *   import { glossaryAnnotator } from './glossaryAnnotator.js';
 *   glossaryAnnotator.init(glossaryData, 'en');
 *   const annotated = glossaryAnnotator.annotateHTML(rawHtml);
 */

const CONFIG = {
    termClass: 'glossary-term',
    dataAttribute: 'data-glossary-key',
    /** Cap for annotation cache to bound memory */
    cacheLimit: 500,
};

const EXACT_TERM_BOUNDARY_CHAR_CLASS = '[\\p{L}\\p{M}\\p{N}_]';
const LETTER_ONLY_EXACT_TERM_REGEX = /^[\p{L}\p{M}]+$/u;

class GlossaryAnnotator {
    /** @type {object | null} Shared element_texts entries (namespace.shared.element_texts) */
    #entries = null;

    /** @type {object | null} Full glossary data for getEntryText() dot-path lookups */
    #data = null;

    /** @type {RegExp|null} Cached regex for annotateHTML */
    #regex = null;

    /** @type {Map<string, object>} Display text -> glossary term entry */
    #termDefinitions = new Map();

    /** @type {Map<string, object>} Lowercase-keyed term map for case-insensitive lookup */
    #lowerCaseTermMap = new Map();

    /** @type {Map<string, string>} Cache for annotateHTML results (raw → annotated) */
    #cache = new Map();

    /**
     * @type {Map<string, {title?: string, body?: string}>}
     * Entries supplied by the data payload rather than by `glossary.json`.
     * Deliberately **not** part of the term matcher — see `registerPayloadEntries`.
     */
    #payloadEntries = new Map();

    #initialized = false;

    /** @type {GlossaryAnnotator|null} */
    static #instance = null;

    static getInstance() {
        if (!GlossaryAnnotator.#instance) {
            GlossaryAnnotator.#instance = new GlossaryAnnotator();
        }
        return GlossaryAnnotator.#instance;
    }

    /** @private */
    constructor() {}

    get isInitialized() {
        return this.#initialized;
    }

    /**
     * Initialize with glossary data. Calling it again replaces the tree: the term
     * index, the caches and the payload entries all start over.
     * @param {object} glossaryData - Full glossary JSON
     * @param {string} namespace - Top-level key whose `shared.element_texts` is the term index (tba3: 'en', 'ma', 'sl')
     */
    init(glossaryData, namespace) {
        this.#entries = null;
        this.#data = null;
        this.#regex = null;
        this.#termDefinitions.clear();
        this.#lowerCaseTermMap.clear();
        this.#cache.clear();
        this.#payloadEntries.clear();
        this.#initialized = false;
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
        this.#buildRegex();
        this.#initialized = true;
    }

    /**
     * Register entries the data payload supplies, keyed for explicit lookup only.
     *
     * Competence-level descriptions arrive this way: the scales vary by state, so the
     * text cannot live in `glossary.json` without the client enumerating every
     * vocabulary — which is exactly what it used to do, and only ever managed for two of
     * the six that ship (see `competenceLevelPalette.getLevelDescriptions`).
     *
     * **These never enter `#termDefinitions` or `#regex`.** Free-text annotation matches
     * an alias anywhere in the HTML it is given, and level names are short, ambiguous
     * tokens — registering `I`, `V` or `A1` as aliases would wrap roman numerals and
     * stray letters in ordinary prose. An alias for a level has to be an unambiguous
     * spelling the client itself chose (`"KS III"` with `exact: true`), which is metadata
     * the payload does not carry. Payload entries therefore resolve only where a renderer
     * stamped `data-glossary-key` deliberately.
     *
     * Merged over a static entry of the same key rather than replacing it, so an entry
     * can keep its `glossary.json` aliases and title while taking its body from the data.
     * @param {Map<string, {title?: string, body?: string}>} entries - Canonical key to entry, as assembled from the payload; merged over any static entry of the same key.
     */
    registerPayloadEntries(entries) {
        for (const [key, entry] of entries) {
            if (typeof key === 'string' && key && entry) this.#payloadEntries.set(key, entry);
        }
    }

    /**
     * Get a glossary entry by key.
     * @param {string} key - Canonical key, or a configured display term or alias.
     * @returns {object | null} The entry, with payload text merged over the static one, or null when the key resolves to nothing.
     */
    getEntry(key) {
        const resolvedKey = this.resolveEntryKey(key);
        if (!resolvedKey) return null;

        const staticEntry = this.#entries?.[resolvedKey] ?? null;
        const payloadEntry = this.#payloadEntries.get(resolvedKey) ?? null;
        if (!payloadEntry) return staticEntry;

        // Payload wins field by field: the static entry keeps the aliases and title that
        // are the client's own vocabulary, the data supplies the body it alone can know.
        return staticEntry ? { ...staticEntry, ...payloadEntry } : payloadEntry;
    }

    /**
     * Resolve a canonical glossary entry key from either a canonical key or a
     * configured display term/alias.
     * @param {string} keyOrTerm - A canonical key, a display term, or an alias in any casing.
     * @returns {string|null} The canonical key, or null when nothing matches.
     */
    resolveEntryKey(keyOrTerm) {
        if (!keyOrTerm || typeof keyOrTerm !== 'string') return null;
        if (this.#entries?.[keyOrTerm] || this.#payloadEntries.has(keyOrTerm)) return keyOrTerm;

        const direct = this.#termDefinitions.get(keyOrTerm);
        if (direct?.key) return direct.key;

        return this.#lowerCaseTermMap.get(keyOrTerm.toLowerCase())?.key ?? null;
    }

    /**
     * Resolve a dot-notation path against the full glossary data and return the leaf.
     * @param {string} dotPath - Path into the assembled glossary tree, e.g. `en.overview.subtitle`.
     * @returns {string|undefined} The leaf value, or undefined when any segment is missing.
     */
    getEntryText(dotPath) {
        if (!this.#data || !dotPath) return undefined;
        const segments = dotPath.split('.');
        let current = this.#data;
        for (const segment of segments) {
            if (current == null || typeof current !== 'object') return undefined;
            current = current[segment];
        }
        return current;
    }

    /**
     * Resolve a dot-notation path and return a visible marker when the glossary
     * entry is missing or the annotator is not initialized yet.
     * @param {string} dotPath - Path into the assembled glossary tree.
     * @returns {string} The leaf value, or a visible placeholder marking the gap so a missing entry shows up in the UI instead of rendering as empty.
     */
    getRequiredEntryText(dotPath) {
        const resolved = this.getEntryText(dotPath);
        if (typeof resolved === 'string' && resolved.length > 0) {
            return resolved;
        }

        return `[Missing glossary entry: ${dotPath || '<empty path>'}]`;
    }

    /**
     * Annotate an HTML string — wraps glossary terms with interactive spans.
     * Skips content inside existing tags and already-annotated glossary spans.
     * Returns the input unchanged when not initialized.
     * @param {string} html - Markup to annotate; returned unchanged when the annotator is not initialised.
     * @param {Set<string>} [excludeKeys] - Keys to skip (prevents circular refs in nested popups)
     * @returns {string} The same markup with glossary terms wrapped in interactive spans.
     */
    annotateHTML(html, excludeKeys) {
        if (!html || !this.#regex || !this.#initialized) return html;
        const regex = this.#regex;

        // Cache lookup for calls without excludeKeys (common Tabulator path)
        if (!excludeKeys) {
            const cached = this.#cache.get(html);
            if (cached !== undefined) return cached;
        }

        const TAG_REGEX = /(<[^>]+>)/g;
        const segments = html.split(TAG_REGEX);

        let spanDepth = 0;
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
                const entry = this.#findTermEntry(match);
                if (!entry) return match;
                if (excludeKeys?.has(entry.key)) return match;
                return `<span class="${CONFIG.termClass}" ${CONFIG.dataAttribute}="${entry.key}">${match}</span>`;
            });
        });

        const result = annotated.join('');

        if (!excludeKeys) {
            if (this.#cache.size > CONFIG.cacheLimit) {
                this.#cache.clear();
            }
            this.#cache.set(html, result);
        }

        return result;
    }

    /**
     * Split plain text into glossary-aware text runs.
     * Returns unmatched text as plain runs and matched aliases as runs carrying
     * the canonical glossary key they resolve to.
     * @param {string} text - Plain text to split.
     * @param {object} [options] - Which glossary keys to leave unmatched.
     * @param {Set<string>} [options.excludeKeys] - Keys to skip from the result
     * @returns {Array<{ text: string, glossaryKey: string|null }>} Alternating plain and matched runs, in source order.
     */
    getTextSegments(text, options = {}) {
        if (typeof text !== 'string' || text.length === 0) return [];
        if (!this.#regex || !this.#initialized) {
            return [{ text, glossaryKey: null }];
        }

        const { excludeKeys = null } = options;
        const regex = new RegExp(this.#regex.source, this.#regex.flags);
        const segments = [];
        let lastIndex = 0;
        let match;

        while ((match = regex.exec(text)) !== null) {
            const matchedText = match[0];
            const matchIndex = match.index;

            if (matchIndex > lastIndex) {
                segments.push({
                    text: text.slice(lastIndex, matchIndex),
                    glossaryKey: null,
                });
            }

            const entry = this.#findTermEntry(matchedText);
            const glossaryKey = entry && !excludeKeys?.has(entry.key) ? entry.key : null;

            segments.push({
                text: matchedText,
                glossaryKey,
            });

            lastIndex = matchIndex + matchedText.length;
        }

        if (lastIndex < text.length) {
            segments.push({
                text: text.slice(lastIndex),
                glossaryKey: null,
            });
        }

        return this.#mergeAdjacentTextSegments(segments);
    }

    /**
     * Stamp glossary attributes on an SVG/HTML selection so it triggers popups.
     * No-op when not initialized.
     * @param {d3.Selection} selection - Nodes to stamp with the glossary data attributes.
     * @param {string|null|undefined} glossaryKey - Null is a no-op, so a caller may pass
     *        the result of a lookup that legitimately finds nothing.
     */
    stampGlossaryAttr(selection, glossaryKey) {
        if (!glossaryKey || !this.#initialized) return;
        selection
            .attr('data-glossary-key', glossaryKey)
            .classed('glossary-term', true)
            .style('cursor', 'help')
            .style('pointer-events', function () {
                return this?.namespaceURI === 'http://www.w3.org/2000/svg' ? 'all' : null;
            });
    }

    /**
     * Build a namespace-scoped term lookup from glossary alias metadata.
     */
    #buildTermLookup() {
        this.#termDefinitions.clear();
        this.#lowerCaseTermMap.clear();
        this.#cache.clear();

        for (const [key, entry] of Object.entries(this.#entries ?? {})) {
            const aliases = Array.isArray(entry?.aliases) ? entry.aliases : [];

            for (const alias of aliases) {
                const normalizedAlias = this.#normalizeAlias(alias);
                if (!normalizedAlias) continue;
                this.#registerTerm(normalizedAlias.text, { key, exact: normalizedAlias.exact });
            }
        }

        for (const [term, entry] of this.#termDefinitions) {
            this.#lowerCaseTermMap.set(term.toLowerCase(), entry);
        }
    }

    /**
     * Normalize one alias definition from glossary JSON.
     * @param {string | object} alias - An alias entry from the glossary JSON: bare text, or an object that can request exact matching.
     * @returns {{ text: string, exact: boolean }|null} The normalised alias, or null when it carries no usable text.
     */
    #normalizeAlias(alias) {
        if (typeof alias === 'string') {
            const text = alias.trim();
            return text ? { text, exact: false } : null;
        }

        if (!alias || typeof alias !== 'object' || typeof alias.text !== 'string') {
            return null;
        }

        const text = alias.text.trim();
        if (!text) return null;

        return {
            text,
            exact: Boolean(alias.exact),
        };
    }

    /**
     * Register one visible term in the active matcher.
     * @param {string} term - The visible alias to match on.
     * @param {{ key: string, exact?: boolean }} entry - Canonical key the term resolves to, and whether it must match exactly.
     */
    #registerTerm(term, entry) {
        if (!term || typeof term !== 'string' || !entry?.key) return;

        const normalizedTerm = term.trim();
        if (!normalizedTerm) return;

        const nextEntry = {
            key: entry.key,
            exact: Boolean(entry.exact),
        };

        const existing = this.#termDefinitions.get(normalizedTerm);
        if (!existing) {
            this.#termDefinitions.set(normalizedTerm, nextEntry);
            return;
        }

        if (existing.key === nextEntry.key && existing.exact === nextEntry.exact) {
            return;
        }

        console.warn(
            `GlossaryAnnotator: duplicate term '${normalizedTerm}' maps to both '${existing.key}' and '${nextEntry.key}'`,
        );
    }

    /**
     * Build the regex for matching glossary terms. Terms are sorted longest-first.
     */
    #buildRegex() {
        const terms = [...this.#termDefinitions.keys()].sort((a, b) => b.length - a.length);
        if (terms.length === 0) return;

        const escaped = terms.map((term) => {
            const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const entry = this.#termDefinitions.get(term);
            if (entry?.exact) {
                return this.#buildExactTermPattern(term, escapedTerm);
            }
            return escapedTerm;
        });

        this.#regex = new RegExp(`(${escaped.join('|')})`, 'giu');
    }

    /**
     * Build the regex fragment for one exact-match alias.
     * @param {string} term - The alias as authored, used to decide whether it needs the stricter guard.
     * @param {string} escapedTerm - The same alias, regex-escaped, as it appears in the pattern.
     * @returns {string} A pattern matching the alias only on real word boundaries — letter-only codes additionally refuse to match inside dot-delimited abbreviations such as `d.h.` or `4.M.1`.
     */
    #buildExactTermPattern(term, escapedTerm) {
        const standardPattern = `(?<!${EXACT_TERM_BOUNDARY_CHAR_CLASS})${escapedTerm}(?!${EXACT_TERM_BOUNDARY_CHAR_CLASS})`;

        // Prevent single- or multi-letter code aliases from matching inside
        // dot-delimited abbreviations like d.h., i.d.R., or 4.M.1.
        if (!LETTER_ONLY_EXACT_TERM_REGEX.test(term)) {
            return standardPattern;
        }

        return `(?<!${EXACT_TERM_BOUNDARY_CHAR_CLASS})(?<!${EXACT_TERM_BOUNDARY_CHAR_CLASS}\\.)${escapedTerm}(?!\\.${EXACT_TERM_BOUNDARY_CHAR_CLASS})(?!${EXACT_TERM_BOUNDARY_CHAR_CLASS})`;
    }

    /**
     * Find the glossary term entry for matched text (case-insensitive fallback).
     * @param {string} matchedText - The alias the matcher found in the source text.
     * @returns {{key: string, exact?: boolean}|null} The term definition, or null when nothing matches even case-insensitively.
     */
    #findTermEntry(matchedText) {
        const direct = this.#termDefinitions.get(matchedText);
        if (direct) return direct;
        return this.#lowerCaseTermMap.get(matchedText.toLowerCase()) ?? null;
    }

    /**
     * Merge adjacent text runs with identical glossary resolution.
     * @param {Array<{ text: string, glossaryKey: string|null }>} segments - Runs in source order, possibly with neighbours that resolve alike.
     * @returns {Array<{ text: string, glossaryKey: string|null }>} The same content with adjacent like-resolved runs joined, so the DOM gets one span per term rather than several.
     */
    #mergeAdjacentTextSegments(segments) {
        const mergedSegments = [];

        segments.forEach((segment) => {
            if (!segment?.text) return;

            const previousSegment = mergedSegments[mergedSegments.length - 1];
            if (previousSegment && previousSegment.glossaryKey === segment.glossaryKey) {
                previousSegment.text += segment.text;
                return;
            }

            mergedSegments.push({
                text: segment.text,
                glossaryKey: segment.glossaryKey ?? null,
            });
        });

        return mergedSegments;
    }
}

export const glossaryAnnotator = GlossaryAnnotator.getInstance();
