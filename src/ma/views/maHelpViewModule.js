/**
 * MaHelpViewModule — the MA Hilfe view: static help cards and the didactic hints,
 * plus the searchable glossary with its expandable entries.
 */

import { BaseViewModule } from '../../common/modules/baseViewModule.js';
import { MaGlossarySearchModule } from '../modules/maGlossarySearch/maGlossarySearchModule.js';
import { iconSvg, noticeCallout, renderIcon, trusted } from '@tba3/module-base';
import { html, nothing, render } from 'lit';
import { applyTemplateTokens } from '@tba3/module-base/glossary';
import './maHelpViewModule.css';

const CONFIG = {
    glossaryModuleId: 'ma-help-glossary-search',
    backNavId: 'ma-help-back-nav',
};

/** @typedef {import('@tba3/modules/context').GlossaryAnnotator} Glossary */

/** The glyphs the "Symbole" card explains, in the order it lists them. */
const HELP_SYMBOLS = [
    'home',
    'bar_chart',
    'groups',
    'list_alt',
    'person',
    'download',
    'check_box',
    'visibility',
    'tune',
    'swap_horiz',
];

/**
 * One entry of this view's glossary fragment.
 * @param {Glossary} glossary
 * @param {string} path - Dot-path below `ma.help`.
 * @returns {string}
 */
function helpText(glossary, path) {
    return glossary.getRequiredEntryText(`ma.help.${path}`);
}

/**
 * One help card: icon and title in its header, content below.
 * @param {Glossary} glossary
 * @param {string} icon - Material Symbols glyph of the card header.
 * @param {string} path - Dot-path below `ma.help` of an entry carrying `title` (and `body`).
 * @param {import('lit').TemplateResult} [content]
 * @returns {import('lit').TemplateResult}
 */
function helpCard(
    glossary,
    icon,
    path,
    content = html`${trusted(helpText(glossary, `${path}.body`))}`,
) {
    return html`<article class="help-card">
        <div class="help-card-header">
            <span class="help-card-icon">${renderIcon(icon)}</span>
            <h3>${helpText(glossary, `${path}.title`)}</h3>
        </div>
        <div class="help-card-content glossary-prose">${content}</div>
    </article>`;
}

/** @augments {BaseViewModule<import('../maAppModule.js').MaState>} */
export class MaHelpViewModule extends BaseViewModule {
    /** @type {string|null} The view the back link returns to. */
    #backTarget = null;
    /** @type {MaGlossarySearchModule|null} The glossary section's search, kept across re-renders. */
    #search = null;

    /**
     * @override
     * @returns {Promise<void>}
     */
    async _renderView() {
        this.#search = MaGlossarySearchModule.create(CONFIG.glossaryModuleId, this._childOptions());
        this.#showBackLink(this.options.appState.previousView.value ?? null);
        this.watch(this.options.appState.previousView, (view) => this.#showBackLink(view));
    }

    /**
     * Point the back link at the view the user came from; none for help itself or an
     * unknown key.
     * @param {string|null} previousViewType - The view navigated from, or `null` when help was opened directly.
     */
    #showBackLink(previousViewType) {
        this.#backTarget =
            previousViewType &&
            previousViewType !== 'help' &&
            this.options.viewConfig[previousViewType]
                ? previousViewType
                : null;
        this.#render();
    }

    /** Render the page; a re-render only moves the back link. */
    #render() {
        const { glossary } = this.options.context;

        const symbolsContent = html`${trusted(helpText(glossary, 'faq.symbols.body'))}
            <ul>
                ${HELP_SYMBOLS.map((icon) => {
                    // One line: the space between glyph and label is the only whitespace.
                    const glyph = renderIcon(icon);
                    const label = helpText(glossary, `faq.symbols.${icon}.label`);
                    return html`<li>${glyph} ${label}</li>`;
                })}
            </ul>`;
        const questionsContent = html`${trusted(
            applyTemplateTokens(helpText(glossary, 'faq.questions.body'), {
                downloadIcon: iconSvg('download'),
            }),
        )}`;

        render(
            html`<div class="help-page">
                ${this.#backNavTemplate()}

                <section class="help-section" aria-labelledby="helpGlossaryTitle">
                    <h2 id="helpGlossaryTitle">${helpText(glossary, 'glossary.title')}</h2>
                    ${this.#search}
                </section>

                <section class="help-section" aria-labelledby="helpDidacticTitle">
                    <h2 id="helpDidacticTitle">${helpText(glossary, 'didactic.title')}</h2>
                    ${noticeCallout({
                        // Only these cards are placeholders; the glossary above is real.
                        message: helpText(glossary, 'placeholder-notice.body'),
                        ariaLabel: glossary.getRequiredEntryText(
                            'general.buttons.element_texts.region-hint.label',
                        ),
                    })}
                    <div class="layout-grid layout-grid--auto help-card-grid">
                        ${helpCard(glossary, 'lightbulb', 'didactic.support-ideas')}
                        ${helpCard(glossary, 'menu_book', 'didactic.materials')}
                        ${helpCard(glossary, 'link', 'didactic.links')}
                    </div>
                </section>

                <section class="help-section" aria-labelledby="helpFaqTitle">
                    <h2 id="helpFaqTitle">${helpText(glossary, 'faq.title')}</h2>
                    <div class="layout-grid layout-grid--auto help-card-grid">
                        ${helpCard(glossary, 'explore', 'faq.navigation')}
                        ${helpCard(glossary, 'settings', 'faq.symbols', symbolsContent)}
                        ${helpCard(glossary, 'help', 'faq.questions', questionsContent)}
                    </div>
                </section>
            </div>`,
            this,
        );
    }

    /**
     * The back link, hidden while there is no view to return to.
     * @returns {import('lit').TemplateResult}
     */
    #backNavTemplate() {
        const prev = this.#backTarget ? this.options.viewConfig[this.#backTarget] : null;
        const label = prev
            ? applyTemplateTokens(helpText(this.options.context.glossary, 'back-link.label'), {
                  view: prev.label,
              })
            : '';
        const content = prev ? html`${renderIcon(prev.icon)}<span>${label}</span>` : nothing;
        return html`<div id=${CONFIG.backNavId} class="help-back-nav" ?hidden=${!prev}>
            <button type="button" class="help-back-btn btn btn--text" @click=${this.#onBack}>
                ${content}
            </button>
        </div>`;
    }

    #onBack = () => {
        if (this.#backTarget) this.navigate(this.#backTarget);
    };
}

customElements.define('tba-ma-help-view', MaHelpViewModule);
