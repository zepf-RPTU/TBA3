/**
 * MaGlossarySearchModule - Searchable glossary list for the MA help view.
 * Owns filtering and expand/collapse behavior inside the help page section.
 */

import { BaseModule, escapeHtml, iconSvg, stripHtmlToText, targetEl } from '@tba3/module-base';
import { glossaryAnnotator } from '@tba3/modules/glossary';
import './maGlossarySearchModule.css';

export class MaGlossarySearchModule extends BaseModule {
    /** @type {HTMLInputElement|null} */
    #searchInput = null;
    /** @type {HTMLElement|null} */
    #helpList = null;
    /** @type {Array<[string, any, string]>|null} */
    #cachedEntries = null;
    /** @type {object | null} */
    #cachedSource = null;

    /** @override */
    async _doRender() {
        const container = this.container;
        if (!container) return;
        container.innerHTML = `
            <input type="text" class="help-search-input" placeholder="Suchen Sie nach Begriffen...">
            <div class="help-list"></div>
        `;

        this.#searchInput = /** @type {HTMLInputElement|null} */ (
            container.querySelector('.help-search-input')
        );
        this.#helpList = /** @type {HTMLElement|null} */ (container.querySelector('.help-list'));

        this.#renderHelpList();
        this.#setupListeners();
    }

    #extractGlossaryEntries() {
        const glossaryEntries = this.getOption('glossaryData')?.ma?.shared?.element_texts;
        if (!glossaryEntries || typeof glossaryEntries !== 'object') return [];

        // Cache the filtered [id, entry, searchText] triples; entries are immutable
        // post-init, so we only rebuild if the source object reference changes.
        if (this.#cachedEntries && this.#cachedSource === glossaryEntries) {
            return this.#cachedEntries;
        }

        this.#cachedEntries = Object.entries(glossaryEntries)
            .filter(([, entry]) => {
                if (!entry || typeof entry !== 'object') return false;
                return Boolean(entry.title) && Boolean(entry.body);
            })
            .map(([id, entry]) => /** @type {[string, any, string]} */ ([
                id,
                entry,
                `${entry.title} ${stripHtmlToText(entry.body)}`.toLowerCase(),
            ]));
        this.#cachedSource = glossaryEntries;
        return this.#cachedEntries;
    }

    #renderHelpList(searchTerm = '') {
        if (!this.#helpList) return;

        const lowerSearch = searchTerm.toLowerCase();
        const entries = this.#extractGlossaryEntries().filter(([, , searchText]) => {
            return !lowerSearch || searchText.includes(lowerSearch);
        });

        if (entries.length === 0) {
            this.#helpList.innerHTML = `<p class="help-no-results">${glossaryAnnotator.getRequiredEntryText('general.messages.no-entries')}</p>`;
            return;
        }

        this.#helpList.innerHTML = entries
            .map(([id, entry]) => {
                const title = escapeHtml(entry.title);
                const body = entry.body;

                return `
                <div class="help-item" data-id="${escapeHtml(id)}">
                    <button type="button" class="help-item-header interactive-subtle" aria-expanded="false">
                        <h3 class="help-item-title">${title}</h3>
                        <span class="help-item-toggle">${iconSvg('keyboard_arrow_down')}</span>
                    </button>
                    <div class="help-item-content" hidden>
                        ${body}
                    </div>
                </div>
            `;
            })
            .join('');
    }

    #setupListeners() {
        if (this.#searchInput) {
            this.resources.trackDomListener(this.#searchInput, 'input', (event) => {
                this.#renderHelpList(/** @type {HTMLInputElement} */ (event.target).value);
            });
        }

        if (this.#helpList) {
            this.resources.trackDomListener(this.#helpList, 'click', (event) => {
                const header = targetEl(event)?.closest('.help-item-header');
                if (!header) return;

                const item = header.closest('.help-item');
                if (!item) return;

                const content = item.querySelector('.help-item-content');
                if (!content) return;

                const isExpanded = !item.classList.contains('expanded');

                item.classList.toggle('expanded', isExpanded);
                header.setAttribute('aria-expanded', String(isExpanded));
                /** @type {HTMLElement} */ (content).hidden = !isExpanded;
                // The arrow turns via `.help-item.expanded` (CSS); no glyph swap.
            });
        }
    }
}
