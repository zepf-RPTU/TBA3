/**
 * Batch export toolbar: the bar under the views that opens the report view and clears
 * the cart. It is the shell's last flex item, so the views give it its room instead of
 * passing under it. It stays down on the report view, which offers both itself.
 */

import { REPORT_VIEW_KEY } from '../views/report/reportViewConfig.js';
import { onChange, renderIcon } from '@tba3/module-base';
import { applyTemplateTokens } from '@tba3/module-base/glossary';
import { confirmClearSelection } from './exportSelectionUI.js';
import { html, render } from 'lit';

import './batchExportToolbar.css';

export class BatchExportToolbar {
    /** @type {import('../app/appContext.js').ExportContext['exportCart']} */
    #exportCart;
    /** @type {import('../app/appContext.js').ExportContext['glossary']} */
    #glossary;
    /** @type {import('@preact/signals-core').ReadonlySignal<string|null>} The view on screen. */
    #currentView;
    /** @type {() => void} Opens the report view. */
    #openReport;
    /** @type {HTMLElement} */
    #element;
    /** @type {() => void} Stops following the cart and the view. */
    #stopFollowing;

    /**
     * Build the toolbar at the end of the app's shell; it follows the cart and the view
     * on screen until disposed.
     * @param {object} options
     * @param {HTMLElement} options.host - The app's shell, whose flex column the toolbar ends.
     * @param {Pick<import('../app/appContext.js').ExportContext, 'exportCart' | 'glossary'>} options.context - The app whose cart the toolbar shows, and whose glossary names its buttons.
     * @param {import('@preact/signals-core').ReadonlySignal<string|null>} options.currentView - The view on screen: the toolbar stays down on the report view.
     * @param {() => void} options.onOpenReport - What the app does when the report is asked for: it opens the report view.
     */
    constructor({ host, context, currentView, onOpenReport }) {
        this.#exportCart = context.exportCart;
        this.#glossary = context.glossary;
        this.#currentView = currentView;
        this.#openReport = onOpenReport;
        this.#element = this.#createElement(host);
        this.#render();
        this.#stopFollowing = onChange(
            () => [this.#exportCart.selection.value.length, currentView.value],
            () => this.#render(),
        );
    }

    /** Remove the toolbar from the page and stop following the cart. */
    dispose() {
        this.#stopFollowing();
        this.#element.remove();
    }

    /**
     * @param {string} path - Glossary dot path.
     * @returns {string}
     */
    #text(path) {
        return this.#glossary.getRequiredEntryText(path);
    }

    /**
     * Creates the toolbar region at the end of the shell; #render() fills it.
     * @param {HTMLElement} host - The app's shell.
     * @returns {HTMLElement}
     */
    #createElement(host) {
        const toolbar = document.createElement('div');
        toolbar.hidden = true;
        toolbar.className = 'batch-export-toolbar';
        toolbar.setAttribute('role', 'region');
        toolbar.setAttribute(
            'aria-label',
            this.#text('general.buttons.element_texts.batch-export.label'),
        );
        host.appendChild(toolbar);
        return toolbar;
    }

    /**
     * Show the toolbar while the cart holds anything and the report view is not on
     * screen, with the count and the two buttons. It shows and hides in one step: every
     * chart above follows its box, so a sliding bar would redraw them frame by frame.
     */
    #render() {
        const toolbar = this.#element;
        const count = this.#exportCart.selection.peek().length;
        const shown = count > 0 && this.#currentView.peek() !== REPORT_VIEW_KEY;
        // The shell's last item, also when the app appended more after the mount:
        // otherwise it sits between the views and those.
        if (shown && toolbar.nextElementSibling) toolbar.parentElement?.append(toolbar);
        toolbar.hidden = !shown;
        const countText =
            count === 1
                ? this.#text('general.messages.selection-count-one')
                : applyTemplateTokens(this.#text('general.messages.selection-count-many'), {
                      count: String(count),
                  });
        const BUTTONS = 'general.buttons.element_texts';
        const openLabel = this.#text(`${BUTTONS}.report-open.label`);
        const clearLabel = this.#text(`${BUTTONS}.report-clear.label`);
        render(
            html`
                <div class="toolbar-content">
                    <div class="selection-info">
                        ${renderIcon('library_add_check')}
                        <span class="selection-count" role="status">${countText}</span>
                    </div>

                    <div class="btn-group btn-group--wrap toolbar-actions">
                        <button
                            class="btn btn--text btn--primary btn--size-control"
                            @click=${() => this.#openReport()}
                        >
                            ${renderIcon('article')} ${openLabel}
                        </button>
                        <button class="btn btn--text btn--size-control" @click=${this.#onClear}>
                            ${renderIcon('clear_all')} ${clearLabel}
                        </button>
                    </div>
                </div>
            `,
            toolbar,
        );
    }

    /** Clear the cart, once confirmed. */
    #onClear = () => {
        void confirmClearSelection(this.#exportCart, this.#glossary);
    };
}
