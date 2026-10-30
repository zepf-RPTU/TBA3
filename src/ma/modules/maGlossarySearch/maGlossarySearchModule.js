/**
 * MaGlossarySearchModule — the searchable list of the app's glossary entries, in
 * alphabetical order, found by title, text and the terms' other names.
 */

import { BaseModule, renderIcon, trusted } from '@tba3/module-base';
import { aliasText, applyTemplateTokens } from '@tba3/module-base/glossary';
import { html } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import './maGlossarySearchModule.css';

/**
 * @typedef {import('@tba3/module-base').BaseOptions & {
 *   context: import('@tba3/modules/context').ModuleContext,
 * }} MaGlossarySearchOptions
 */

const TITLE_ORDER = new Intl.Collator('de');

/** @augments {BaseModule<MaGlossarySearchOptions>} */
export class MaGlossarySearchModule extends BaseModule {
    /** The input's current value, lower-cased. */
    #searchTerm = '';
    /** @type {Map<string, string>} Each entry's lower-cased search text, by entry id */
    #searchTexts = new Map();

    /** @override */
    _setup() {
        super._setup();
        this.classList.add('help-glossary-search');
    }

    /**
     * The search text is what an entry shows, title and body, read once from the first
     * render, and the other names it is known by (its aliases: "Niveaustufe" finds the
     * Aufgabenniveau).
     * @override
     */
    firstUpdated() {
        const entries = new Map(this.options.context.glossary.getEntries());
        for (const item of this.querySelectorAll('.help-item')) {
            const id = /** @type {HTMLElement} */ (item).dataset.id ?? '';
            const aliases = (entries.get(id)?.aliases ?? []).map(aliasText);
            this.#searchTexts.set(id, [item.textContent ?? '', ...aliases].join(' ').toLowerCase());
        }
    }

    /**
     * Every entry, built once as a native disclosure, plus the empty-result message; a
     * search only re-renders which of them are hidden, so an open entry stays open.
     * @override
     * @returns {unknown}
     */
    render() {
        const { glossary } = this.options.context;
        const text = (/** @type {string} */ key) =>
            glossary.getRequiredEntryText(`ma.help.glossary.${key}`);
        const entries = glossary
            .getEntries()
            .filter(([, entry]) => entry.title && entry.body)
            .sort(([, a], [, b]) => TITLE_ORDER.compare(String(a.title), String(b.title)));
        const visible = entries.filter(([id]) => this.#matches(id));
        const status = !this.#searchTerm
            ? ''
            : visible.length === 1
              ? text('result-count-one')
              : applyTemplateTokens(text('result-count-many'), {
                    count: String(visible.length),
                });
        return html`
            <label class="help-search-label" for=${`${this.id}-input`}
                >${text('search-label')}</label
            >
            <input
                id=${`${this.id}-input`}
                type="search"
                class="control-input help-search-input"
                placeholder=${text('search-placeholder')}
                @input=${this.#onInput}
            />
            <p class="help-result-count" role="status">${status}</p>
            <div class="help-list">
                ${repeat(
                    entries,
                    ([id]) => id,
                    ([id, entry]) => html`
                        <details class="help-item" data-id=${id} ?hidden=${!this.#matches(id)}>
                            <summary class="help-item-header interactive-subtle">
                                <h3 class="help-item-title">${entry.title}</h3>
                                <span class="help-item-toggle" aria-hidden="true"
                                    >${renderIcon('keyboard_arrow_down')}</span
                                >
                            </summary>
                            <div class="help-item-content glossary-prose">
                                ${trusted(entry.body)}
                            </div>
                        </details>
                    `,
                )}
                <div class="help-no-results" ?hidden=${visible.length > 0}>
                    <p>${glossary.getRequiredEntryText('general.messages.no-entries')}</p>
                    <button
                        type="button"
                        class="btn btn--text btn--size-control"
                        @click=${this.#onClear}
                    >
                        ${text('clear')}
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Whether an entry's search text (title, body, aliases) contains the search term.
     * @param {string} id
     * @returns {boolean} True while the entry shows.
     */
    #matches(id) {
        return !this.#searchTerm || (this.#searchTexts.get(id) ?? '').includes(this.#searchTerm);
    }

    /** @param {Event} event - An input in the search field. */
    #onInput = (event) => {
        this.#searchTerm = /** @type {HTMLInputElement} */ (
            event.currentTarget
        ).value.toLowerCase();
        this.requestUpdate();
    };

    /**
     * Empty the search and give the field back its focus. The field is written here,
     * not bound: a binding would write the lower-cased term back while the user types.
     */
    #onClear = () => {
        const input = /** @type {HTMLInputElement|null} */ (
            this.querySelector('.help-search-input')
        );
        if (input) input.value = '';
        this.#searchTerm = '';
        this.requestUpdate();
        input?.focus();
    };
}

customElements.define('tba-ma-glossary-search', MaGlossarySearchModule);
