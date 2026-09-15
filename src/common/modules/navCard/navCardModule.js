/**
 * NavCardModule - Navigation cards module
 * Provides navigation cards as a reusable module component
 * Manages multiple navigation cards with clickable preview items
 */

import { ContentModule, createIcon, MISSING_GLOSSARY_TITLE, targetEl } from '@tba3/module-base';
import { glossaryAnnotator } from '@tba3/modules/glossary';
import { renderBandThumbnail } from '../bandThumbnail.js';

/**
 * NavCardModule - Creates and manages navigation cards
 * @augments ContentModule
 */
export class NavCardModule extends ContentModule {
    /** @type {((viewTarget: string, viewMode?: string) => void)|null} */
    #navigationCallback = null;
    /** @type {string|null} */
    #currentView = null;

    /**
     * Creates a new NavCardModule instance
     * @param {string} id - Unique identifier for this module
     * @param {string|HTMLElement} container - Container element or selector
     * @param {{[key: string]: any}} [options={}] - Configuration options: items[] of
     *   { label, viewTarget, viewMode?, chartClass?, icon?, labelIcon?, glossarySubKey? }, currentView,
     *   previewLabelTag, interactivePreset, onNavigate. See setDefaults().
     */
    constructor(id, container, options = {}) {
        super(id, container, options);

        this.setDefaults({
            items: [],
            currentView: null,
            previewLabelTag: 'h3',
            interactivePreset: 'card',
        });

        this.#navigationCallback = options.onNavigate || null;
        this.#currentView = options.currentView || null;
    }

    /**
     * Render the navigation cards
     * @override
     * @param {object} data - Optional data for rendering
     * @returns {Promise<void>}
     */
    async _doRenderContent(data = {}) {
        const renderOptions = { ...this.options, ...data };

        if (data.currentView !== undefined) {
            this.#currentView = data.currentView;
        }

        // Clear container
        this.contentContainer.innerHTML = '';

        this.#resolveItemsWithGlossary(renderOptions.items).forEach((item) => {
            this.contentContainer.appendChild(this.#createPreviewItem(item));
        });

