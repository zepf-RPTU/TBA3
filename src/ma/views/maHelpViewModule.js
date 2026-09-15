/**
 * MaHelpViewModule — the MA Hilfe view: static help cards and the didactic hints,
 * plus the searchable glossary with its expandable entries.
 */

import { BaseViewModule } from '../../common/modules/baseViewModule.js';
import { MaGlossarySearchModule } from '../modules/maGlossarySearch/maGlossarySearchModule.js';
import { applyTemplateTokens, escapeHtml, iconSvg, queryEl } from '@tba3/module-base';
import { glossaryAnnotator } from '@tba3/modules/glossary';
import './maHelpViewModule.css';

const CONFIG = {
    glossaryModuleId: 'ma-help-glossary-search',
    backNavId: 'ma-help-back-nav',
};

/** The glyphs the "Symbole" card explains, in the order it lists them. */
const HELP_SYMBOLS = ['home', 'bar_chart', 'groups', 'list_alt', 'person', 'download'];

/**
 * One entry of this view's glossary fragment.
 * @param {string} path - Dot-path below `ma.help`.
 * @returns {string} The entry text.
 */
function helpText(path) {
    return glossaryAnnotator.getRequiredEntryText(`ma.help.${path}`);
}

/**
 * One help card: icon and title in its header, content below.
 * @param {string} icon - Material Symbols glyph of the card header.
 * @param {string} path - Dot-path below `ma.help` of an entry carrying `title` (and `body`).
 * @param {string} [content] - The card's content markup; the entry's `body` by default.
 * @returns {string} The card markup.
 */
function helpCard(icon, path, content = helpText(`${path}.body`)) {
    return `
        <article class="help-card">
            <div class="help-card-header">
                <span class="help-card-icon">${iconSvg(icon)}</span>
                <h3>${helpText(`${path}.title`)}</h3>
            </div>
            <div class="help-card-content">${content}</div>
        </article>`;
}

export class MaHelpViewModule extends BaseViewModule {
    /** @type {MaGlossarySearchModule|null} */
    #glossarySearchModule = null;

    /**
     * Creates a new MaHelpViewModule instance
     * @param {string} id - Unique identifier for this module
     * @param {HTMLElement} container - Container element
     * @param {import('./maLayoutViewBase.js').MAViewModuleOptions} [options={}] - Configuration options
     */
    constructor(id, container, options = {}) {
        super(id, container, options);
    }

    /**
     * Render the help view module
     * @override
     * @param {object} _data - Data for rendering (not used but kept for consistency)
     * @returns {Promise<void>}
     */
    async _renderView(_data = {}) {
        this.#createDOM();
        await this.#initializeComponents();
    }

    /**
     * Update the "back to previous view" card each time the help view becomes active.
     * Called by MaAppModule.afterShowView() with the view the user navigated from.
     * @param {string|null} previousViewType - The view navigated from, or `null` when help was opened directly.
     */
    setPreviousView(previousViewType) {
        const backNav = queryEl(this.container, `#${CONFIG.backNavId}`);
        if (!backNav) return;

        if (!previousViewType || previousViewType === 'help') {
            backNav.hidden = true;
            return;
        }

        const prev = this.getOption('viewConfig')?.[previousViewType];
        if (!prev) {
            backNav.hidden = true;
            return;
        }

        const iconHTML = iconSvg(prev.icon);
        const label = applyTemplateTokens(helpText('back-link.label'), {
            view: escapeHtml(prev.label),
        });

        backNav.hidden = false;
        backNav.innerHTML = `
            <button class="help-back-btn btn btn--text" data-view="${escapeHtml(previousViewType)}">
                <span class="help-back-icon">${iconHTML}</span>
                <span>${label}</span>
            </button>`;

        const navigate = this.getOption('onNavigate');
        backNav.querySelector('button')?.addEventListener('click', () => {
            navigate?.(previousViewType);
        });
    }

    /**
     * Creates the DOM structure for the help view
     */
    #createDOM() {
        const container = this.container;
        if (!container) return;

        const symbolsContent = `${helpText('faq.symbols.body')}
            <ul>
                ${HELP_SYMBOLS.map((icon) => `<li>${iconSvg(icon)} ${helpText(`faq.symbols.${icon}.label`)}</li>`).join('')}
            </ul>`;
        const questionsContent = applyTemplateTokens(helpText('faq.questions.body'), {
            downloadIcon: iconSvg('download'),
        });

        container.className = 'ma-help-view view-base';
        container.innerHTML = `
            <div class="help-page">
                <div id="${CONFIG.backNavId}" class="help-back-nav" hidden></div>
                <div class="help-notice notice-callout layout-row" role="note" aria-label="${glossaryAnnotator.getRequiredEntryText('general.buttons.element_texts.region-hint.label')}">
                    <span class="help-notice-icon notice-callout-icon" aria-hidden="true">
                            ${iconSvg('warning')}
                    </span>
                    <p class="help-notice-message notice-callout-message">${helpText('placeholder-notice.body')}</p>
                </div>

                <section class="help-section help-section-glossary" aria-labelledby="helpGlossaryTitle">
                    <h2 id="helpGlossaryTitle" class="help-section-title">${helpText('glossary.title')}</h2>
                    <div id="${CONFIG.glossaryModuleId}"></div>
                </section>

                <section class="help-section" aria-labelledby="helpDidacticTitle">
                    <h2 id="helpDidacticTitle" class="help-section-title">${helpText('didactic.title')}</h2>
                    <div class="layout-grid layout-grid--auto help-card-grid">
                        ${helpCard('lightbulb', 'didactic.support-ideas')}
                        ${helpCard('menu_book', 'didactic.materials')}
                        ${helpCard('link', 'didactic.links')}
                    </div>
                </section>

                <section class="help-section" aria-labelledby="helpFaqTitle">
                    <h2 id="helpFaqTitle" class="help-section-title">${helpText('faq.title')}</h2>
                    <div class="layout-grid layout-grid--auto help-card-grid">
                        ${helpCard('explore', 'faq.navigation')}
                        ${helpCard('settings', 'faq.symbols', symbolsContent)}
                        ${helpCard('help', 'faq.questions', questionsContent)}
                    </div>
                </section>
            </div>
        `;
    }

    /**
     * Initializes child modules.
     */
    async #initializeComponents() {
        this.#glossarySearchModule = this.destroyAndUnregister(this.#glossarySearchModule);

        const glossaryContainer = this.getContainer(CONFIG.glossaryModuleId, 'Glossary Search');
        if (!glossaryContainer) return;

        this.#glossarySearchModule = new MaGlossarySearchModule(
            CONFIG.glossaryModuleId,
            glossaryContainer,
            {
                glossaryData: this.getOption('glossaryData'),
            },
        );
        this.registerChildModule(this.#glossarySearchModule);

        await this.#glossarySearchModule?.init();
    }
}
