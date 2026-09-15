/**
 * SlClassTableModule — the SL class view's tables: one school overview table plus
 * one table per class.
 *
 * The owning view pushes the viz mode with `setState({ vizMode })` from its app-state
 * observer; a standalone host calls the same verb.
 */

/**
 * @typedef {object} DomainData
 * @property {string} domain - Domain code
 * @property {string} domainName - Domain display name
 * @property {object} ksCounts - Competency level counts
 * @property {Array} competencyLevels - Available competency levels
 */

/**
 * @typedef {object} ClassTableRowData
 * @property {'school'|'class'|'self-efficacy-footer'} type - Row type
 * @property {string} subjectName - Display name of the subject
 * @property {string} subject - Subject code
 * @property {Array<DomainData>} domains - Domain-specific data
 * @property {string} stammklasse_id - Class ID
 * @property {number} anzahlSus - Number of students
 * @property {object} teachingQuality - Box plot statistics
 * @property {Array<number>} teachingQualityValues - Raw teaching quality values
 * @property {boolean} [isSelfEfficacyRow] - True for self-efficacy footer
 * @property {Array<number>} [selfEfficacyValues] - Raw self-efficacy values
 */

import {
    processSegments,
    createDOMStackedBar,
    ksDistributionPreset,
} from '../../../common/charts/stackedBarUtils.js';
import { SlBaseTableModule } from './slBaseTableModule.js';
import { withTableModeState } from '../../../common/tables/withTableModeState.js';
import { getLevelsForDomain } from '../../utils/slLevelDefinitions.js';
import { EMBEDDED_BAR_HEIGHT } from './slRatingStackedBar.js';
import { getCompetencyColor, getThemeColors } from '../../../common/services/themeService.js';
import { collectTraitNamesFromData, aggregateStudentStats } from '../../utils/slStudentStats.js';
import {
    createCountPercentageFormatter,
    createStackedCellFormatter,
} from '../../../common/tables/cellFormatters.js';
import { createColumnDef } from '../../../common/tables/columnFactories.js';
import { TERM_CONSTANTS } from '../../../common/domain/terms.js';
import { createGlossaryKeyTitleFormatter } from '../../../common/tables/glossaryFormatters.js';
import {
    COLUMN_GROW_RATIOS,
    VISUAL_COLUMN_MIN_WIDTHS,
} from '../../../common/tables/columnWidthConstants.js';
import {
    createVizModeSwitchingFormatter,
    createTraitColumns,
    createSurveyMeasureDownloadColumns,
} from './slColumnBuilders.js';
import { createDownloadColumn } from '../../../common/tables/tableExport.js';
import { glossaryAnnotator } from '../../../common/glossary/glossaryAnnotator.js';

/**
 * Transforms ksCounts object to have ks_ prefixed keys for ksDistributionPreset compatibility.
 * @param {{[level: string]: number}} ksCounts - Object with competency level counts (e.g., { I: 5, II: 3 })
 * @returns {{[prefixedLevel: string]: number}} Object with ks_ prefixed keys (e.g., { ks_I: 5, ks_II: 3 })
 */
function prefixKsCounts(ksCounts) {
    if (!ksCounts) return {};
    return Object.fromEntries(Object.entries(ksCounts).map(([key, value]) => [`ks_${key}`, value]));
}

/**
 * SlClassTableModule - Manages school and class overview tables for SL
 * @augments SlBaseTableModule
 */