        // Setup event handlers using event delegation
        this.#setupEventHandlers();
    }

    /**
     * Resolve items by merging glossary element_texts into label and description.
     * If an item has a `glossarySubKey` and the module's glossaryElementTexts contains
     * a matching entry, the item's label is replaced by entry.title, its description by
     * entry.description and its tooltip by entry.tooltip. An item with a sub key but no
     * entry title renders MISSING_GLOSSARY_TITLE — the glossary is the only copy source.
     * @param {Array<object>} items - Original items from options
     * @returns {Array<object>} Resolved items (new objects; originals are not mutated)
     */
    #resolveItemsWithGlossary(items) {
        const elementTexts = this.glossaryElementTexts ?? {};

        return items.map((item) => {
            // No sub key means the item declares its own label. One that
            // declares neither would render — and be announced — as
            // `undefined`, so the gap is made visible instead.
            if (!item.glossarySubKey) {
                return item.label ? item : { ...item, label: MISSING_GLOSSARY_TITLE };
            }
            const entry = elementTexts[item.glossarySubKey] ?? {};

            return {
                ...item,
                label: entry.title ?? MISSING_GLOSSARY_TITLE,
                description: entry.description,
                tooltipText: entry.tooltip,
            };
        });
    }

    /**
     * Create a preview item element
     * @param {object} item - Item configuration
     * @returns {HTMLElement} The preview item; non-interactive when it points at the current view.
     */
    #createPreviewItem(item) {
        const previewItem = document.createElement('div');
        previewItem.className = 'preview-item';

        const isCurrentView = !!this.#currentView && item.viewTarget === this.#currentView;
        const isClickable = item.viewTarget && !isCurrentView;

        // Interactive utility class based on preset option
        const presetClass =
            {
                card: 'interactive-card',
                subtle: 'interactive-subtle',
            }[this.getOption('interactivePreset')] || 'interactive-card';

        // Set classes using toggle for cleaner code
        previewItem.classList.toggle('preview-item-clickable', isClickable);
        previewItem.classList.toggle('preview-item-disabled', isCurrentView);

        // Apply interactive utility classes
        if (isClickable) {
            previewItem.classList.add(presetClass, 'hover-border');
        } else if (isCurrentView) {
            previewItem.classList.add('disabled-soft');
        }

        // Always set viewTarget for identification (needed for setCurrentView)
        if (item.viewTarget) {
            previewItem.dataset.viewTarget = item.viewTarget;
        }

        if (isCurrentView) {
            previewItem.setAttribute('aria-current', 'page');
        }

        // Set interactive attributes for clickable items only
        if (isClickable) {
            if (item.viewMode) {
                previewItem.dataset.viewMode = item.viewMode;
            }

            previewItem.setAttribute('role', 'button');
            previewItem.setAttribute('tabindex', '0');
            previewItem.setAttribute('aria-label', `Navigiere zu: ${item.label}`);
        }

        // Visual: a preview-chart thumbnail (chartClass) or a named Material Symbols icon.
        if (item.chartClass || item.icon) {
            const visual = document.createElement('div');
            visual.setAttribute('aria-hidden', 'true');
            if (item.chartClass) {
                visual.className = `preview-chart preview-media ${item.chartClass}`;
                // Fills in the SVG for the competence-band thumbnails; a no-op for the rest.
                renderBandThumbnail(visual);
            } else {
                visual.className = 'preview-icon preview-media';
                visual.appendChild(createIcon(item.icon));
            }
            previewItem.appendChild(visual);
        }

        // Create label
        const label = document.createElement(
            this.#resolvePreviewLabelTag(this.getOption('previewLabelTag'), 'h3'),
        );
        label.className = 'preview-label';
        // An icon that sits inside the label (SL's view cards) is a live element, so
        // the label itself stays text. The space is the separator: the label box is an
        // inline flow, not a flex row, so without it the glyph and the first letter touch.
        if (item.labelIcon) {
            label.appendChild(createIcon(item.labelIcon));
            label.append(' ');
        }
        label.append(item.label);

        // Add current view message to the right of label
        if (isCurrentView) {
            label.appendChild(this.#createCurrentViewMarker());
        }

        previewItem.appendChild(label);

        // Always set tooltip from the glossary tooltip
        if (item.tooltipText) {
            previewItem.setAttribute('data-tooltip-text', item.tooltipText);
        }

        if (item.description) {
            const description = document.createElement('div');
            description.className = 'preview-description';
            description.textContent = item.description;
            previewItem.appendChild(description);
        }

        return previewItem;
    }

    /**
     * Normalize configured preview label tags to a safe subset of text elements.
     * @param {string} tagName - Configured tag name
     * @param {string} fallback - Fallback tag
     * @returns {string} The configured tag when it is in the allowed text subset, otherwise the fallback.
     */
    #resolvePreviewLabelTag(tagName, fallback) {
        const normalizedTag = typeof tagName === 'string' ? tagName.trim().toLowerCase() : '';
        return /^(h[1-6]|p|div|span)$/.test(normalizedTag) ? normalizedTag : fallback;
    }

    /**
     * Setup event handlers using event delegation
     */
    #setupEventHandlers() {
        if (!this.contentContainer) return;

        // Click handler
        this.resources.trackDomListener(this.contentContainer, 'click', (event) => {
            const item = targetEl(event)?.closest('.preview-item-clickable');
            if (item) {
                this.#handleNavigation(/** @type {HTMLElement} */ (item));
            }
        });

        // Keyboard handler
        this.resources.trackDomListener(this.contentContainer, 'keydown', (event) => {
            const keyEvent = /** @type {KeyboardEvent} */ (event);
            if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
                const item = targetEl(keyEvent)?.closest('.preview-item-clickable');
                if (item) {
                    keyEvent.preventDefault();
                    this.#handleNavigation(/** @type {HTMLElement} */ (item));
                }
            }
        });
    }

    /**
     * Handle navigation to target view
     * @param {HTMLElement} item - Clicked item element
     */
    #handleNavigation(item) {
        const { viewTarget, viewMode } = item.dataset;

        if (!viewTarget) return;

        this.#navigationCallback?.(viewTarget, viewMode);
    }

    /**
     * The marker beside the current view's entry.
     * @returns {HTMLElement} A span carrying the glossary's current-view text.
     */
    #createCurrentViewMarker() {
        const marker = document.createElement('span');
        marker.className = 'preview-current-view';
        marker.textContent = glossaryAnnotator.getRequiredEntryText(
            'general.messages.current-view',
        );
        return marker;
    }

    /**
     * Update current view indicators without full re-render
     * More efficient than full render when only current view changes
     * @param {string} newCurrentView - New current view identifier
     */
    #updateCurrentViewIndicators(newCurrentView) {
        if (!this.element) return;

        const presetClass =
            {
                card: 'interactive-card',
                subtle: 'interactive-subtle',
            }[this.getOption('interactivePreset')] || 'interactive-card';

        // Remove old disabled state
        const oldDisabled = this.element.querySelectorAll('.preview-item-disabled');
        oldDisabled.forEach((item) => {
            item.classList.remove('preview-item-disabled', 'disabled-soft');
            item.classList.add('preview-item-clickable', presetClass, 'hover-border');
            item.removeAttribute('aria-current');

            // Remove current view message before deriving the accessible label.
            const msgElement = item.querySelector('.preview-current-view');
            if (msgElement) {
                msgElement.remove();
            }

            // Re-enable attributes
            item.setAttribute('role', 'button');
            item.setAttribute('tabindex', '0');
            const label = item.querySelector('.preview-label')?.textContent || '';
            item.setAttribute('aria-label', `Navigiere zu: ${label}`);
        });

        // Add new disabled state
        if (newCurrentView) {
            const newCurrent = this.element.querySelector(`[data-view-target="${newCurrentView}"]`);
            if (newCurrent) {
                newCurrent.classList.remove('preview-item-clickable', presetClass, 'hover-border');
                newCurrent.classList.add('preview-item-disabled', 'disabled-soft');
                newCurrent.setAttribute('aria-current', 'page');

                // Remove interactive attributes
                newCurrent.removeAttribute('role');
                newCurrent.removeAttribute('tabindex');
                newCurrent.removeAttribute('aria-label');

                // Add current view message inside label
                const label = newCurrent.querySelector('.preview-label');
                if (label) {
                    label.appendChild(this.#createCurrentViewMarker());
                }
            }
        }
    }

    /**
     * Update current view
     * @param {string} currentView - New current view identifier
     * @param {boolean} forceRender - Force full re-render instead of lightweight update
     */
    setCurrentView(currentView, forceRender = false) {
        this.#currentView = currentView;

        if (this.initialized) {
            if (forceRender || !this.element) {
                // Full re-render if forced or element doesn't exist
                this.render({ currentView });
            } else {
                // Lightweight update - just toggle classes and messages
                this.#updateCurrentViewIndicators(currentView);
            }
        }
    }
}
