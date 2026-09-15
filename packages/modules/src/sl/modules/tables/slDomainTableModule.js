/**
 * SlDomainTableModule - Module for SL domain view tables
 * Handles merged domain table with all subjects and domains
 *
 * Mode Handling:
 * - The owning view pushes the viz mode with setState({ vizMode }) from its
 *   app-state observer; a standalone host calls the same verb
 */

import {
    createStackedBarFormatter,
    ksDistributionPreset,
    genderDistributionPreset,
} from '../../../common/charts/stackedBarUtils.js';
import { SlBaseTableModule } from './slBaseTableModule.js';
import { withTableModeState } from '../../../common/tables/withTableModeState.js';
import { EMBEDDED_BAR_HEIGHT } from './slRatingStackedBar.js';
import { getCompetencyColor, getThemeColors } from '../../../common/services/themeService.js';
import { collectTraitNamesFromData } from '../../utils/slStudentStats.js';
import {
    buildCompetenceLevelIndex,
    findComparisonEntriesForSubjectDomain,
} from '../../slCompetenceLevelIndex.js';
import { getLevelsForDomain } from '../../utils/slLevelDefinitions.js';
import {
    COLUMN_GROW_RATIOS,
    VISUAL_COLUMN_MIN_WIDTHS,
} from '../../../common/tables/columnWidthConstants.js';
import { createColumnDef } from '../../../common/tables/columnFactories.js';
import {
    createVizModeSwitchingFormatter,
    createTraitColumns,
    createSurveyMeasureDownloadColumns,
} from './slColumnBuilders.js';
import { createDownloadColumn } from '../../../common/tables/tableExport.js';
import { formatDownloadNumber } from '../../../common/tables/downloadNumberFormat.js';
import { TERM_CONSTANTS } from '../../../common/domain/terms.js';
import { createGlossaryKeyTitleFormatter } from '../../../common/tables/glossaryFormatters.js';
import { escapeHtml } from '@tba3/module-base/utils/escapeHtml.js';
import { glossaryAnnotator } from '../../../common/glossary/glossaryAnnotator.js';

const CLASS_LABEL_COLUMN_MIN_WIDTH = 130;
const reportedMissingComparisonTableValues = new Set();

/**
 * Warn once per Fach/Domäne that the persisted comparison averages carry no trait or
 * gender values, so the blank cells have a visible explanation.
 * @param {string|null} subjectName - The Fach with the gap.
 * @param {string|null} domainId - The Domäne with the gap.
 */
function warnMissingComparisonTableValues(subjectName, domainId) {
    const key = `${subjectName ?? '(unknown subject)'}|${domainId ?? '(no domain)'}`;
    if (reportedMissingComparisonTableValues.has(key)) return;
    reportedMissingComparisonTableValues.add(key);
    console.warn(
        `SlDomainTableModule: Missing persisted comparison-average trait/gender values for ${key}; cells left blank.`,
    );
}

/**
 * Column definition for one per-student survey measure (Unterrichtsqualität /
 * Selbstwirksamkeit): a vizMode-switching cell over the measure's stats + raw
 * values fields. State rows render empty — the Landesschnitt delivers no
 * survey data.
 * @param {object} config - The fields this column reads and how it renders them.
 * @param {string} config.title - Column header and tooltip text
 * @param {string} config.field - Tabulator field name
 * @param {string} config.dataField - Row data field with box-plot stats
 * @param {string} config.valuesField - Row data field with raw values
 * @param {function(): string} config.boxColor - Resolves the box-plot colour per render
 * @param {function(): string} config.vizModeGetter - Returns the current viz mode
 * @returns {object} Tabulator column definition
 */
function createSurveyMeasureColumn({
    title,
    field,
    dataField,
    valuesField,
    boxColor,
    vizModeGetter,
}) {
    return {
        title,
        field,
        headerSort: false,
        hozAlign: 'center',
        formatter: createVizModeSwitchingFormatter({
            dataField,
            valuesField,
            boxColor,
            tooltipTitle: title,
            vizModeGetter,
            skipTypes: ['state'],
        }),
        widthGrow: COLUMN_GROW_RATIOS.progressBar,
        minWidth: VISUAL_COLUMN_MIN_WIDTHS.progressBar,
        // The cell is a box plot / stacked bar drawn from `dataField`; this
        // column's own field names no row property at all, so it exports
        // nothing. createSurveyMeasureDownloadColumns() carries the numbers.
        download: false,
    };
}

