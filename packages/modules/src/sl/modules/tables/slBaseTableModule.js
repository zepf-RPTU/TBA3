/**
 * SlBaseTableModule — shared base for the SL table modules.
 *
 * SL modules create several Tabulator instances per render through repeated
 * `createTable()` calls, and this base is the only place in the codebase that does: it
 * owns that multi-instance lifecycle (destroy, vizMode redraw, row-type formatting)
 * plus the shared data. vizMode state itself lives in the `withTableModeState` mixin.
 */

import { ContentModule } from '@tba3/module-base/modules/contentModule.js';
import { TableModule } from '../../../common/tables/tableModule.js';
import { VIZ_MODES } from '../../slVizModes.js';
import { createElement, createPlaceholder } from '@tba3/module-base/utils/domBuilder.js';
import { moduleRuntime } from '@tba3/module-base/modules/moduleRuntime.js';
import { hasSurveyRows } from '../../utils/slSurveyRows.js';
import './slBaseTableModule.css';

class TableSectionModule extends ContentModule {
    async _doRenderContent() {}
}

/**
 * SlBaseTableModule - Abstract base for SL table modules (data storage + multi-table management)
 * @augments TableModule
 * @abstract
 */
export class SlBaseTableModule extends TableModule {
    /** @type {Map|null} Competency level definitions per subject+domain */ _levelDefinitions =
        null;
    /** @type {Array|null} Pre-computed TQ stats by class+subject */ _teachingQuality = null;
    /** @type {Array|null} */ _selfEfficacyByClass = null;
    /** @type {object | null} */ _selfEfficacySchool = null;
    /** @type {Set<HTMLElement>} */ _sectionExportTargets = new Set();
    /** @type {Set<ContentModule>} */ _sectionModules = new Set();

    // DI-resolved services
    #exportService;

    /**
     * Creates a new SlBaseTableModule instance
     * @param {string} id - Unique identifier for this module
     * @param {string|HTMLElement} container - Container element
     * @param {object} options - Configuration options
     * @param {string} [options.vizMode='stacked_bar'] - Visualization mode
     */
    constructor(id, container, options = {}) {
        super(id, container, options);

        this.#exportService = moduleRuntime().exportService;

        this.setDefaults({
            vizMode: VIZ_MODES.STACKED_BAR,
        });
    }

    // ========================================================================
    // MULTI-TABLE LIFECYCLE
    // ========================================================================

    /**
     * Return all active Tabulator instances managed by this module.
     * Must be overridden by every concrete subclass.
     * @abstract
     * @returns {Array<object>} Array of Tabulator instances (may contain nulls)
     */
    _getActiveTables() {
        throw new Error(`${this.constructor.name} must implement _getActiveTables()`);
    }

    /**
     * a multi-table module is only the last-created table: one column menu on
     * the module header cannot honestly drive five tables (it toggled just the
     * last one, and read its checked-state from a collapsed, responsive-hidden
     * table). So a module managing more than one table offers none; a
     * single-table SL module (SlDomainTableModule) keeps the shared toolbar.
     * @override
     */
    _createHeaderToolbarButtons() {
        if (this._getActiveTables().filter(Boolean).length > 1) return;
        super._createHeaderToolbarButtons();
    }

    /**
     * vizMode-change handler: redraw all fully-built tables.
     *
     * Formatters read `this._state.vizMode` dynamically on each render, so a
     * full redraw is sufficient to apply the new mode. Tables whose
     * `tableBuilt` has not yet fired are skipped — they render correctly when
     * their own `_onTableReady()` triggers.
     *
     * Satisfies `withTableModeState`'s `applyHookName` contract when
     * configured as `'_applyVizModeChange'`.
     * @param {string} _vizMode - New viz mode (unused — formatters read state directly)
     */
    _applyVizModeChange(_vizMode) {
        for (const table of this._getActiveTables()) {
            if (this._isTableBuilt(table)) table.redraw(true);
        }
    }

    /**
     * Destroy all active Tabulator instances and clear the container.
     *
     * Subclasses call this at the start of a re-render, then null out their
     * own private table references and domain data.
     * @protected
     */
    _destroyActiveTables() {
        this.#destroyTables();
        if (this.container) {
            this.contentContainer.innerHTML = '';
        }
    }

