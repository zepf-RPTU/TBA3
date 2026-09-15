/**
 * EnStudentDataTableModule (EN) - Displays task-by-task results for a single student
 * Includes domain-prefixed numbering, style columns, mode switching, and item detail selection.
 *
 * Follows the Domäne mode through setState({ mode }) (withDomainMode), pushed by the
 * owning view. A row click hands the item to `onItemSelected` (the detail panel).
 */

import {
    BaseStudentDataTableModule,
    isItemBelowReportedLevel,
    isItemAboveReportedLevel,
} from '../../../common/tables/baseStudentDataTableModule.js';
import { withDomainMode } from './enWithDomainMode.js';
import { EN_TERMS } from '../../enTerms.js';
import { createListFilter } from '../../../common/tables/tableDataUtils.js';
import { createGerLevelHtml, compareLevelLabels } from '../../../common/domain/levels.js';
import { Preset } from '../../../common/tables/preset.js';
import { glossaryAnnotator } from '../../../common/glossary/glossaryAnnotator.js';
import { sortStylesByPriority, createStylesColumn } from './enStyleTableUtils.js';
import { createItemNumberColumn } from './enTableColumns.js';
import { COLUMN_GROW_RATIOS } from '../../../common/tables/columnWidthConstants.js';
import { createColumnDef } from '../../../common/tables/columnFactories.js';
import { RESULT_CORRECT, RESULT_VALUES } from '../../../common/domain/apiValueMaps.js';
import { iconSvg } from '@tba3/module-base/utils/icons.js';

/**
 * EnStudentDataTableModule - EN-specific student data table with dual-domain support
 * @augments BaseStudentDataTableModule
 */
export class EnStudentDataTableModule extends withDomainMode(BaseStudentDataTableModule) {
    /** @type {any[]|null} */
    #itemArray = null;
    /** @type {Map<any, any>|null} */
    #itemsByIqbId = null;
    /** @type {any[]|null} */
    #indexedItemArray = null;
    /** @type {any[]|null} */
    #domains = null;
    #domainGroups = {};
    /** @type {any[]|null} */
    #allStudentData = null;
    /** @type {any[]|null} */
    #studentArray = null;
    #achievedByDomain = {};

    /**
     * Creates a new EnStudentDataTableModule instance
     * @param {string} id - Unique identifier for this module
     * @param {string|HTMLElement} container - Container element for the data table
     * @param {{[key: string]: any}} [options={}] - Configuration options
     */
    constructor(id, container, options = {}) {
        super(id, container, options);

        if (typeof options.onItemSelected === 'function') {
            this.registerCallback('itemSelected', options.onItemSelected);
        }
    }

    // ========================================================================
    // BASE CLASS HOOKS
    // ========================================================================

    /** @override */
    _onBeforeRender(data) {
        this.#itemArray = data.itemArray;
        if (data.studentArray) {
            this.#studentArray = data.studentArray;
        }

        // Extend base setData to include itemArray for getData() consumers
        this.setData({
            ...this.getData(),
            itemArray: data.itemArray,
        });

        // Mode is initialized structurally by the withTableModeState mixin
        // (constructor reads the domainMode option, _onTableReady applies it).

        // Derive domains from item array in first-seen order
        const domains = [];
        this.#domains = domains;
        const seen = new Set();
        for (const item of data.itemArray) {
            if (!item.domain || seen.has(item.domain)) continue;
            seen.add(item.domain);
            domains.push({
                domain: item.domain,
                domainLabel: item.domainLabel,
            });
            if (domains.length === 2) break;
        }
    }

    /** @override */
    async _renderForStudent(schuelerId) {
        if (!this.#domains || this.#domains.length === 0) {
            return;
        }

        await this.#prepareStudentData(schuelerId);
        await this.#renderTableForMode(this._state.mode);
    }

    /**
     * Prepare student data - filter and enrich with style information
     * @param {string} schuelerId - Student ID
     */
    async #prepareStudentData(schuelerId) {
        this.#buildAchievedByDomain(schuelerId);

        const relatedData = this._prepareStudentRows(schuelerId, [
            'domain',
            'domainLabel',
            'exercise',
            'name',
            'ergebnis',
            'iqbId',
            'competenceLevel',
        ]);

        if (relatedData.length === 0) {
            this.#allStudentData = [];
            this.#domainGroups = {};
            return;
        }

        // Merge style information from itemArray if available
        this.#allStudentData = relatedData.map((item) => {
            const itemInfo = this.#getItemByIqbId(item.iqbId);

            const styles = itemInfo ? itemInfo.style || [] : [];
            const sortedStyles = sortStylesByPriority(
                [...styles],
                this.getOption('enConfig').styleCategories,
            );