/**
 * SlDomainTableModule - Manages domain overview table for SL
 * @augments SlBaseTableModule
 */
export class SlDomainTableModule extends withTableModeState(SlBaseTableModule, {
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
    /** @type {any[]|null} */
    #allDomainResults = null;
    /** @type {any} */
    #domainTable = null;
    #competenceLevelsData = [];

    constructor(id, container, options = {}) {
        super(id, container, options);
        this.setDefaults({ enableModuleExport: true });
    }

    // ========================================================================
    // BASE CLASS HOOKS
    // ========================================================================

    /**
     * Get active tables for vizMode redraw.
     * @returns {Array} Domain table wrapped in array
     */
    _getActiveTables() {
        return [this.#domainTable];
    }

    /**
     * Render the merged domain table
     * @override
     * @param {object} data - Data for rendering
     * @param {Array} data.allDomainResults - Flattened array of all domain results
     * @param {Map} data.levelDefinitions - Competency level definitions per subject+domain
     * @param {Array} data.competenceLevelsData - Raw competence-level rows including state entries
     * @param {Array} data.teachingQuality - Pre-computed teaching quality stats by class+subject
     * @param {Array} data.selfEfficacyByClass - Self-efficacy data by class
     * @param {object} data.selfEfficacySchool - Self-efficacy data for school
     * @returns {Promise<void>}
     */
    async _doRenderContent(data) {
        // Store shared data (levelDefinitions, teachingQuality, selfEfficacy)
        this._storeCommonRenderData(data);

        // Store domain-specific data
        this.#allDomainResults = data.allDomainResults;
        this.#competenceLevelsData = Array.isArray(data.competenceLevelsData)
            ? data.competenceLevelsData
            : [];

        // Destroy existing table instances before clearing the container
        this._destroyActiveTables();

        // Clear existing content
        this.contentContainer.innerHTML = '';

        const domainTableDiv = this._createTableHost({
            id: `${this.id}-merged-domain`,
            className: 'domain-table-wrapper table-content',
        });

        // Display merged domain table
        this.#domainTable = this.#displayMergedDomainTabulator(
            this.#allDomainResults,
            this._levelDefinitions,
            domainTableDiv.id,
            this._selfEfficacyByClass,
            this._selfEfficacySchool,
        );
    }

    /**
     * KS percentages carried by one delivered comparison-average entry.
     * @param {object} entry - A competence-levels row (school or state average)
     * @returns {{[levelShortName: string]: number}|null} Percentages by level short name, or null
     */
    #getPersistedKsPercentages(entry) {
        if (!Array.isArray(entry?.competenceLevels) || entry.competenceLevels.length === 0) {
            return null;
        }

        /** @type {{[levelShortName: string]: number}} */
        const percentages = {};
        let hasPercentages = false;

        entry.competenceLevels.forEach((level) => {
            const levelKey = typeof level?.nameShort === 'string' ? level.nameShort : '';
            const total = Number(level?.descriptiveStatistics?.total);
            const frequency = Number(level?.descriptiveStatistics?.frequency);
            if (!levelKey || !Number.isFinite(total) || total <= 0 || !Number.isFinite(frequency)) {
                return;
            }

            percentages[levelKey] = (frequency / total) * 100;
            hasPercentages = true;
        });

        return hasPercentages ? percentages : null;
    }

    /**
     * Displays merged domain table using Tabulator with grouping
     * @param {Array<object>} allDomainResults - The rows to show, across every Fach and Domäne.
     * @param {import('../../utils/slLevelDefinitions.js').LevelDefinitions|null} levelDefinitions - Level definitions per Fach/Domäne, which name the Kompetenzstufen columns.
     * @param {string} containerId - Id of the element the table is built in.
     * @param {Array|null} [selfEfficacyByClass] - Per-class Selbstwirksamkeit rows, when the dataset carries the scale.
     * @param {any} [selfEfficacySchool] - The school's Selbstwirksamkeit aggregate.
     * @returns {object|null} The Tabulator instance, or `null` when there is nothing to show.
     */
    #displayMergedDomainTabulator(
        allDomainResults,
        levelDefinitions,
        containerId,
        selfEfficacyByClass = /** @type {any[]|null} */ (null),
        selfEfficacySchool = /** @type {any} */ (null),
    ) {
        if (!Array.isArray(allDomainResults) || allDomainResults.length === 0) return null;

        const container = document.getElementById(containerId);
        if (!container) return null;

        const model = this.#buildDomainLevelModel(allDomainResults, levelDefinitions);
        const columns = this.#buildDomainColumns(model);
        const tableData = this.#buildDomainTableData(
            allDomainResults,
            levelDefinitions,
            selfEfficacyByClass,
            selfEfficacySchool,
            model,
        );

        // Create table
        const tableId = `mergedDomainTable_${Date.now()}`;
        const tableDiv = document.createElement('div');
        tableDiv.id = tableId;
        tableDiv.className = 'domain-table';
        tableDiv.style.marginBottom = '1rem';

        const actualTableDiv = document.createElement('div');
        actualTableDiv.id = tableId + '_table';
        tableDiv.appendChild(actualTableDiv);
        container.appendChild(tableDiv);

        const options = this.#domainTableOptions();

        const table = this.createTable({
            containerId: `${tableId}_table`,
            columns,
            data: tableData,
            options,
        });

        if (table) {
            // The only thing that expands a group here. Tabulator's own `groupClick`
            // option was configured too and never fired once — measured 2026-09-08 by
            // counting calls while clicking a header: the group opened, the counter
            // stayed at zero — so it was deleted rather than left looking load-bearing.
            // Why it does not fire is not worth chasing; this module rewrites the group
            // header (`groupHeader` above returns its own gridcell, and
            // internal/tabulatorAria.js re-roles the row), and the arrow the click is
            // forwarded to is the element Tabulator does listen on.
            table.on('tableBuilt', () => {
                const tableElement = document.getElementById(`${tableId}_table`);
                if (!tableElement) return;

                this.resources.trackDomListener(tableElement, 'click', (e) => {
                    const groupHeader = /** @type {any} */ (e.target).closest('.tabulator-group');
                    // A click on the arrow is already Tabulator's to handle; forwarding
                    // it would toggle twice and land back where it started.
                    if (
                        !groupHeader ||
                        /** @type {any} */ (e.target).closest('.tabulator-group-toggle')
                    ) {
                        return;
                    }
                    const toggleButton = groupHeader.querySelector('.tabulator-group-toggle');
                    if (!toggleButton) return;
                    toggleButton.click();
                    // Was on the dead `groupClick`, so it never ran; kept here so a group
                    // click gives the same feedback a cell click does.
                    this.animateTemporaryElementClass(groupHeader, 'group-click-animation', 100);
                });
            });
        }

        return table;
    }

    /**
     * Collects the trait names, the union of all Kompetenzstufen and the Domänen per Fach.
     * @param {Array<object>} allDomainResults - The rows to show, across every Fach and Domäne.
     * @param {import('../../utils/slLevelDefinitions.js').LevelDefinitions|null} levelDefinitions - Level definitions per Fach/Domäne.
     * @returns {object} `{ traitNames, globalCompetencyLevels, subjectDomainCount }`.
     */
    #buildDomainLevelModel(allDomainResults, levelDefinitions) {
        // Collect trait names from data schema (all is* fields from first student)
        const traitNames = collectTraitNamesFromData(
            allDomainResults,
            (result) => result.summedResults,
        );

        // Collect competency levels from level definitions
        const allCompetencyLevels = new Map();
        allDomainResults.forEach((result) => {
            const competencyLevels = getLevelsForDomain(
                levelDefinitions,
                result.fach,
                result.domaene,
            );
            competencyLevels.forEach((level) => {
                allCompetencyLevels.set(level.stufe, level);
            });
        });
        const globalCompetencyLevels = Array.from(allCompetencyLevels.values());

        // Build a set of subjects with multiple domains (for display text)
        const subjectDomainCount = new Map();
        allDomainResults.forEach((result) => {
            const domains = subjectDomainCount.get(result.fach) ?? new Set();
            if (result.domaene) domains.add(result.domaene);
            subjectDomainCount.set(result.fach, domains);
        });

        return { traitNames, globalCompetencyLevels, subjectDomainCount };
    }

    /**
     * Builds the column definitions of the merged domain table.
     * @param {object} model - The level model.
     * @param {Array<string>} model.traitNames - Trait names present in the data.
     * @param {Array<object>} model.globalCompetencyLevels - Every Kompetenzstufe in this table.
     * @returns {Array<object>} Tabulator column definitions.
     */
    #buildDomainColumns({ traitNames, globalCompetencyLevels }) {
        // Build columns
        const columns = [
            createColumnDef('Klasse', 'klasse', {
                headerSort: false,
                hozAlign: 'center',
                widthGrow: COLUMN_GROW_RATIOS.nameLong,
                minWidth: CLASS_LABEL_COLUMN_MIN_WIDTH,
                formatter: function (cell) {
                    return cell.getValue();
                },
            }),
            // Tabulator's CSV/JSON writers drop row-group headers, so without this
            // the exported rows carry no Fach/Domäne at all. It follows the Klasse
            // column rather than leading, because Tabulator renders a DOM cell for
            // a hidden column too and a leading one would displace the row's first
            // visible cell.
            createDownloadColumn('Fach / Domäne', 'groupBy'),
            // Omitted entirely when the dataset has no such measure — see
            // SlBaseTableModule._hasTeachingQualityData.
            ...(this._hasTeachingQualityData()
                ? [
                      createSurveyMeasureColumn({
                          title: 'Unterrichtsqualität',
                          field: 'teaching_quality',
                          dataField: 'teachingQuality',
                          valuesField: 'teachingQualityValues',
                          boxColor: () => getThemeColors().sl.teachingQuality,
                          vizModeGetter: () => this._state.vizMode,
                      }),
                      ...createSurveyMeasureDownloadColumns({
                          dataField: 'teachingQuality',
                          label: 'Unterrichtsqualität',
                          follows: 'teaching_quality',
                      }),
                  ]
                : []),
            ...(this._hasSelfEfficacyData()
                ? [
                      createSurveyMeasureColumn({
                          title: 'Selbstwirksamkeit',
                          field: 'self_efficacy',
                          dataField: 'selfEfficacy',
                          valuesField: 'selfEfficacyValues',
                          boxColor: () => getThemeColors().sl.selfEfficacy,
                          vizModeGetter: () => this._state.vizMode,
                      }),
                      ...createSurveyMeasureDownloadColumns({
                          dataField: 'selfEfficacy',
                          label: 'Selbstwirksamkeit',
                          follows: 'self_efficacy',
                      }),
                  ]
                : []),
            {
                title: TERM_CONSTANTS.COMP_LEVELS,
                // See classTableModule: stamps the scale popup, overriding the
                // `KS_distribution` alias this header's wording otherwise matches.
                titleFormatter: createGlossaryKeyTitleFormatter('KS'),
                field: 'ks_distribution',
                headerSort: false,
                hozAlign: 'center',
                formatter: createStackedBarFormatter({
                    ...ksDistributionPreset(globalCompetencyLevels, getCompetencyColor),
                    // Resolve competency colors per render (processSegments accepts a
                    // function) so a THEME_CHANGED redraw picks up the new palette
                    // instead of the map baked into this column definition once.
                    colors: (field) =>
                        getCompetencyColor(field.startsWith('ks_') ? field.slice(3) : field),
                    showLabels: false,
                    height: EMBEDDED_BAR_HEIGHT,
                }),
                widthGrow: COLUMN_GROW_RATIOS.progressBar,
                minWidth: VISUAL_COLUMN_MIN_WIDTHS.progressBar,
                download: false,
            },
            // Class and school rows carry counts here, delivered comparison rows
            // carry percentages — as they already do on screen; the Klasse column
            // names the row type.
            ...globalCompetencyLevels.map((level) =>
                createDownloadColumn(`KS ${level.stufe}`, `ks_${level.stufe}`, {
                    follows: 'ks_distribution',
                    // Rounded because the comparison rows' percentages are full floats.
                    // Blank rather than 0 for a row whose scale has no such level: the
                    // columns are the union over every subject, and the row builders
                    // seed every global level with 0 so the bar can drop the empties —
                    // exported as 0 that would read as "no student reached it".
                    accessor: (value, data) =>
                        (data.competencyLevels ?? []).some((l) => l.stufe === level.stufe)
                            ? formatDownloadNumber(value, 1)
                            : '',
                }),
            ),
            {
                title: `Anzahl ${TERM_CONSTANTS.STUDENTS}`,
                field: 'anzahlSus',
                headerSort: false,
                hozAlign: 'right',
                widthGrow: COLUMN_GROW_RATIOS.count,
            },
        ];

        // Gender distribution as one bar
        columns.push({
            title: 'Geschlechtsverteilung',
            field: 'gender_distribution',
            headerSort: false,
            hozAlign: 'center',
            formatter: createStackedBarFormatter({
                ...genderDistributionPreset,
                height: EMBEDDED_BAR_HEIGHT,
            }),
            widthGrow: COLUMN_GROW_RATIOS.progressBar,
            minWidth: VISUAL_COLUMN_MIN_WIDTHS.progressBar,
            download: false,
        });
        // The bar itself is not exported; these columns carry its counts.
        columns.push(
            createDownloadColumn('Männlich', 'gender_male', { follows: 'gender_distribution' }),
            createDownloadColumn('Weiblich', 'gender_female', {
                follows: 'gender_distribution',
            }),
            createDownloadColumn('Divers', 'gender_diverse', {
                follows: 'gender_distribution',
            }),
        );

        // Trait columns - use minWidth + widthGrow:0 to stay narrow (like gender)
        const plainTextFormatter = function (cell) {
            return cell.getValue();
        };
        const traitColumn = createTraitColumns(traitNames, plainTextFormatter);
        if (traitColumn) {
            columns.push(traitColumn);
        }

        return columns;
    }

    /**
     * Builds the table rows: per Fach/Domäne the delivered comparison rows, the computed
     * school row and one row per Klasse.
     * @param {Array<object>} allDomainResults - The rows to show, across every Fach and Domäne.
     * @param {import('../../utils/slLevelDefinitions.js').LevelDefinitions|null} levelDefinitions - Level definitions per Fach/Domäne.
     * @param {Array|null} selfEfficacyByClass - Per-class Selbstwirksamkeit rows.
     * @param {any} selfEfficacySchool - The school's Selbstwirksamkeit aggregate.
     * @param {object} model - The level model from `#buildDomainLevelModel`.
     * @returns {Array<object>} Tabulator row data.
     */
    #buildDomainTableData(
        allDomainResults,
        levelDefinitions,
        selfEfficacyByClass,
        selfEfficacySchool,
        model,
    ) {
        const { traitNames, globalCompetencyLevels, subjectDomainCount } = model;

        // Prepare table data
        const tableData = [];
        const domainGroups = new Map();
        const schoolId = buildCompetenceLevelIndex(this.#competenceLevelsData).schoolId;

        allDomainResults.forEach((result) => {
            const key = `${result.fach}_${result.domaene}`;
            if (!domainGroups.has(key)) {
                domainGroups.set(key, []);
            }
            domainGroups.get(key).push(result);
        });

        domainGroups.forEach((domainResults, _key) => {
            const firstResult = domainResults[0];
            const subjectName = firstResult.fach;
            const domainId = firstResult.domaene;
            const subjectCode = firstResult.subjectCode;
            const competencyLevels = getLevelsForDomain(levelDefinitions, subjectName, domainId);
            // Stamped on every row of this Fach/Domäne: `processSegments` reads `rowData.scaleId`
            // so the bar paints a level name another Fach in the table shares on this ladder.
            const scaleId = firstResult.stats.scaleId;
            const totalStudents = domainResults.reduce(
                (sum, result) => sum + result.stats.nrStudents,
                0,
            );

            const hasSingleDomain = (subjectDomainCount.get(subjectName)?.size ?? 0) <= 1;
            const subjectDomainText = hasSingleDomain
                ? firstResult.fachbezeichnung
                : `${firstResult.fachbezeichnung}: ${firstResult.domaenenbezeichnung}`;

            // One row per delivered comparison average, whatever its type — a state
            // that splits its Landesschnitt by track delivers several, and rendering
            // only the first hid every track after it. The school's own entry is the
            // exception: the computed school row below covers the same population
            // (its distribution is the sum of the class rows) and additionally carries
            // the trait, gender, Unterrichtsqualität and Selbstwirksamkeit values the
            // payload entry has none of.
            const comparisonEntries = findComparisonEntriesForSubjectDomain(
                this.#competenceLevelsData,
                subjectName,
                domainId,
            ).filter((entry) => entry.id !== schoolId);

            if (comparisonEntries.length > 0 && traitNames.length > 0) {
                warnMissingComparisonTableValues(subjectName, domainId);
            }

            const comparisonRows = comparisonEntries.map((entry) => {
                const comparisonRow = {
                    type: entry.type,
                    klasse: entry.name,
                    anzahlSus: '-',
                    subject: subjectName,
                    subjectCode: subjectCode,
                    domain: domainId,
                    scaleId,
                    groupBy: subjectDomainText,
                };

                traitNames.forEach((trait) => {
                    comparisonRow[`trait_${trait}`] = '-';
                });

                ['male', 'female', 'diverse'].forEach((gender) => {
                    comparisonRow[`gender_${gender}`] = null;
                });

                // Levels without a persisted percentage stay absent rather than 0: a
                // zero-height segment reads as "no deviation" instead of "no data".
                // `processSegments` drops absent and zero fields alike, so an empty
                // comparison row renders an empty bar, not a bar summing to 0 %.
                const persistedKsPercentages = this.#getPersistedKsPercentages(entry);
                competencyLevels.forEach((level) => {
                    const persistedPercentage = persistedKsPercentages?.[level.stufe];
                    if (
                        typeof persistedPercentage === 'number' &&
                        Number.isFinite(persistedPercentage)
                    ) {
                        comparisonRow[`ks_${level.stufe}`] = persistedPercentage;
                    }
                });
                comparisonRow.competencyLevels = competencyLevels;

                return comparisonRow;
            });

            // School row
            const schoolRow = {
                type: 'school',
                klasse: 'Schule',
                anzahlSus: totalStudents,
                subject: subjectName,
                subjectCode: subjectCode,
                domain: domainId,
                scaleId,
                groupBy: subjectDomainText,
            };

            const schoolTraitCounts = {};
            const schoolGenderCounts = { male: 0, female: 0, diverse: 0 };
            const schoolKsCounts = {};

            domainResults.forEach((result) => {
                Object.keys(result.stats.traitCounts).forEach((trait) => {
                    schoolTraitCounts[trait] =
                        (schoolTraitCounts[trait] || 0) + (result.stats.traitCounts[trait] || 0);
                });
                ['male', 'female', 'diverse'].forEach((gender) => {
                    schoolGenderCounts[gender] += result.stats.genderCounts[gender] || 0;
                });
                Object.keys(result.stats.ksCounts).forEach((level) => {
                    schoolKsCounts[level] =
                        (schoolKsCounts[level] || 0) + (result.stats.ksCounts[level] || 0);
                });
            });

            traitNames.forEach((trait) => {
                const count = schoolTraitCounts[trait] || 0;
                const percentage =
                    totalStudents > 0 ? ((count / totalStudents) * 100).toFixed(1) : '0.0';
                schoolRow[`trait_${trait}`] = `${percentage}%`;
            });

            ['male', 'female', 'diverse'].forEach((gender) => {
                schoolRow[`gender_${gender}`] = schoolGenderCounts[gender];
            });

            globalCompetencyLevels.forEach((level) => {
                schoolRow[`ks_${level.stufe}`] = 0;
            });
            competencyLevels.forEach((level) => {
                const count = schoolKsCounts[level.stufe] || 0;
                schoolRow[`ks_${level.stufe}`] = count;
            });
            schoolRow.competencyLevels = competencyLevels;

            // Teaching quality for school (per subject, not per domain)
            if (subjectName) {
                const tqData = this._getTeachingQuality('Schule', subjectName);
                if (tqData) {
                    schoolRow.teachingQualityValues = tqData.values;
                    // count sits beside statistics on the entry, so merge it in —
                    // the same shape selfEfficacy is stored in just below.
                    schoolRow.teachingQuality = { ...tqData.statistics, count: tqData.count };
                }
            }

            // Add self-efficacy for school (same for all domains)
            if (selfEfficacySchool && selfEfficacySchool.statistics) {
                schoolRow.selfEfficacy = {
                    ...selfEfficacySchool.statistics,
                    count: selfEfficacySchool.count,
                };
                // Store raw values for stacked bar visualization
                schoolRow.selfEfficacyValues = selfEfficacySchool.values || [];
            }

            tableData.push(...comparisonRows, schoolRow);

            // Class rows
            domainResults.forEach((result) => {
                const classRow = {
                    type: 'class',
                    klasse: result.stammklasse,
                    anzahlSus: result.stats.nrStudents,
                    stammklasse_id: result.stammklasse_id,
                    subject: subjectName,
                    subjectCode: subjectCode,
                    domain: domainId,
                    scaleId,
                    groupBy: subjectDomainText,
                };

                traitNames.forEach((trait) => {
                    classRow[`trait_${trait}`] = result.stats.traitCounts[trait] || 0;
                });

                ['male', 'female', 'diverse'].forEach((gender) => {
                    classRow[`gender_${gender}`] = result.stats.genderCounts[gender] || 0;
                });

                globalCompetencyLevels.forEach((level) => {
                    classRow[`ks_${level.stufe}`] = 0;
                });
                competencyLevels.forEach((level) => {
                    classRow[`ks_${level.stufe}`] = result.stats.ksCounts[level.stufe] || 0;
                });
                classRow.competencyLevels = competencyLevels;

                // Teaching quality for this class and subject
                if (subjectName) {
                    const tqData = this._getTeachingQuality(result.stammklasse_id, subjectName);
                    if (tqData) {
                        classRow.teachingQualityValues = tqData.values;
                        classRow.teachingQuality = { ...tqData.statistics, count: tqData.count };
                    }
                }

                // Add self-efficacy for this class (same for all domains)
                if (selfEfficacyByClass) {
                    const classPerception = selfEfficacyByClass.find(
                        (cp) => cp.className === result.stammklasse_id,
                    );
                    if (classPerception && classPerception.statistics) {
                        classRow.selfEfficacy = {
                            ...classPerception.statistics,
                            count: classPerception.count,
                        };
                        // Store raw values for stacked bar visualization
                        classRow.selfEfficacyValues = classPerception.values || [];
                    }
                }

                tableData.push(classRow);
            });
        });

        return tableData;
    }

    /**
     * Tabulator options of the merged domain table.
     * @returns {object} Tabulator options.
     */
    #domainTableOptions() {
        return {
            pagination: false,
            headerSort: false,
            selectable: false,
            selectableRows: false,
            responsiveLayout: 'hide',
            height: 'auto',
            placeholder: glossaryAnnotator.getRequiredEntryText('general.messages.no-data'),
            disablePresets: true,
            groupBy: 'groupBy',
            groupStartOpen: false,
            // The group header is a row of the grid (internal/tabulatorAria.js re-roles
            // it), and a row needs a cell — Tabulator prepends only the toggle arrow.
            groupHeader: function (value) {
                return `<span role="gridcell">${escapeHtml(value)}</span>`;
            },
            cellVertAlign: 'middle',
            rowFormatter: this._createRowTypeFormatter({
                state: 'state-row',
                school: 'school-row',
            }),
            cellClick: (e, cell) => {
                this.animateTemporaryElementClass(cell.getElement(), 'cell-click-animation', 150);
            },
        };
    }
}
