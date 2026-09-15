/**
 * SlDetailOverlayModule — the full-screen overlay behind an SL Überblick card.
 *
 * Mounted on `document.body` and deliberately *not* registered as a child of the view
 * that opens it: as a child it would be torn down with the view mid-animation.
 * Layout is by-subject [chart | Kasten], or by-class [Selbstwirksamkeit | chart | Kasten].
 */

import {
    BaseModule,
    createElement,
    iconSvg,
    MISSING_GLOSSARY_TITLE,
    openModalDialog,
    waitForStableElementBox,
} from '@tba3/module-base';
import { ChartHostModule } from '@tba3/modules/charts';
import { competencyDetailSectionConfig } from '@tba3/modules/charts/competency-detail';
import { selfEfficacyConfig } from '@tba3/modules/charts/self-efficacy';
import { glossaryAnnotator } from '@tba3/modules/glossary';
import {
    buildSelfEfficacyInfoBoxSummary,
    buildSelfEfficacyInfoBoxSummaryNamespace,
    InfoBoxModule,
} from '@tba3/modules/info-box';
import { VIZ_MODES } from '@tba3/modules/sl-domain';
import { slDataFromStore } from '../../slDataPort.js';
import { sanitizeFileStem } from '../../../common/export/exportFiles.js';
import './slDetailOverlayModule.css';

/**
 * Substitute `{{token}}` placeholders in a glossary string.
 * @param {any} text - The template; a non-string yields an empty string.
 * @param {object} [replacements] - Token → value.
 * @returns {string} The filled text.
 */
function applyTemplateTokens(text, replacements = {}) {
    if (typeof text !== 'string' || !text) return text ?? '';
    if (!replacements || typeof replacements !== 'object') return text;

    return text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, token) => {
        const replacement = replacements[token];
        return replacement == null ? '' : String(replacement);
    });
}

/**
 * A chart panel's host as its config leaves it. The overlay's middle slot carries either
 * descriptor depending on what was clicked, and both bind `setVizMode` — the only verb
 * the overlay calls on one.
 * @typedef {import('@tba3/modules/sl/modules/charts/competency/detail/competencyDetailSectionConfig.js').CompetencyDetailSectionHost|import('@tba3/modules/sl/modules/charts/selfEfficacy/selfEfficacyConfig.js').SelfEfficacyHost} DetailChartHost
 */

export class SlDetailOverlayModule extends BaseModule {
    /** @type {HTMLElement|null} */
    #overlayEl = null;
    /** @type {(() => void) | null} Lifts the modal state opened by show(); null while closed. */
    #closeModal = null;
    /** @type {import('@tba3/modules/sl/modules/charts/selfEfficacy/selfEfficacyConfig.js').SelfEfficacyHost|null} */
    #selfEfficacyModule = null;
    /** @type {DetailChartHost|null} */
    #chartModule = null;
    /** @type {InfoBoxModule|null} */
    #kastenModule = null;

    constructor(id, options = {}) {
        super(id, document.body, options);
    }

    /**
     * Show the detail overlay with chart data.
     * @param {object} [params] - What the overlay shows and which layout it uses.
     * @param {string} [params.detailKey] - Identity of the opening card, folded
     *   into the panel ids so each card gets its own export target (see
     *   `#panelId`). Callers pass a data-derived key, never display text.
     * @param {string} [params.title] - Title of the detail (subject or class name)
     * @param {Array} [params.chartGroups] - Chart group definitions
     * @param {Array} [params.selfEfficacyByClass] - Per-class Selbstwirksamkeit rows.
     * @param {object} [params.selfEfficacySchool] - The school's Selbstwirksamkeit aggregate.
     * @param {Array} [params.teachingQuality] - Unterrichtsqualität rows.
     * @param {boolean} [params.isSelfEfficacy] - Show the Selbstwirksamkeit-only layout.
     * @param {boolean} [params.isByClass=false] - Show 3-panel layout: SP | chart | kasten
     */
    async show(params) {
        const overlayData = {
            ...params,
            vizMode: this.#resolveVizMode(params),
        };
        this.setData(overlayData);
        this.#destroyContent();
        if (!this.#overlayEl) this.#buildDOM();
        const overlayEl = this.#overlayEl;
        if (!overlayEl) return;

        // Show overlay first so layout dimensions are computable
        overlayEl.classList.add('visible');
        document.body.style.overflow = 'hidden';
        this.#closeModal ??= openModalDialog(overlayEl, {
            label: glossaryAnnotator.getRequiredEntryText('general.dialogs.detail.label'),
        });

