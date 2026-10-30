/**
 * NavCardModule — a grid of navigation cards, each a preview icon that
 * switches the dashboard to its view. The card pointing at the current view is marked
 * and not clickable.
 */

import { ContentModule, isModifiedClick, renderIcon } from '@tba3/module-base';
import { resolveDotPath } from '@tba3/module-base/glossary';
import { html, nothing, render } from 'lit';

import { repeat } from 'lit/directives/repeat.js';

/**
 * @typedef {object} NavCardItem
 * @property {string} viewTarget - View the card navigates to.
 * @property {string} label - The view's name.
 * @property {string} glossaryPath - The view's glossary entry; its `description` is the card line, its `tooltip` the card tooltip.
 * @property {{[key: string]: unknown}} [statePatch] - App state written with the navigation.
 * @property {string} [icon] - Material Symbols name of the card's visual.
 * @property {string} [labelIcon] - Material Symbols name shown inside the label.
 */

/**
 * One card per view the app advertises, in viewConfig key order — the order the sidebar
 * and the router use. Views pinned to the sidebar bottom are utilities, not destinations.
 * A card names its view as the sidebar does, reads its copy from the same entry, and
 * takes the entry's `navCard` extras.
 * @param {{[viewType: string]: import('../../app/appModule.js').LabelledViewConfigEntry}} viewConfig
 * @param {'icon'|'labelIcon'} iconSlot - Where the view's icon goes: the card's visual, or inside its label.
 * @returns {NavCardItem[]}
 */
export function viewNavCardItems(viewConfig, iconSlot) {
    return Object.entries(viewConfig)
        .filter(([, viewData]) => !viewData.sidebarPinBottom)
        .map(([viewTarget, viewData]) => ({
            [iconSlot]: viewData.icon,
            viewTarget,
            label: viewData.label,
            glossaryPath: viewData.navigationGlossaryPath,
            ...viewData.navCard,
        }));
}

/** Hover-surface class per `interactivePreset` option value. */
const PRESET_CLASSES = {
    card: 'interactive-card',
    subtle: 'interactive-subtle',
};

/**
 * @typedef {import('@tba3/module-base').ContentOptions & {
 *   items: NavCardItem[],
 *   previewLabelTag?: 'h2' | 'h3',
 *   interactivePreset?: keyof typeof PRESET_CLASSES,
 *   onNavigate: (viewTarget: string, statePatch?: NavCardItem['statePatch']) => void,
 *   context: import('@tba3/modules/context').ModuleContext,
 * }} NavCardOptions
 */

/** @augments {ContentModule<NavCardOptions>} */
export class NavCardModule extends ContentModule {
    /**
     * @override
     * @type {import('lit').PropertyDeclarations}
     */
    static properties = { currentView: { attribute: false } };

    constructor() {
        super();
        /** @type {string|null} The view whose card is marked current and inert. */
        this.currentView = null;
    }

    /**
     * Render the navigation cards; a re-render patches them in place.
     * @override
     * @returns {Promise<void>}
     */
    async _renderBody() {
        render(
            repeat(
                this.options.items,
                (item) => item.viewTarget,
                (item) => this.#cardTemplate(item, item.viewTarget === this.currentView),
            ),
            this.contentContainer,
        );
    }

    /**
     * One card: inert with the current-view marker when it points at the current view,
     * else a link to the view's hash, so it opens in a new tab like any link. A plain
     * click, Enter's included, navigates through the app, which writes the
     * card's state patch on the way; the link's `data-view-target` names its item to
     * the click handler.
     * @param {NavCardItem} item
     * @param {boolean} isCurrent
     * @returns {import('lit').TemplateResult}
     */
    #cardTemplate(item, isCurrent) {
        const entry = resolveDotPath(this.options.context.glossaryData, item.glossaryPath);
        const interactive = `${PRESET_CLASSES[this.options.interactivePreset ?? 'card']} hover-border`;
        const description = entry?.description
            ? html`<div class="preview-description">${entry.description}</div>`
            : nothing;
        // The marker beside the heading, not in it: the heading names the view alone.
        const content = html`${this.#visualTemplate(item)}${this.#labelTemplate(
            item,
        )}${isCurrent ? this.#currentMarkerTemplate() : nothing}${description}`;
        if (isCurrent) {
            return html`<div
                class="preview-item"
                data-tooltip-text=${entry?.tooltip || nothing}
                aria-current="page"
            >
                ${content}
            </div>`;
        }
        return html`<a
            class="preview-item ${interactive}"
            href="#${item.viewTarget}"
            data-view-target=${item.viewTarget}
            data-tooltip-text=${entry?.tooltip || nothing}
            @click=${this.#onActivate}
        >
            ${content}
        </a>`;
    }

    /**
     * The card's visual: a named Material Symbols icon.
     * @param {NavCardItem} item
     * @returns {import('lit').TemplateResult | typeof nothing} The decorative visual box.
     */
    #visualTemplate(item) {
        const { icon } = item;
        if (!icon) return nothing;
        const glyph = renderIcon(icon);
        return html`<div class="preview-icon preview-media" aria-hidden="true">${glyph}</div>`;
    }

    /**
     * The label. An icon that sits inside it is a live element, so the
     * label itself stays text. The space is the separator: the label box is an inline
     * flow, not a flex row, so without it the glyph and the first letter touch — which is
     * also why the template keeps every other whitespace out of the label.
     * @param {NavCardItem} item
     * @returns {import('lit').TemplateResult}
     */
    #labelTemplate(item) {
        const { labelIcon } = item;
        const icon = labelIcon ? [renderIcon(labelIcon), ' '] : nothing;
        return this.options.previewLabelTag === 'h2'
            ? html`<h2 class="preview-label">${icon}${item.label}</h2>`
            : html`<h3 class="preview-label">${icon}${item.label}</h3>`;
    }

    /** @returns {import('lit').TemplateResult} The current card's "you are here" badge. */
    #currentMarkerTemplate() {
        return html`<span class="preview-current-view"
            >${this.options.context.glossary.getRequiredEntryText('general.messages.current-view')}</span
        >`;
    }

    /**
     * A plain click (or Enter) on a card navigates through the app; a click with a
     * modifier key is the browser's, which opens the link in a new tab or window.
     * @param {MouseEvent} event - A click on a navigation card.
     */
    #onActivate = (event) => {
        if (isModifiedClick(event)) return;
        event.preventDefault();
        const { viewTarget } = /** @type {HTMLElement} */ (event.currentTarget).dataset;
        const item = this.options.items.find((candidate) => candidate.viewTarget === viewTarget);
        if (item) this.options.onNavigate(item.viewTarget, item.statePatch);
    };
}

customElements.define('tba-nav-card', NavCardModule);