    /** Destroy every managed Tabulator instance that is still alive. */
    #destroyTables() {
        for (const table of this._getActiveTables()) {
            if (table && !table.destroyed && typeof table.destroy === 'function') {
                table.destroy();
            }
        }
    }

    /**
     * Create a composable Tabulator `rowFormatter` function that maps
     * `rowData.type` values to CSS classes.
     *
     * The returned formatter:
     * 1. Removes all CSS classes listed in `typeConfig` values
     * 2. Adds the class matching the current row's `type`
     *
     * Designed for composition — callers can wrap the returned function
     * with additional logic (e.g., self-efficacy footer handling).
     * @param {{[rowType: string]: string}} typeConfig - Maps `rowData.type` values to CSS class names
     *   e.g. `{ state: 'state-row', school: 'school-row' }`
     * @returns {function(object): void} Tabulator rowFormatter function
     */
    _createRowTypeFormatter(typeConfig) {
        const allClasses = Object.values(typeConfig);
        return function (row) {
            const data = row.getData();
            const element = row.getElement();

            // Batch class operations — single classList call instead of per-style resets
            element.classList.remove(...allClasses);
            const cssClass = typeConfig[data.type];
            if (cssClass) {
                element.classList.add(cssClass);
            }
        };
    }

    // ========================================================================
    // SHARED HELPERS
    // ========================================================================

    /**
     * Store common render data shared across SL table modules.
     * Call this at the start of _doRender() in subclasses.
     * @protected
     * @param {object} data - The render data object
     * @param {Map} data.levelDefinitions - Competency level definitions per subject+domain
     * @param {Array} [data.teachingQuality] - Pre-computed teaching quality stats by class+subject
     * @param {Array} [data.selfEfficacyByClass] - Self-efficacy data by class
     * @param {object} [data.selfEfficacySchool] - Self-efficacy data for school
     */
    _storeCommonRenderData(data) {
        this._levelDefinitions = data.levelDefinitions || null;
        this._teachingQuality = data.teachingQuality || null;
        this._selfEfficacyByClass = data.selfEfficacyByClass || null;
        this._selfEfficacySchool = data.selfEfficacySchool || null;
    }

    /**
     * Look up pre-computed teaching quality data for a class+subject combination.
     * @protected
     * @param {string} className - Class name (e.g. "8a") or "Schule" for school aggregate
     * @param {string} subjectName - Full subject name (e.g. "Deutsch")
     * @returns {{className: string, subjectName: string, count: number, values: number[], statistics: object} | undefined} The entry, or `undefined` when the dataset carries none for that pair.
     */
    _getTeachingQuality(className, subjectName) {
        return this._teachingQuality?.find(
            (t) => t.className === className && t.subjectName === subjectName,
        );
    }

    /**
     * Whether the loaded dataset supplies Unterrichtsqualität at all.
     *
     * Both are per-student survey scales (`tq_mean` / `sp_mean` in
     * `students_competence-levels.json`) that only the demo fixture ships; a state
     * export has no questionnaire source for them. Asked before the columns are
     * built, because a column added unconditionally formats to `''` in every cell —
     * a permanently blank column that still takes width, which reads as a broken
     * table rather than as an absent measure. This is the "has rows" level of the
     * survey gate (see `getSurveyScales` in slDataService.js for both levels).
     * @protected
     * @returns {boolean} True when Unterrichtsqualität columns should be built at all.
     */
    _hasTeachingQualityData() {
        return this.#surveyRows().hasTeachingQuality;
    }

    /**
     * Whether the loaded dataset supplies Selbstwirksamkeit at all. See
     * `_hasTeachingQualityData`.
     * @protected
     * @returns {boolean} True when Selbstwirksamkeit columns should be built at all.
     */
    _hasSelfEfficacyData() {
        return this.#surveyRows().hasSelfEfficacy;
    }

    /**
     * The "has rows" survey gate over this module's render data — the same question
     * `getSurveyRows` answers on the DataStore for the header's Balken/Boxplot switch,
     * asked through the one shared predicate so the two cannot disagree.
     * @returns {{hasTeachingQuality: boolean, hasSelfEfficacy: boolean}} Which survey measures produced rows for this module's data.
     */
    #surveyRows() {
        return hasSurveyRows({
            teachingQuality: this._teachingQuality,
            selfEfficacyByClass: this._selfEfficacyByClass,
            selfEfficacySchool: this._selfEfficacySchool,
        });
    }

    /**
     * Create a direct table host inside the module content area.
     * Use this when the outer ContentModule shell is already the only card.
     * @protected
     * @param {object} options - Where the host goes and what it is called.
     * @param {HTMLElement} [options.parent] - Element to append to; defaults to this module's content area.
     * @param {string} options.id - Id the table is created against.
     * @param {string} [options.className] - Class on the host.
     * @returns {HTMLElement} The created host.
     */
    _createTableHost({
        parent = this.contentContainer,
        id,
        className = 'table-content',
    } = /** @type {any} */ ({})) {
        const host = createPlaceholder(id, className);
        parent.appendChild(host);
        return host;
    }

    /**
     * Create a nested table card section for multi-table modules.
     * The returned host is the stable wrapper passed to Tabulator creation.
     * @protected
     * @param {object} options - The section's placement, heading and collapse behaviour.
     * @param {HTMLElement} [options.parent] - Element to append to; defaults to this module's content area.
     * @param {string} options.title - Section heading.
     * @param {string} [options.className] - Class on the section.
     * @param {string|null} [options.hostId] - Id for the table host; without one no host is created.
     * @param {string} [options.hostClassName] - Class on the table host.
     * @param {boolean} [options.collapsible] - Give the section a collapse control.
     * @param {boolean} [options.startCollapsed] - Start collapsed.
     * @returns {{section: HTMLElement, headerActions: HTMLElement|null, host: HTMLElement|null}} The section, its header actions area, and the stable host Tabulator is created against.
     */
    _createTableSection({
        parent = this.contentContainer,
        title,
        className = 'table-section',
        hostId = null,
        hostClassName = 'table-content',
        collapsible = false,
        startCollapsed = false,
    } = /** @type {any} */ ({})) {
        const section = createElement('div', { className });
        parent.appendChild(section);

        const sectionModuleId =
            hostId || `${this.id}-table-section-${this._sectionModules.size + 1}`;
        const sectionModule = new TableSectionModule(sectionModuleId, section, {
            showModuleTitle: Boolean(title),
            title,
            collapsible: Boolean(title) && collapsible,
            startCollapsed: Boolean(title) && collapsible && startCollapsed,
        });
        sectionModule.mount();

        this.registerChildModule(sectionModule);
        this._sectionModules.add(sectionModule);

        const host = sectionModule.contentContainer;
        if (hostId) {
            host.id = hostId;
        }
        if (host && hostClassName) {
            host.classList.add(...hostClassName.split(/\s+/).filter(Boolean));
        }

        return {
            section,
            headerActions: sectionModule.headerActionsContainer,
            host,
        };
    }

    /**
     * Destroy nested table card shells created during the current render.
     * @protected
     */
    _destroyTableSections() {
        this.destroyAndUnregisterAll(this._sectionModules);
    }

    /**
     * Mount a section-local export button inside a nested table header.
     * @protected
     * @param {object} options - Where the button goes and what it exports.
     * @param {HTMLElement|null} options.headerActions - The section header's actions area; without one no button is mounted.
     * @param {string} options.id - Export target id.
     * @param {string} options.title - Button title and export label.
     * @param {HTMLElement|null} [options.container] - Element the export captures; defaults to the section's host.
     */
    _createTableSectionExportButton({ headerActions, id, title, container = null }) {
        if (!(headerActions instanceof HTMLElement)) {
            return;
        }

        this.#exportService.createModuleExportButton(
            {
                id,
                title,
                type: 'table',
                container,
            },
            {
                targetContainer: headerActions,
            },
        );

        this._sectionExportTargets.add(headerActions);
    }

    /**
     * Remove all section-local export buttons created during the current render.
     * @protected
     */
    _clearTableSectionExportButtons() {
        this._sectionExportTargets.forEach((headerActions) => {
            this.#exportService.removeModuleExportButton(headerActions);
        });
        this._sectionExportTargets.clear();
    }

    // ========================================================================
    // LIFECYCLE METHODS
    // ========================================================================

    /**
     * base class's last-created table. Without this, a module that created
     * multiple tables via `createTable()` would leak all but the last
     * instance (ResizeObservers, document listeners, row DOM) on destroy.
     * @override
     */
    destroy() {
        this._clearTableSectionExportButtons();
        this.#destroyTables();
        super.destroy();
    }
}