            return {
                ...item,
                combinedStyles: sortedStyles,
                primaryStyle: sortedStyles.length > 0 ? sortedStyles[0] : '',
            };
        });

        // Group data by domain
        this.#groupDataByDomain();
    }

    #getItemByIqbId(iqbId) {
        const itemArray = this.#itemArray;
        if (!Array.isArray(itemArray) || itemArray.length === 0) {
            return null;
        }

        if (this.#indexedItemArray !== itemArray) {
            const itemsByIqbId = new Map();

            for (const item of itemArray) {
                if (item?.iqbId === undefined || item.iqbId === null) continue;
                itemsByIqbId.set(item.iqbId, item);
            }

            this.#itemsByIqbId = itemsByIqbId;
            this.#indexedItemArray = itemArray;
        }

        return this.#itemsByIqbId?.get(iqbId) || null;
    }

    /**
     * Build a {domainId: achievedGerBand} map for the current student from the
     * aggregated student record. Used by the level presets to compare each item's
     * Aufgabenniveau against the band the student achieved in that domain.
     * @param {string} schuelerId - Student ID
     */
    #buildAchievedByDomain(schuelerId) {
        this.#achievedByDomain = {};
        const studentArray = this.#studentArray;
        const domains = this.#domains;
        if (!Array.isArray(studentArray) || !domains) return;

        const studentRecord = studentArray.find((s) => s.studentId === schuelerId);
        if (!studentRecord) return;

        for (const { domain } of domains) {
            const field = this.getOption('enConfig').fieldName(domain, 'CompLevel');
            this.#achievedByDomain[domain] = field ? studentRecord[field] : undefined;
        }
    }

    /**
     * Level presets for the student data table. Predicates compare each row's
     * Aufgabenniveau against the level reached in that row's domain, so they
     * stay correct across 'all' and single-domain modes.
     * @protected
     * @returns {Array<Preset>} One preset per Kompetenzstufe, plus the presets the base class contributes.
     */
    _getPresets() {
        const achievedByDomain = this.#achievedByDomain;
        const richtigCode = RESULT_VALUES[RESULT_CORRECT];
        const tooltipBasePath = 'en.student.student-item-table.interface';

        // TODO ASSUMPTION-EN-LEVEL-PRESETS-DISABLED: "Unter KS"/"Über KS" select wrong rows in EN; re-enable once fixed.
        return [
            new Preset({
                label: glossaryAnnotator.getRequiredEntryText(`${tooltipBasePath}.below-ks.label`),
                tooltipText: glossaryAnnotator.getRequiredEntryText(
                    `${tooltipBasePath}.below-ks.tooltip`,
                ),
                disabled: true,
                sort: [{ column: 'name', dir: 'asc' }],
                filters: [
                    {
                        field: 'competenceLevel',
                        type: 'custom',
                        value: (row) =>
                            row.ergebnis !== richtigCode &&
                            isItemBelowReportedLevel(
                                row.competenceLevel,
                                achievedByDomain[row.domain],
                            ),
                    },
                ],
            }),
            new Preset({
                label: glossaryAnnotator.getRequiredEntryText(`${tooltipBasePath}.above-ks.label`),
                tooltipText: glossaryAnnotator.getRequiredEntryText(
                    `${tooltipBasePath}.above-ks.tooltip`,
                ),
                disabled: true,
                sort: [{ column: 'name', dir: 'asc' }],
                filters: [
                    {
                        field: 'competenceLevel',
                        type: 'custom',
                        value: (row) =>
                            row.ergebnis === richtigCode &&
                            isItemAboveReportedLevel(
                                row.competenceLevel,
                                achievedByDomain[row.domain],
                            ),
                    },
                ],
            }),
        ];
    }

    /**
     * Group student data by domain
     */
    #groupDataByDomain() {
        this.#domainGroups = {};
        if (!this.#allStudentData) return;

        // Keyed by domain id, the value a domain mode names.
        this.#allStudentData.forEach((item) => {
            const domain = item.domain;
            if (!this.#domainGroups[domain]) {
                this.#domainGroups[domain] = [];
            }
            this.#domainGroups[domain].push(item);
        });
    }

    /**
     * Format EN item levels consistently across table UI and export.
     * @param {string|number|null|undefined} value - Item level as sent (e.g. 'B1.2')
     * @returns {string} The level, or the N/A fallback
     */
    #formatCompetenceLevel(value) {
        return value ? String(value) : 'N/A';
    }

    /**
     * Render table based on the current mode
     * @param {string} mode - `'all'` or a domain id
     */
    async #renderTableForMode(mode) {
        if (!this.#allStudentData || this.#allStudentData.length === 0) {
            this.clear();
            return;
        }

        const dataToRender =
            mode === 'all' ? this.#allStudentData : (this.#domainGroups[mode] ?? []);

        await this.#renderTable(dataToRender);
    }

    /**
     * Render the student data table
     * @param {Array} enrichedData - Data to display
     */
    async #renderTable(enrichedData) {
        if (!enrichedData || enrichedData.length === 0) {
            this.clear();
            return;
        }

        const enConfig = this.getOption('enConfig');

        // If table already exists, swap data in-place instead of expensive destroy+recreate.
        // The formatters read mode dynamically via `self._state.mode`, so they stay current.
        if (
            await this.safeReplaceData(enrichedData, {
                afterReplace: () => {
                    this.table?.redraw(false);
                    this._updatePresets(this._getPresets());
                },
            })
        ) {
            return;
        }

        // Generate filter parameters
        const aufgabenFilterParams = createListFilter(enrichedData, 'exercise.name');
        const ergebnisFilterParams = createListFilter(
            enrichedData,
            'ergebnis',
            this.#formatErgebnis.bind(this),
            enConfig.resultTypes.map((rt) => rt.label),
        );

        // Stable reference for formatter closures — reads mode live on each format call
        const self = this;

        // Define columns - no separate domain column, domain prefix shown in Nr. column
        const columns = [
            createItemNumberColumn(() => this._state.mode, {
                onItemPreview: this.getOption('onItemPreview'),
            }),
            createColumnDef('Aufgabe', 'exercise.name', {
                headerFilter: 'list',
                headerFilterParams: aufgabenFilterParams,
                widthGrow: COLUMN_GROW_RATIOS.name,
            }),
            createStylesColumn(enrichedData, {
                title: 'Stile',
                styleCategories: enConfig.styleCategories,
            }),
            createColumnDef(EN_TERMS.ITEM_LEVEL, 'competenceLevel', {
                headerFilter: 'list',
                headerFilterParams: createListFilter(enrichedData, 'competenceLevel', (value) =>
                    this.#formatCompetenceLevel(value),
                ),
                widthGrow: COLUMN_GROW_RATIOS.result,
                hozAlign: 'center',
                sorter: compareLevelLabels,
                formatter: function (cell) {
                    const value = cell.getValue();
                    return createGerLevelHtml(
                        self.#formatCompetenceLevel(value),
                        'span',
                        'ger-text',
                    );
                },
            }),
            createColumnDef('Ergebnis', 'ergebnis', {
                headerFilter: 'list',
                headerFilterParams: ergebnisFilterParams,
                hozAlign: 'center',
                widthGrow: COLUMN_GROW_RATIOS.gerLevel,
                formatter: function (cell) {
                    const value = cell.getValue();
                    const rt = enConfig.resultTypes.find((t) => t.numericCode === value);
                    if (!rt) return value;
                    return iconSvg(rt.icon, { className: rt.iconClass });
                },
            }),
        ];

        // Create the data table
        this.table = this.createTable({
            containerId: this.contentContainer.id,
            columns,
            data: enrichedData,
            options: {
                height: '100%',
                responsiveLayout: 'collapse',
                selectableRows: 1,
                selectableRowsPersistence: false,
                headerSort: true,
            },
            presets: this._getPresets(),
        });

        // Attach row click handler for item detail module
        this.#attachTableEvents();
    }

    /**
     * No-op override — prevents the mixin's _onTableReady from calling
     * _applyModeChange, which would destroy-and-recreate the table and
     * cause an infinite loop.  This module already renders for the
     * correct mode during _renderForStudent → #renderTableForMode.
     * @override
     * @protected
     */
    _onTableReady() {
        // intentionally empty
    }

    /**
     * Apply mode change — re-render table for the new domain.
     * @param {string} mode - 'all', 'domain0', or 'domain1'
     */
    _applyModeChange(mode) {
        this.#renderTableForMode(mode);
    }

    /**
     * Attach event handlers to the table
     */
    #attachTableEvents() {
        if (!this.table) return;

        this.table.on('rowClick', (e, row) => {
            const rowData = row.getData();
            const itemData = this.#getItemByIqbId(rowData.iqbId);

            if (itemData) {
                this.triggerCallback('itemSelected', { item: itemData });
            }
        });
    }

    // ========================================================================
    // EXPORT
    // ========================================================================

    /**
     * Format result value for export
     * @param {number} value - Result value
     * @returns {string|number} Formatted result
     */
    #formatErgebnis(value) {
        const rt = this.getOption('enConfig').resultTypes.find((t) => t.numericCode === value);
        return rt?.label ?? value;
    }

    /** @override */
    destroy() {
        this.#itemsByIqbId = null;
        this.#indexedItemArray = null;
        super.destroy();
    }
}