        if (overlayData.isSelfEfficacy) {
            await this.#buildSelfEfficacyLayout(overlayData);
        } else if (overlayData.isByClass) {
            await this.#buildByClassLayout(overlayData);
        } else {
            await this.#buildBySubjectLayout(overlayData);
        }
    }

    /**
     * Switch the visualisation of the open panels, and of the next show().
     * Called by the owning view from its app-state observer.
     * @param {string} mode - 'stacked_bar' | 'boxplot'
     */
    setVizMode(mode) {
        if (!mode) return;

        this.setData({ ...(this.getData() || {}), vizMode: mode });

        this.#selfEfficacyModule?.setVizMode(mode);
        this.#chartModule?.setVizMode(mode);
    }

    /**
     * By-subject layout: [chart (flex:3)] [kasten (flex:1)]
     * Single ChartHostModule directly inside sl-detail-overlay-content.
     * @param {object} params - The show() params this layout renders.
     */
    async #buildBySubjectLayout(params) {
        const content = /** @type {HTMLElement|null} */ (
            this.#overlayEl?.querySelector('.sl-detail-overlay-content')
        );
        if (!content) return;
        const vizMode = this.#resolveVizMode(params);
        const group = params.chartGroups?.[0];
        const { chart: chartDiv, kasten: kastenContainer } = this.#buildPanelLayout(
            content,
            group
                ? [
                      {
                          key: 'chart',
                          id: this.#panelId(params, 'chart'),
                          className: 'overlay-panel--main',
                      },
                  ]
                : [],
        );

        await this.#renderKasten(kastenContainer);
        await this.#waitForStableOverlayLayout(content);

        const chartHeight = Math.max(content.clientHeight - 40, 400);

        if (group && chartDiv) {
            const glossaryReplacements = { Fach: group.title };
            const chartTitle =
                this.#resolveChartTitle('sl.overview.subject-view.chart', glossaryReplacements) ||
                group.title;

            const detailHost = new ChartHostModule(
                chartDiv.id,
                chartDiv,
                competencyDetailSectionConfig,
                {
                    ...this._childOptions(),
                    glossaryKey: 'sl.overview.subject-view.chart',
                    glossaryReplacements,
                    className: group.className,
                    showOnlySchoolData: group.showOnlySchoolData,
                    qualityVizMode: vizMode,
                    showModuleTitle: true,
                    title: chartTitle,
                    chartHeight,
                    ...(group.description
                        ? { showSubtitle: true, subtitle: group.description }
                        : {}),
                },
            );
            // The constructor returns the bare host; the config binds `setVizMode` onto it
            // at init, which `setVizMode()` calls. Naming the config's host type at the
            // assignment is what lets `tsc` check that call.
            this.#chartModule = /** @type {DetailChartHost} */ (detailHost);
            await this.#chartModule.init({
                ...group,
                teachingQuality: params.teachingQuality || [],
            });
        }
    }

    /**
     * Self-efficacy-only layout: [chart (flex:3)] [kasten (flex:1)]
     * ChartHostModule is a direct child of sl-detail-overlay-content.
     * @param {object} params - The show() params this layout renders.
     */
    async #buildSelfEfficacyLayout(params) {
        const content = /** @type {HTMLElement|null} */ (
            this.#overlayEl?.querySelector('.sl-detail-overlay-content')
        );
        if (!content) return;
        const vizMode = this.#resolveVizMode(params);

        const allSelfEfficacyData = [
            ...(params.selfEfficacyByClass || []),
            ...(params.selfEfficacySchool ? [params.selfEfficacySchool] : []),
        ];

        const { selfEfficacy: selfEfficacyDiv, kasten: kastenContainer } = this.#buildPanelLayout(
            content,
            [
                {
                    key: 'selfEfficacy',
                    id: this.#panelId(params, 'sp-overview'),
                    className: 'overlay-panel--main',
                },
            ],
        );

        await this.#renderKasten(kastenContainer);
        await this.#waitForStableOverlayLayout(content);

        const chartHeight = Math.max(content.clientHeight - 40, 400);

        const selfEfficacyHost = new ChartHostModule(
            selfEfficacyDiv.id,
            selfEfficacyDiv,
            selfEfficacyConfig,
            {
                ...this._childOptions(),
                defaultVizMode: vizMode,
                chartHeight,
                showModuleTitle: true,
                title: this.#resolveOverviewPreviewTitle('preview-sw') || MISSING_GLOSSARY_TITLE,
            },
        );
        this.#chartModule = /** @type {DetailChartHost} */ (selfEfficacyHost);
        await this.#chartModule.init(allSelfEfficacyData);
    }

    /**
     * By-class layout: [SP (flex:1)] [comp chart (flex:2)] [kasten (flex:1)]
     * All panels are direct children of sl-detail-overlay-content.
     * @param {object} params - The show() params this layout renders.
     */
    async #buildByClassLayout(params) {
        const content = /** @type {HTMLElement|null} */ (
            this.#overlayEl?.querySelector('.sl-detail-overlay-content')
        );
        if (!content) return;
        const group = params.chartGroups?.[0];
        const vizMode = this.#resolveVizMode(params);
        const teachingQuality = params.teachingQuality || [];

        const selfEfficacyData = group?.isSchoolOverview
            ? params.selfEfficacySchool || null
            : (params.selfEfficacyByClass || []).find((x) => x.className === group?.className) ||
              null;

        const {
            selfEfficacy: selfEfficacyDiv,
            chart: chartDiv,
            kasten: kastenContainer,
        } = this.#buildPanelLayout(
            content,
            [
                selfEfficacyData
                    ? {
                          key: 'selfEfficacy',
                          id: this.#panelId(params, 'sp'),
                          className: 'overlay-panel--sp',
                      }
                    : null,
                group
                    ? {
                          key: 'chart',
                          id: this.#panelId(params, 'chart'),
                          className: 'overlay-panel--chart',
                      }
                    : null,
            ].filter(Boolean),
        );

        await this.#renderKasten(kastenContainer);
        await this.#waitForStableOverlayLayout(content);

        const chartHeight = Math.max(content.clientHeight - 40, 400);

        // Left: self-efficacy
        if (selfEfficacyData && selfEfficacyDiv) {
            const selfEfficacyHost = new ChartHostModule(
                selfEfficacyDiv.id,
                selfEfficacyDiv,
                selfEfficacyConfig,
                {
                    ...this._childOptions(),
                    defaultVizMode: vizMode,
                    chartHeight,
                    isVertical: true,
                    showModuleTitle: true,
                    title:
                        this.#resolveOverviewPreviewTitle('preview-sw') || MISSING_GLOSSARY_TITLE,
                },
            );
            this.#selfEfficacyModule =
                /** @type {import('@tba3/modules/sl/modules/charts/selfEfficacy/selfEfficacyConfig.js').SelfEfficacyHost} */ (
                    selfEfficacyHost
                );
            await this.#selfEfficacyModule.init(selfEfficacyData);
        }

        // Middle: competency chart
        if (group && chartDiv) {
            const glossaryReplacements = group.isSchoolOverview
                ? null
                : { Klasse: group.className || group.domainLabel };
            const chartTitle = group.isSchoolOverview
                ? group.title
                : this.#resolveChartTitle('sl.overview.class-view.chart', glossaryReplacements) ||
                  group.title;

            const detailHost = new ChartHostModule(
                chartDiv.id,
                chartDiv,
                competencyDetailSectionConfig,
                {
                    ...this._childOptions(),
                    glossaryKey: group.isSchoolOverview ? null : 'sl.overview.class-view.chart',
                    ...(glossaryReplacements ? { glossaryReplacements } : {}),
                    className: group.className,
                    showOnlySchoolData: group.showOnlySchoolData,
                    qualityVizMode: vizMode,
                    showModuleTitle: true,
                    title: chartTitle,
                    chartHeight,
                    ...(group.description
                        ? { showSubtitle: true, subtitle: group.description }
                        : {}),
                },
            );
            this.#chartModule = /** @type {DetailChartHost} */ (detailHost);
            await this.#chartModule.init({ ...group, teachingQuality });
        }
    }

    /**
     * Render the Kasten placeholder into a container.
     * @param {HTMLElement} container - The panel the Kasten is mounted in.
     */
    async #renderKasten(container) {
        if (this.#kastenModule) return;

        const content = this.#overlayEl?.querySelector('.sl-detail-overlay-content');
        container = content ? this.#ensureKastenContainer(content) : container;
        if (!container) {
            return;
        }

        const kastenId = this.#panelId(this.getData(), 'kasten');
        container.id = kastenId;

        if (this.getData()?.isSelfEfficacy) {
            const selfEfficacySummary = buildSelfEfficacyInfoBoxSummary({
                selfEfficacyByClass: this.getData()?.selfEfficacyByClass,
                selfEfficacySchool: this.getData()?.selfEfficacySchool,
            });

            this.#kastenModule = new InfoBoxModule(kastenId, container, {
                glossaryKey: 'sl.results',
                ...this._childOptions(),
                slData: slDataFromStore(this.getOption('dataStore')),
                boxKey: 'overviewSelfEfficacy',
                placeholderContext: {
                    summaries: {
                        selfEfficacy: buildSelfEfficacyInfoBoxSummaryNamespace(selfEfficacySummary),
                    },
                },
                onLinkActivated: () => this.hide(),
            });
            await this.#kastenModule.init();
            return;
        }

        const selectedClassName = this.getData()?.className ?? null;
        const boxKey = this.getData()?.isByClass
            ? selectedClassName
                ? 'overviewClassSpecific'
                : 'overviewSchoolSpecific'
            : 'overviewSubjectSpecific';

        this.#kastenModule = new InfoBoxModule(kastenId, container, {
            glossaryKey: 'sl.results',
            ...this._childOptions(),
            slData: slDataFromStore(this.getOption('dataStore')),
            boxKey,
            placeholderContext: {
                // The payload's subject, not the card title: the title is glossary copy and
                // need not spell the subject the material pages are keyed by.
                subjectName: this.getData()?.isByClass
                    ? null
                    : (this.getData()?.chartGroups?.[0]?.subjectName ?? null),
                className: selectedClassName,
            },
            onLinkActivated: () => this.hide(),
        });
        await this.#kastenModule.init();
    }

    /** Hide the overlay and destroy chart content. */
    hide() {
        if (this.#overlayEl) {
            this.#overlayEl.classList.remove('visible');
        }
        this.#closeModal?.();
        this.#closeModal = null;
        document.body.style.overflow = '';
        this.#destroyContent();
    }

    /** @override */
    destroy() {
        this.hide();
        if (this.#kastenModule) {
            this.#kastenModule.destroy();
            this.#kastenModule = null;
        }
        if (this.#overlayEl) {
            this.#overlayEl.remove();
            this.#overlayEl = null;
        }
        super.destroy();
    }

    // ── Private ─────────────────────────────────────────────────────────────

    /**
     * Id for one overlay panel, scoped to the card that opened the overlay.
     *
     * All overview cards reuse this one overlay instance, and the panel id
     * becomes the child module's id and therefore its export target id
     * (`module-<module id>`). Scoping by `detailKey` is what lets two cards be
     * ticked for the batch export independently — with a shared id the second
     * tick would inherit the first card's selection and overwrite its capture.
     *
     * The key carries subject and class names straight from the payload, and the
     * id it lands in is interpolated into CSS selectors (`competencyDetailLegend`
     * does `d3.select('#<id> svg')`). A name with a `.`, `/` or `(` in it would
     * make that selector a SyntaxError, so the key goes through the same
     * sanitiser the export ids use. `detail` is the fallback for a caller that
     * supplied no key: the overlay still works, it just shares one identity again.
     * @param {object | null} params - The params of the current show() call
     * @param {string} panel - Panel suffix ('chart', 'sp', 'sp-overview', 'kasten')
     * @returns {string} A DOM id unique to this overlay, card and panel.
     */
    #panelId(params, panel) {
        const key = sanitizeFileStem(params?.detailKey ?? 'detail');
        return `${this.id}-${key}-${panel}`;
    }

    #buildPanelLayout(content, panels) {
        [...content.children].forEach((el) => el.remove());

        const createdPanels = panels.reduce((created, panel) => {
            const element = createElement('div', {
                id: panel.id,
                className: panel.className,
            });
            content.appendChild(element);
            created[panel.key] = element;
            return created;
        }, {});

        createdPanels.kasten = createElement('div', {
            className: 'sl-detail-overlay-kasten',
        });
        content.appendChild(createdPanels.kasten);

        return createdPanels;
    }

    #ensureKastenContainer(content) {
        let kastenContainer = content.querySelector('.sl-detail-overlay-kasten');
        if (kastenContainer) {
            return kastenContainer;
        }

        kastenContainer = document.createElement('div');
        kastenContainer.className = 'sl-detail-overlay-kasten';
        content.appendChild(kastenContainer);
        return kastenContainer;
    }

    async #waitForStableOverlayLayout(content) {
        await waitForStableElementBox(content, {
            stableFrames: 2,
            maxFrames: 18,
            tolerance: 0.5,
            waitForFonts: true,
            fontTimeoutMs: 250,
        });
    }

    #buildDOM() {
        const overlay = document.createElement('div');
        overlay.className = 'modal-backdrop sl-detail-overlay';
        overlay.innerHTML = `
            <button class="btn btn--icon btn--size-toolbar-xs" data-detail-overlay-action="close" aria-label="${glossaryAnnotator.getRequiredEntryText('general.buttons.element_texts.close.label')}">
                ${iconSvg('close')}
            </button>
            <div class="sl-detail-overlay-content">
                <div class="sl-detail-overlay-kasten"></div>
            </div>
        `;
        document.body.appendChild(overlay);
        this.#overlayEl = overlay;

        // Click on the backdrop (overlay itself) closes; clicks inside content don't bubble up
        this.resources.trackDomListener(overlay, 'click', () => this.hide());
        this.resources.trackDomListener(
            /** @type {HTMLElement} */ (overlay.querySelector('.sl-detail-overlay-content')),
            'click',
            (e) => e.stopPropagation(),
        );
        this.resources.trackDomListener(
            /** @type {HTMLElement} */ (
                overlay.querySelector('[data-detail-overlay-action="close"]')
            ),
            'click',
            (e) => {
                e.stopPropagation();
                this.hide();
            },
        );

        this.resources.trackDomListener(document, 'keydown', (e) => {
            if (
                /** @type {KeyboardEvent} */ (e).key === 'Escape' &&
                this.#overlayEl?.classList.contains('visible')
            ) {
                this.hide();
            }
        });
    }

    #resolveVizMode(params = this.getData()) {
        return params?.vizMode ?? VIZ_MODES.STACKED_BAR;
    }

    /**
     * The chart title for one panel, read from the glossary and token-filled.
     * @param {string} glossaryPath - Dotted path to the entry.
     * @param {object | null} [replacements] - Tokens to substitute into it.
     * @returns {string|null} The title, or `null` when the glossary path resolves to nothing.
     */
    #resolveChartTitle(glossaryPath, replacements = {}) {
        const parts = glossaryPath.split('.');
        let entry = this.getOption('glossaryData');

        for (const part of parts) {
            if (entry && typeof entry === 'object' && Object.hasOwn(entry, part)) {
                entry = entry[part];
            } else {
                return null;
            }
        }

        return applyTemplateTokens(entry?.title ?? '', replacements) || null;
    }

    #resolveOverviewPreviewTitle(previewKey) {
        const entry =
            this.getOption('glossaryData')?.sl?.overview?.['subject-view']?.['preview-cards']
                ?.element_texts?.[previewKey];
        return entry?.title || null;
    }

    #destroyContent() {
        if (this.#selfEfficacyModule) {
            this.#selfEfficacyModule.destroy();
            this.#selfEfficacyModule = null;
        }
        if (this.#chartModule) {
            this.#chartModule.destroy();
            this.#chartModule = null;
        }
        if (this.#kastenModule) {
            this.#kastenModule.destroy();
            this.#kastenModule = null;
        }
    }
}
