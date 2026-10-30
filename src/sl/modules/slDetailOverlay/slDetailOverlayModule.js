/**
 * SlDetailOverlayModule — the full-screen modal dialog behind an SL Details card: a
 * ModalDialog on `document.body` with this module as its panel. The card names what it
 * shows; the overlay places it.
 */

import { BaseModule } from '@tba3/module-base';
import { ChartHostModule } from '@tba3/modules/charts';
import { InfoBoxModule } from '@tba3/modules/info-box';
import { ModalDialog } from '@tba3/modules/overlays';
import { sanitizeFileStem } from '../../../common/export/exportFiles.js';
import './slDetailOverlayModule.css';

/**
 * A chart panel's host: either descriptor's.
 * @typedef {import('@tba3/modules/charts/competence-detail').CompetenceDetailSectionHost|import('@tba3/modules/charts/self-efficacy').SelfEfficacyHost} DetailChartHost
 */

/**
 * The options either detail chart takes; each reads its own subset.
 * @typedef {import('@tba3/modules/charts/competence-detail').CompetenceDetailSectionOptions & import('@tba3/modules/charts/self-efficacy').SelfEfficacyOptions} DetailChartOptions
 */

/**
 * One chart: its descriptor, and the options that select and title it.
 * @typedef {object} DetailChart
 * @property {import('@tba3/modules/charts').ChartHostConfig<any, DetailChartOptions, null, any, any>} config
 * @property {Partial<DetailChartOptions>} options
 */

/**
 * One chart panel of the overlay; `overlay-panel--sp` marks the Selbstwirksamkeit strip.
 * @typedef {DetailChart & {suffix: string, className?: string}} DetailPanel
 */

/**
 * What the overlay shows for one card.
 * @typedef {object} CardDetail
 * @property {string} title - The dialog's title.
 * @property {string} key - Identity of the card: a data-derived key, never display text.
 * @property {DetailPanel[]} panels - The chart panels, top to bottom.
 * @property {{boxKey: string, placeholderContext: import('@tba3/modules/info-box').PlaceholderInput}} kasten - The info box beside them.
 */

/**
 * @typedef {import('@tba3/module-base').BaseOptions & {
 *   context: import('../../../common/app/appContext.js').AppContext,
 *   vizMode: import('@preact/signals-core').ReadonlySignal<string>,
 *   onOpenMaterial?: (selection: {subject: string, type: string}) => Promise<void>,
 * }} SlDetailOverlayOptions
 */

/** @augments {BaseModule<SlDetailOverlayOptions>} */
export class SlDetailOverlayModule extends BaseModule {
    /** @type {ModalDialog|null} */
    #dialog = null;

    /**
     * The `<dialog>`, built on the first open with the close button and this panel in it.
     * @returns {ModalDialog}
     */
    get #modal() {
        if (!this.#dialog) {
            this.#dialog = new ModalDialog({
                glossary: this.options.context.glossary,
                onClose: () => this.replaceChildren(),
            });
            // Its charts share the row with the Kasten, so their legends go dense.
            this.className = 'sl-detail-overlay-content modal-panel chart-legend-dense';
            // Beside the card, pinned to the dialog's corner.
            this.#dialog.element.append(this.#dialog.closeButton, this);
        }
        return this.#dialog;
    }

    /**
     * Open the overlay on one card's detail, replacing whatever it showed before.
     * @param {CardDetail} detail
     * @returns {Promise<void>} Resolves once every panel has drawn.
     */
    async open(detail) {
        // Shown first so the panels have a box to size off.
        this.#modal.show(detail.title);
        // The Selbstwirksamkeit strip's height follows the viz mode, which the modal keeps
        // fixed while it is open.
        this.dataset.vizMode = this.options.vizMode.value;
        const hosts = detail.panels.map((panel) => {
            const host = /** @type {DetailChartHost} */ (
                ChartHostModule.createChart(this.#panelId(detail, panel.suffix), panel.config, {
                    ...this._childOptions(),
                    vizMode: this.options.vizMode,
                    showModuleTitle: true,
                    ...panel.options,
                })
            );
            host.className = panel.className ?? '';
            return host;
        });
        const kasten = this.#createKasten(this.#panelId(detail, 'kasten'));
        kasten.data = detail.kasten;

        // The chart panels stack in one column beside the Kasten. Every panel sizes off
        // its own box, so none waits for another.
        const charts = document.createElement('div');
        charts.className = 'sl-detail-overlay-charts';
        charts.append(...hosts);
        this.replaceChildren(charts, kasten);
        await this.updateComplete;
    }

    /** Close the overlay; closing tears the panels down. */
    #close() {
        this.#dialog?.close();
    }

    /** @override */
    _teardown() {
        this.#dialog?.destroy();
        super._teardown();
    }

    /**
     * The Kasten's InfoBox; a material link in it closes the overlay.
     * @param {string} id
     * @returns {InfoBoxModule} The Kasten, not yet placed.
     */
    #createKasten(id) {
        const openMaterial = this.options.onOpenMaterial;
        const kasten = InfoBoxModule.create(id, {
            glossaryKey: 'sl.results',
            ...this._childOptions(),
            onOpenMaterial: openMaterial
                ? async (selection) => {
                      await openMaterial(selection);
                      this.#close();
                  }
                : null,
        });
        kasten.className = 'sl-detail-overlay-kasten';
        return kasten;
    }

    /**
     * Id for one overlay panel, scoped to the opening card: the panel id is the child's
     * export target, so the card key lets two cards be ticked for the batch export
     * independently. The key carries payload subject and group names, so it goes through
     * the sanitiser the export ids use.
     * @param {CardDetail} detail
     * @param {string} panelSuffix - E.g. 'chart', 'sp', 'kasten'.
     * @returns {string} A DOM id unique to this overlay, card and panel.
     */
    #panelId(detail, panelSuffix) {
        return `${this.id}-${sanitizeFileStem(detail.key)}-${panelSuffix}`;
    }
}

customElements.define('tba-sl-detail-overlay', SlDetailOverlayModule);