export class SlClassTableModule extends withTableModeState(SlBaseTableModule, {
    stateKey: 'vizMode',
    // The mixin calls this with the module as `this`; the class factory hides that from tsc.
    /**
     * @param {object} _opts - Unused: the initial mode comes from the module's own options.
     * @returns {string} The mode this table starts in.
     * @this {any}
     */
    initialValue(_opts) {
        return this.getOption('vizMode');
    },
    applyHookName: '_applyVizModeChange',
}) {
    static #sectionCollapseOptions = {
        collapsible: true,
        startCollapsed: true,
    };

    /** @type {any[]|null} */
    #classArray = null;
    /** @type {any} */
    #schoolTable = null;
    #classTables = [];

    constructor(id, container, options = {}) {
        super(id, container, options);
        this.setDefaults({ enableModuleExport: true });
    }

    // ========================================================================
    // BASE CLASS HOOKS
    // ========================================================================

    /**
     * Get active tables for vizMode redraw.
     * @returns {Array} School table + all class tables
     */
    _getActiveTables() {
        return [this.#schoolTable, ...this.#classTables];
    }

    /**
     * Render the school and class tables
     * @override
     * @param {object} data - Data for rendering
     * @param {Array} data.classArray - Array of class data
     * @param {Map} data.levelDefinitions - Competency level definitions map
     * @param {Array} data.teachingQuality - Pre-computed teaching quality stats by class+subject
     * @param {Array} data.selfEfficacyByClass - Self-efficacy data by class
     * @param {object} data.selfEfficacySchool - Self-efficacy data for school
     * @returns {Promise<void>}
     */
    async _doRenderContent(data) {
        // Store shared data (levelDefinitions, teachingQuality, selfEfficacy)
        this._storeCommonRenderData(data);

        // Store class-specific data
        this.#classArray = data.classArray;

        // Remove section-local export controls before table teardown clears the container.
        this._clearTableSectionExportButtons();
        this._destroyActiveTables();
        this._destroyTableSections();

        // Clear existing content
        this.contentContainer.innerHTML = '';

        // Create school overview section
        await this.#renderSchoolOverview();

        // Create class tables section
        await this.#renderClassTables();
    }

    /**
     * Renders the school overview table
     */
    async #renderSchoolOverview() {
        const title = 'Schule';
        const { section, headerActions, host } = this._createTableSection({
            title,
            className: 'table-section school-overview',
            hostId: `${this.id}-school-overview`,
            hostClassName: 'class-table-container table-content',
            ...SlClassTableModule.#sectionCollapseOptions,
        });

        this._createTableSectionExportButton({
            headerActions,
            id: `${this.id}-school-overview-export`,
            title,
            container: section,
        });

        // Create aggregated school results
        const schoolResults = this.#createSchoolResults(this.#classArray);

        // Display school overview table
        this.#schoolTable = this.#displayTableClassTabulator(
            schoolResults,
            this._levelDefinitions,
            host,
        );
    }

    /**
     * Renders individual class tables
     */
    async #renderClassTables() {
        // Create class tables directly in container (each will have its own section)
        this.#classTables = this.#createClassTablesTabulator(
            this.#classArray,
            this._levelDefinitions,
            this.contentContainer,
        );
    }

    /**
     * Creates aggregated school results from all class data
     * @param {any[]|null} classArray - Array of class results
     * @returns {Array} Aggregated school results
     */
    #createSchoolResults(classArray) {
        if (!Array.isArray(classArray) || classArray.length === 0) return [];

        const allResults = classArray.flat();
        if (allResults.length === 0) return [];

        // Group by subject-domain combination
        const subjectDomainGroups = {};
        const subjectFirstDomain = {}; // Track first domain for each subject
        allResults.forEach((result) => {
            const key = `${result.fach}_${result.domaene}`;
            if (!subjectDomainGroups[key]) {
                // Track if this is the first domain for this subject
                if (!subjectFirstDomain[result.fach]) {
                    subjectFirstDomain[result.fach] = result.domaene;
                }

                subjectDomainGroups[key] = {
                    fach: result.fach,
                    domaene: result.domaene,
                    fachbezeichnung: result.fachbezeichnung,
                    domaenenbezeichnung: result.domaenenbezeichnung,
                    allResults: [],
                };
            }
            subjectDomainGroups[key].allResults.push(result);
        });

        // Create aggregated results
        return Object.values(subjectDomainGroups).map((group) => {
            const allStudents = group.allResults.flatMap(
                (classResult) => classResult.summedResults || [],
            );

            // Trait and gender counts come from the students; the headcount is the sum of
            // the class rows' own figures (their `total`), as in the domain table's school row.
            const { stats: baseStats } = aggregateStudentStats(allStudents);
            const aggregatedStats = {
                ...baseStats,
                nrStudents: group.allResults.reduce(
                    (sum, classResult) => sum + (classResult.stats?.nrStudents ?? 0),
                    0,
                ),
                ksCounts: {},
            };

            // Aggregate ksCounts from all class results in this group
            group.allResults.forEach((classResult) => {
                if (classResult.stats?.ksCounts) {
                    for (const [level, count] of Object.entries(classResult.stats.ksCounts)) {
                        aggregatedStats.ksCounts[level] =
                            (aggregatedStats.ksCounts[level] || 0) + count;
                    }
                }
            });

            // Only assign teaching quality to the first domain of each subject
            const isFirstDomain = subjectFirstDomain[group.fach] === group.domaene;
            const subjectName = group.fachbezeichnung;
            const tqData =
                isFirstDomain && subjectName
                    ? this._getTeachingQuality('Schule', subjectName)
                    : null;

            return {
                fach: group.fach,
                domaene: group.domaene,
                fachbezeichnung: group.fachbezeichnung,
                domaenenbezeichnung: group.domaenenbezeichnung,
                stammklasse_id: 'school',
                stammklasse: 'Schule',
                stats: aggregatedStats,
                summedResults: allStudents,
                teachingQuality: tqData?.statistics ?? null,
                teachingQualityValues: tqData?.values ?? null,
            };
        });
    }

    /**
     * Displays class table using Tabulator
     * @param {Array} classResults - Array of class results
     * @param {Map|null} levelDefinitions - Competency level definitions map
     * @param {HTMLElement|string|null} containerOrId - Container element or its ID
     * @returns {object} Tabulator instance
     */
    #displayTableClassTabulator(classResults, levelDefinitions, containerOrId) {
        if (!Array.isArray(classResults) || classResults.length === 0) return null;

        // Accept either container element or ID
        const container =
            typeof containerOrId === 'string'
                ? document.getElementById(containerOrId)
                : containerOrId;
        if (!container) return null;

        return this.#displaySingleClassTable(classResults, levelDefinitions, container);
    }

    /**
     * Helper to display a single table for a class
     * @param {Array<object>} classResults - The class's rows, one per Fach and Domäne.
     * @param {import('../../utils/slLevelDefinitions.js').LevelDefinitions|null} levelDefinitions - Level definitions per Fach/Domäne, which name the Kompetenzstufen columns.
     * @param {HTMLElement} container - The element the table is built in.
     * @returns {object|null} The Tabulator instance, or `null` when there is nothing to show.
     */
    #displaySingleClassTable(classResults, levelDefinitions, container) {
        const model = this.#buildClassRowModel(classResults, levelDefinitions);
        if (!model) return null;

        const columns = this.#buildClassColumns(model);
        const tableData = this.#buildClassTableData(model);

        // Create table
        const tableId = `classTable_${model.firstResult.stammklasse_id}_${Date.now()}`;

        // Create table container element
        const tableContainer = document.createElement('div');
        tableContainer.id = tableId;
        container.appendChild(tableContainer);

        const baseRowFormatter = this._createRowTypeFormatter({
            state: 'state-row',
            school: 'school-row',
        });

        const options = this.#classTableOptions(baseRowFormatter);

        return this.createTable({ containerId: tableId, columns, data: tableData, options });
    }

    /**
     * Creates multiple class tables
     * @param {Array|null} classArray - Array of class results
     * @param {Map|null} levelDefinitions - Competency level definitions map
     * @param {HTMLElement} container - Container element
     * @returns {Array} Array of Tabulator instances
     */
    #createClassTablesTabulator(classArray, levelDefinitions, container) {
        if (!container || !classArray) return [];

        const tables = [];

        classArray.forEach((classGroup, index) => {
            // Get class name from first item in group
            const className = `Klasse ${classGroup[0]?.stammklasse || index + 1}`;
            const classContainerId = `${this.id}_class_${index}`;

            const { section, headerActions, host } = this._createTableSection({
                parent: container,
                title: className,
                hostId: classContainerId,
                hostClassName: 'class-table-container table-content',
                ...SlClassTableModule.#sectionCollapseOptions,
            });

            this._createTableSectionExportButton({
                headerActions,
                id: `${classContainerId}-export`,
                title: className,
                container: section,
            });

            const table = this.#displayTableClassTabulator(classGroup, levelDefinitions, host);
            if (table) {
                tables.push(table);
            }
        });

        return tables;
    }

    /**
     * Groups the class's rows into one entry per Fach and collects what the columns and
     * rows are built from.
     * @param {Array<object>} classResults - The class's rows, one per Fach and Domäne.
     * @param {import('../../utils/slLevelDefinitions.js').LevelDefinitions|null} levelDefinitions - Level definitions per Fach/Domäne.
     * @returns {object|null} The row model, or `null` when there is nothing to show.
     */
    #buildClassRowModel(classResults, levelDefinitions) {
        // Deduplicate by subject-domain combination (merge duplicates)
        const subjectDomainGroups = new Map();
        classResults.forEach((result) => {
            const key = `${result.fach}_${result.domaene}`;
            if (!subjectDomainGroups.has(key)) {
                subjectDomainGroups.set(key, { ...result });
            }
        });
        const deduplicatedResults = Array.from(subjectDomainGroups.values());

        if (deduplicatedResults.length === 0) return null;

        const firstResult = deduplicatedResults[0];

        // Group results by subject (one row per subject)
        // For subjects with multiple domains, we need to aggregate stats properly
        const subjectGroups = new Map();
        deduplicatedResults.forEach((result) => {
            if (!subjectGroups.has(result.fach)) {
                subjectGroups.set(result.fach, {
                    subject: result.subjectCode,
                    subjectName: result.fachbezeichnung,
                    stammklasse_id: result.stammklasse_id,
                    type: result.stammklasse_id === 'school' ? 'school' : 'class',
                    // Will aggregate these across all domains
                    allSummedResults: [],
                    // Domain-specific data
                    domains: [],
                });
            }

            const subjectData = subjectGroups.get(result.fach);

            // Collect all summedResults from all domains for this subject
            if (result.summedResults) {
                subjectData.allSummedResults.push(...result.summedResults);
            }

            // Add domain-specific data
            const competencyLevels = getLevelsForDomain(
                levelDefinitions,
                result.fachbezeichnung,
                result.domaene,
            );
            subjectData.domains.push({
                domain: result.domaene,
                domainName: result.domaenenbezeichnung || '',
                ksCounts: result.stats.ksCounts,
                competencyLevels: competencyLevels,
                // The domain's ladder (resolved once in slDataService), so its bar paints a level name another Fach in this
                // table shares on the right ramp.
                scaleId: result.stats.scaleId,
                nrStudents: result.stats.nrStudents,
            });
        });

        // Trait and gender counts per subject, over its distinct students. A subject with
        // one Domäne has a row that states its headcount (the class row's `total`; summed
        // over the classes in the school section); a subject split into Domänen has no
        // such row, so its headcount is the distinct students across them.
        subjectGroups.forEach((subjectData) => {
            const { stats } = aggregateStudentStats(subjectData.allSummedResults);
            if (subjectData.domains.length === 1) {
                stats.nrStudents = subjectData.domains[0].nrStudents;
            }
            subjectData.stats = stats;
        });

        // Look up pre-computed teaching quality per subject for this class
        const teachingQualityValuesBySubject = {};
        const teachingQualityStatsBySubject = {};

        if (this._teachingQuality && firstResult.stammklasse_id !== 'school') {
            subjectGroups.forEach((subjectData, subjectKey) => {
                const tqData = this._getTeachingQuality(firstResult.stammklasse_id, subjectKey);
                if (tqData) {
                    teachingQualityValuesBySubject[subjectKey] = tqData.values;
                    // count sits beside statistics on the entry, so merge it in —
                    // the same shape selfEfficacy is stored in.
                    teachingQualityStatsBySubject[subjectKey] = {
                        ...tqData.statistics,
                        count: tqData.count,
                    };
                }
            });
        }

        // Collect trait names from data schema (all is* fields from first student)
        const traitNames = collectTraitNamesFromData(
            Array.from(subjectGroups.values()),
            (subjectData) => subjectData.allSummedResults,
        );

        // Every Kompetenzstufe present anywhere in this table, in ladder order.
        // The cell draws one bar per Domäne, but a CSV row is flat — so the
        // export sums each level across the subject's Domänen, which counts a
        // student once per Domäne, exactly as the bars show them.
        const ksLevelIds = [];
        subjectGroups.forEach((subjectData) => {
            subjectData.domains.forEach((domain) => {
                (domain.competencyLevels || []).forEach((level) => {
                    if (!ksLevelIds.includes(level.stufe)) ksLevelIds.push(level.stufe);
                });
            });
        });

        return {
            subjectGroups,
            deduplicatedResults,
            firstResult,
            traitNames,
            ksLevelIds,
            teachingQualityValuesBySubject,
            teachingQualityStatsBySubject,
        };
    }

    /**
     * Builds the column definitions of a class table.
     * @param {object} model - The row model.
     * @param {Array<string>} model.traitNames - Trait names present in the data.
     * @param {Array<string>} model.ksLevelIds - Every Kompetenzstufe in this table, in ladder order.
     * @returns {Array<object>} Tabulator column definitions.
     */
    #buildClassColumns({ traitNames, ksLevelIds }) {
        // Domain name formatter - shows stacked domain names for multi-domain subjects
        const domainNameFormatter = createStackedCellFormatter({
            getItems: (rowData) => rowData.domains || [],
            skipCondition: (rowData) => rowData.isSelfEfficacyRow,
            emptyValue: '-',
            singleItemValue: '-',
            createItemElement: (domain) => {
                const label = document.createElement('div');
                label.textContent = domain.domainName;
                label.style.minHeight = 'var(--table-row-content-min)';
                label.style.display = 'flex';
                label.style.alignItems = 'center';
                label.style.justifyContent = 'center';
                return label;
            },
        });

        // Competency level bars formatter - shows stacked bars for each domain
        const ksDistributionFormatter = createStackedCellFormatter({
            getItems: (rowData) => rowData.domains || [],
            skipCondition: (rowData) => rowData.isSelfEfficacyRow,
            emptyValue: '',
            singleItemValue: null, // Show bar even for single domain
            createItemElement: (domain) => {
                const barContainer = document.createElement('div');
                barContainer.className = 'sl-cell-bar';

                const bar = createDOMStackedBar(
                    processSegments(
                        { ...prefixKsCounts(domain.ksCounts), scaleId: domain.scaleId },
                        {
                            ...ksDistributionPreset(domain.competencyLevels, getCompetencyColor),
                            showLabels: false,
                        },
                    ),
                    {
                        height: EMBEDDED_BAR_HEIGHT,
                        borderRadius: 3,
                        showLabels: false,
                        showTooltips: true,
                    },
                );
                bar.style.width = '100%';
                barContainer.appendChild(bar);
                return barContainer;
            },
        });

        // Build columns with multi-domain support
        const columns = [
            createColumnDef('Fach', 'subjectName', {
                headerSort: false,
                widthGrow: COLUMN_GROW_RATIOS.domain,
                vertAlign: 'middle',
                formatter: (cell) => {
                    return cell.getValue();
                },
            }),
            // One column serves both measures here: the subject rows carry
            // Unterrichtsqualität and the footer row Selbstwirksamkeit, so it stays as
            // long as either exists. Omitted entirely when neither does — see
            // SlBaseTableModule._hasTeachingQualityData.
            ...(this._hasTeachingQualityData() || this._hasSelfEfficacyData()
                ? [
                      {
                          title: 'Unterrichtsqualität',
                          field: 'teachingQuality',
                          headerSort: false,
                          hozAlign: 'center',
                          vertAlign: 'middle',
                          formatter: (cell) => {
                              const rowData = cell.getRow().getData();

                              if (!rowData.teachingQuality) {
                                  return '';
                              }

                              // Determine if this is self-efficacy or teaching quality
                              const isSelfEfficacy = rowData.isSelfEfficacyRow;
                              const title = isSelfEfficacy
                                  ? 'Selbstwirksamkeit'
                                  : 'Unterrichtsqualität';
                              const boxColor = isSelfEfficacy
                                  ? getThemeColors().sl.selfEfficacy
                                  : getThemeColors().sl.teachingQuality;
                              const valuesField = isSelfEfficacy
                                  ? 'selfEfficacyValues'
                                  : 'teachingQualityValues';

                              // Use shared vizMode switching formatter
                              return createVizModeSwitchingFormatter({
                                  dataField: 'teachingQuality',
                                  valuesField,
                                  boxColor,
                                  tooltipTitle: title,
                                  vizModeGetter: () => this._state.vizMode,
                              })(cell);
                          },
                          widthGrow: COLUMN_GROW_RATIOS.progressBar,
                          minWidth: VISUAL_COLUMN_MIN_WIDTHS.progressBar,
                          // The field holds the statistics object the box plot is drawn
                          // from; the columns below export its numbers instead.
                          download: false,
                      },
                      // The footer row stores Selbstwirksamkeit in the same field, so it
                      // lands in these same columns — exactly as it shares the cell above.
                      ...createSurveyMeasureDownloadColumns({
                          dataField: 'teachingQuality',
                          label: 'Unterrichtsqualität',
                          follows: 'teachingQuality',
                      }),
                  ]
                : []),
            {
                title: TERM_CONSTANTS.DOMAIN,
                field: 'domainNames',
                headerSort: false,
                hozAlign: 'center',
                vertAlign: 'middle',
                widthGrow: COLUMN_GROW_RATIOS.domain,
                variableHeight: true,
                formatter: domainNameFormatter,
                // The cell stacks one label per Domäne; the row's own field is empty.
                accessorDownload: (_value, data) =>
                    (data.domains ?? [])
                        .map((domain) => domain.domainName)
                        .filter(Boolean)
                        .join(', '),
            },
            {
                title: TERM_CONSTANTS.COMP_LEVELS,
                // Point the header at the scale popup (its body comes from the payload,
                // so it names the loaded ladder's bands), same as the chart legend.
                // This *overrides* a link rather than adding one: "Kompetenzstufen" is an
                // `exact` alias of `KS_distribution` in glossary.json, so free-text
                // annotation resolved this header to "Kompetenzstufenverteilung" before.
                titleFormatter: createGlossaryKeyTitleFormatter('KS'),
                field: 'ksDistribution',
                headerSort: false,
                hozAlign: 'center',
                variableHeight: true,
                formatter: ksDistributionFormatter,
                widthGrow: COLUMN_GROW_RATIOS.progressBar,
                minWidth: VISUAL_COLUMN_MIN_WIDTHS.progressBar,
                download: false,
            },
            // Synthetic fields, but deliberately named like the SL domain table's
            // real ones so the JSON keys of both SL tables line up.
            ...ksLevelIds.map((stufe) =>
                createDownloadColumn(`KS ${stufe}`, `ks_${stufe}`, {
                    follows: 'ksDistribution',
                    // Blank rather than 0 for a row this level does not apply to: the
                    // columns are the union over every subject in the table, so a
                    // Deutsch row meets Englisch's A1–C1 (and the Selbstwirksamkeit
                    // footer has no Domänen at all). A 0 there would read as "no
                    // student reached it", where the bar shows no such band.
                    accessor: (_value, data) => {
                        const domains = (data.domains ?? []).filter((domain) =>
                            (domain.competencyLevels ?? []).some((level) => level.stufe === stufe),
                        );
                        if (domains.length === 0) return '';
                        return domains.reduce(
                            (sum, domain) => sum + (domain.ksCounts?.[stufe] ?? 0),
                            0,
                        );
                    },
                }),
            ),
            {
                title: `Anzahl ${TERM_CONSTANTS.STUDENTS}`,
                field: 'anzahlSus',
                headerSort: false,
                hozAlign: 'right',
                vertAlign: 'middle',
                widthGrow: COLUMN_GROW_RATIOS.count,
            },
        ];

        // Gender columns - use minWidth + widthGrow:0 so sub-columns stay narrow
        // but can still shrink proportionally on narrow screens
        const genderFormatter = createCountPercentageFormatter('anzahlSus');
        columns.push({
            title: 'Geschlechtsverteilung',
            columns: [
                {
                    title: 'M',
                    field: 'gender_male',
                    headerSort: false,
                    hozAlign: 'center',
                    vertAlign: 'middle',
                    minWidth: VISUAL_COLUMN_MIN_WIDTHS.genderSubColumn,
                    widthGrow: 0,
                    formatter: genderFormatter,
                },
                {
                    title: 'W',
                    field: 'gender_female',
                    headerSort: false,
                    hozAlign: 'center',
                    vertAlign: 'middle',
                    minWidth: VISUAL_COLUMN_MIN_WIDTHS.genderSubColumn,
                    widthGrow: 0,
                    formatter: genderFormatter,
                },
                {
                    title: 'D',
                    field: 'gender_diverse',
                    headerSort: false,
                    hozAlign: 'center',
                    vertAlign: 'middle',
                    minWidth: VISUAL_COLUMN_MIN_WIDTHS.genderSubColumn,
                    widthGrow: 0,
                    formatter: genderFormatter,
                },
            ],
        });

        // Trait columns - use minWidth + widthGrow:0 to stay narrow (like gender)
        if (traitNames.length > 0) {
            const traitFormatter = createCountPercentageFormatter('anzahlSus');
            const traitColumn = createTraitColumns(traitNames, traitFormatter);
            if (traitColumn) {
                columns.push(traitColumn);
            }
        }

        return columns;
    }

    /**
     * Builds the table rows, one per Fach, plus the Selbstwirksamkeit footer row.
     * @param {object} model - The row model from `#buildClassRowModel`.
     * @returns {Array<object>} Tabulator row data.
     */
    #buildClassTableData(model) {
        const {
            subjectGroups,
            deduplicatedResults,
            firstResult,
            traitNames,
            teachingQualityValuesBySubject,
            teachingQualityStatsBySubject,
        } = model;

        // Build table data - ONE ROW PER SUBJECT
        const tableData = Array.from(subjectGroups.entries()).map(([subjectKey, subjectData]) => {
            // Get teaching quality for this subject (keyed by full subject name)
            let qualityValues = teachingQualityValuesBySubject[subjectKey] || null;
            let qualityStats = teachingQualityStatsBySubject[subjectKey] || null;

            // For school results, get from first domain's result
            if (subjectData.type === 'school') {
                const firstDomainResult = deduplicatedResults.find((r) => r.fach === subjectKey);
                if (firstDomainResult) {
                    qualityValues = firstDomainResult.teachingQualityValues || qualityValues;
                    qualityStats = firstDomainResult.teachingQuality || qualityStats;
                }
            }

            const row = {
                type: subjectData.type,
                subjectName: subjectData.subjectName,
                subject: subjectData.subject,
                domains: subjectData.domains,
                stammklasse_id: subjectData.stammklasse_id,
                anzahlSus: subjectData.stats.nrStudents,
                teachingQuality: qualityStats,
                teachingQualityValues: qualityValues,
            };

            // Add trait counts
            traitNames.forEach((trait) => {
                row[`trait_${trait}`] = subjectData.stats.traitCounts[trait] || 0;
            });

            // Add gender counts
            ['male', 'female', 'diverse'].forEach((gender) => {
                row[`gender_${gender}`] = subjectData.stats.genderCounts[gender] || 0;
            });

            return row;
        });

        // Add self-efficacy footer row
        const stammklasseId = firstResult.stammklasse_id;
        let selfEfficacyData = null;
        let selfEfficacyValues = null;
        let selfEfficacyCount = null;

        if (stammklasseId === 'school' && this._selfEfficacySchool) {
            selfEfficacyData = this._selfEfficacySchool.statistics;
            selfEfficacyValues = this._selfEfficacySchool.values || [];
            selfEfficacyCount = this._selfEfficacySchool.count;
        } else if (this._selfEfficacyByClass) {
            const classData = this._selfEfficacyByClass.find((c) => c.className === stammklasseId);
            if (classData) {
                selfEfficacyData = classData.statistics;
                selfEfficacyValues = classData.values || [];
                selfEfficacyCount = classData.count;
            }
        }

        if (selfEfficacyData) {
            tableData.push(
                /** @type {any} */ ({
                    type: 'self-efficacy-footer',
                    subjectName: 'Selbstwirksamkeit',
                    domains: [],
                    // count sits beside statistics on the entry, so merge it in — the
                    // export column reads it off this same field for every row.
                    teachingQuality: { ...selfEfficacyData, count: selfEfficacyCount },
                    selfEfficacyValues,
                    isSelfEfficacyRow: true,
                }),
            );
        }

        return tableData;
    }

    /**
     * Tabulator options of a class table.
     * @param {Function} baseRowFormatter - Row formatter that stamps the row-type class.
     * @returns {object} Tabulator options.
     */
    #classTableOptions(baseRowFormatter) {
        return {
            pagination: false,
            headerSort: false,
            selectable: false,
            selectableRows: false,
            responsiveLayout: 'hide',
            height: 'auto',
            placeholder: glossaryAnnotator.getRequiredEntryText('general.messages.no-data'),
            disablePresets: true,
            rowFormatter: (row) => {
                baseRowFormatter(row);

                const data = row.getData();
                const element = row.getElement();

                if (data.type === 'self-efficacy-footer') {
                    element.classList.add('self-efficacy-row');
                    element.style.borderTop = `2px solid ${getThemeColors().chrome.tableSectionBorder}`;
                    element.style.fontWeight = 'var(--fw-semibold)';

                    // For self-efficacy: keep only Fach and Unterrichtsqualität visible
                    // Empty other cells but keep them in DOM for proper table layout
                    const cells = element.querySelectorAll('.tabulator-cell');

                    cells.forEach((cell) => {
                        const field = cell.getAttribute('tabulator-field');

                        if (field === 'subjectName' || field === 'teachingQuality') {
                            // Keep these cells as-is
                        } else {
                            // Hide content but keep cell structure for layout
                            cell.style.padding = '0';
                            cell.style.borderLeft = 'none';
                            cell.style.borderRight = 'none';
                            cell.innerHTML = '';
                        }
                    });
                } else {
                    element.style.borderTop = `1px solid ${getThemeColors().chrome.border}`;
                }
            },
            cellClick: (e, cell) => {
                this.animateTemporaryElementClass(cell.getElement(), 'cell-click-animation', 150);
            },
        };
    }
}
