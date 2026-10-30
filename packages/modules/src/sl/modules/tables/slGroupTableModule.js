/**
 * SlGroupTableModule — the SL table by group: the school and every group as a
 * row group holding one row per Fach and its Selbstwirksamkeit footer.
 */

import {
    processSegments,
    createDOMStackedBar,
    fieldShare,
    competenceLevelDistributionPreset,
    competenceLevelField,
    toCompetenceLevelFields,
} from '../../../common/tables/stackedBarCell.js';
import { SlBaseTableModule, SL_TABLE_DOCUMENTS } from './slBaseTableModule.js';
import { SL_DATASETS } from '../../slDatasets.js';
import { getLevelsForDomain } from '../../utils/slLevelDefinitions.js';
import { findSelfEfficacy, findTeachingQuality } from '../../utils/slSurveyLookup.js';
import {
    collectTraitCodesFromData,
    aggregateSubjectStats,
    studentsOf,
} from '../../utils/slStudentStats.js';
import { createColumnDef } from '../../../common/tables/columnFactories.js';
import { TERM_CONSTANTS } from '../../../common/domain/terms.js';
import { COLUMN_GROW_RATIOS } from '../../../common/tables/columnWidthConstants.js';
import {
    createGenderColumns,
    createCompetenceLevelDistributionColumn,
    createStudentCountColumn,
    createSurveyMeasureColumns,
    createTraitColumns,
    createVizModeSwitchingFormatter,
    demographicFields,
    shareSegmentTooltip,
    surveyMeasureFields,
} from './slColumnBuilders.js';
import { createDownloadColumn } from '../../../common/tables/tableExport.js';
import { MISSING_VALUE, formatCount, formatPercent } from '../../../common/utils/numberFormat.js';
import { percentOf } from '../../../common/domain/itemResultCounts.js';
import { formatDownloadNumber } from '../../../common/tables/downloadNumberFormat.js';
import { group } from 'd3-array';
import { SL_SERIES_COLORS } from '../../utils/slRatingAppearance.js';

/**
 * One Domäne of a group-table row.
 * @typedef {object} DomainData
 * @property {string} domainName - Domäne display name
 * @property {{[level: string]: number}} competenceLevelCounts - Students per Kompetenzstufe
 * @property {string[]} competenceLevelNames - The Domäne's Kompetenzstufen, in ladder order
 * @property {string|undefined} scaleId - The Domäne's ladder
 */

/**
 * The bars' shares (%) for the download, one column per Domäne × Kompetenzstufe.
 * @param {Array<{domains?: DomainData[]}>} rows
 * @returns {import('../../../common/tables/columnFactories.js').TableColumnDefinition[]} The download-only columns.
 */
function competenceLevelShareDownloadColumns(rows) {
    /** @type {Map<string, {domainName: string, levelName: string}>} */
    const pairs = new Map();
    for (const domain of rows.flatMap((row) => row.domains ?? [])) {
        for (const levelName of domain.competenceLevelNames) {
            pairs.set(`${domain.domainName}\u0000${levelName}`, {
                domainName: domain.domainName,
                levelName,
            });
        }
    }
    return [...pairs.values()].map(({ domainName, levelName }, index) =>
        createDownloadColumn(
            domainName ? `${domainName} – KS ${levelName} (%)` : `KS ${levelName} (%)`,
            `competenceLevelShare${index}`,
            {
                follows: 'competenceLevelDistribution',
                accessor: (_value, data) => {
                    const domain = /** @type {DomainData[]} */ (data.domains ?? []).find(
                        (entry) =>
                            entry.domainName === domainName &&
                            entry.competenceLevelNames.includes(levelName),
                    );
                    if (!domain) return formatDownloadNumber(null);
                    return formatDownloadNumber(
                        fieldShare(
                            toCompetenceLevelFields(domain.competenceLevelCounts),
                            domain.competenceLevelNames.map(competenceLevelField),
                            competenceLevelField(levelName),
                        ),
                        1,
                    );
                },
            },
        ),
    );
}

/**
 * A group-table count cell: the count and its share of the row's students.
 * @param {{[field: string]: any}} rowData
 * @param {string} field
 * @returns {string} "count (share)".
 */
function countPercentageLabel(rowData, field) {
    const count = rowData[field] || 0;
    return `${formatCount(count)} (${formatPercent(percentOf(count, rowData.studentCount || 0))})`;
}

/**
 * A formatter for a variable-height cell that stacks one element per Domäne of the row.
 * @param {object} options
 * @param {(domain: DomainData) => HTMLElement} options.createItemElement - The element of one Domäne.
 * @param {string} options.emptyValue - What a row without Domänen shows (the footer).
 * @returns {import('../../../common/tables/columnFactories.js').TableCellFormatter}
 */
function createDomainStackFormatter({ createItemElement, emptyValue }) {
    return function (cell) {
        /** @type {DomainData[]} */
        const domains = cell.getRow().getData().domains ?? [];
        if (domains.length === 0) return emptyValue;

        const container = document.createElement('div');
        container.className = 'sl-stacked-cell';
        container.append(...domains.map(createItemElement));
        return container;
    };
}

/** @typedef {import('../../slDatasets.js').ResultSection} ResultSection */

/** @augments SlBaseTableModule */
export class SlGroupTableModule extends SlBaseTableModule {
    /**
     * @override
     * @type {import('../../../common/data/documentStore.js').DocumentList}
     */
    static documents = [
        ...SL_TABLE_DOCUMENTS,
        SL_DATASETS.TRAIT_LABELS,
        SL_DATASETS.RESULT_SECTIONS,
        SL_DATASETS.SCHOOL_RESULTS,
    ];

    // ========================================================================
    // BASE CLASS HOOKS
    // ========================================================================

    /**
     * Render the table: the school's rows first, then each group's, sorted by name.
     * @override
     * @returns {Promise<void>}
     */
    async _renderBody() {
        const sections = this.options.context.documents
            .getDataset(SL_DATASETS.RESULT_SECTIONS)
            .filter(({ results }) => results.length > 0);

        this.clear();
        if (sections.length === 0) return;

        // The union over every section: a group without a trait shows it at zero.
        const traitCodes = collectTraitCodesFromData(
            sections.map(({ results }) => results),
            studentsOf,
        );
        // A Fach the school sat in several Domänen, whose rows name their Domänen: a
        // group may have sat only one of them.
        const splitSubjects = new Set(
            [
                ...group(
                    this.options.context.documents.getDataset(SL_DATASETS.SCHOOL_RESULTS),
                    (result) => result.subjectName,
                ),
            ]
                .filter(([, results]) => results.length > 1)
                .map(([subjectName]) => subjectName),
        );
        const rows = sections.flatMap((section) =>
            this.#sectionRows(section, traitCodes, splitSubjects),
        );

        this._createGroupedTable({
            className: 'sl-grouped-table sl-group-table',
            groupBy: 'section',
            rowClasses: { school: 'school-row', 'self-efficacy-footer': 'self-efficacy-row' },
            columns: this.#buildColumns(traitCodes, rows),
            data: rows,
        });
    }

    /**
     * One section's rows: one per Fach, then the Selbstwirksamkeit footer.
     * @param {ResultSection} spec
     * @param {string[]} traitCodes - The table's trait columns.
     * @param {Set<string>} splitSubjects - The Fächer the school sat in several Domänen.
     * @returns {Array<{type: string, subjectName: string, domains?: DomainData[], [field: string]: unknown}>}
     */
    #sectionRows({ groupName, results }, traitCodes, splitSubjects) {
        const documents = this.options.context.documents;
        const levelDefinitions = documents.getDataset(SL_DATASETS.LEVEL_DEFINITIONS);
        // The row group's header, and whose rows they are for the export.
        const owner =
            groupName === null
                ? { section: TERM_CONSTANTS.SCHOOL, groupName: TERM_CONSTANTS.SCHOOL }
                : { section: `${TERM_CONSTANTS.GROUP} ${groupName}`, groupName };

        // One entry per Fach, its Domänen in order (the results hold one per Fach × Domäne).
        /** @type {Array<{type: string, subjectName: string, domains?: DomainData[], [field: string]: unknown}>} */
        const rows = [...group(results, (result) => result.subjectName)].map(
            ([subjectName, subjectResults]) => {
                const stats = aggregateSubjectStats(subjectResults);
                return {
                    type: groupName === null ? 'school' : 'group',
                    ...owner,
                    subjectName,
                    splitByDomain: splitSubjects.has(subjectName),
                    /** @type {DomainData[]} */
                    domains: subjectResults.map((result) => ({
                        domainName: result.domainName || '',
                        competenceLevelCounts: result.stats.competenceLevelCounts,
                        competenceLevelNames: getLevelsForDomain(
                            levelDefinitions,
                            result.subjectName,
                            result.domainId,
                        ),
                        // The Domäne's ladder, so its bar paints a level name another
                        // Fach in this table shares on the right ramp.
                        scaleId: result.stats.scaleId,
                    })),
                    studentCount: stats.nrStudents,
                    ...surveyMeasureFields(
                        'teachingQuality',
                        findTeachingQuality(documents, groupName, subjectName),
                    ),
                    ...demographicFields(
                        traitCodes,
                        (trait) => stats.traitCounts[trait] || 0,
                        (gender) => stats.genderCounts[gender] || 0,
                    ),
                };
            },
        );

        // Selbstwirksamkeit is per group, not per Fach: one footer row, which shares the
        // survey column with Unterrichtsqualität and so fills its fields.
        const selfEfficacy = surveyMeasureFields(
            'teachingQuality',
            findSelfEfficacy(documents, groupName),
        );
        if (selfEfficacy.teachingQuality) {
            rows.push({
                type: 'self-efficacy-footer',
                ...owner,
                subjectName: TERM_CONSTANTS.SELF_EFFICACY,
                ...selfEfficacy,
            });
        }
        return rows;
    }

    /**
     * @param {string[]} traitCodes - The trait codes present in any section.
     * @param {Array<{subjectName: string, domains?: DomainData[]}>} rows - The table's rows, whose Fach and Domäne names size their columns and whose Domänen and Kompetenzstufen name the export columns.
     * @returns {import('../../../common/tables/columnFactories.js').TableColumnDefinition[]}
     */
    #buildColumns(traitCodes, rows) {
        const { hasTeachingQuality, hasSelfEfficacy } = this.options.context.documents.getDataset(
            SL_DATASETS.SURVEY_ROWS,
        );
        const vizModeGetter = () => this.vizMode;
        const { context } = this.options;

        // One column serves both measures here: the subject rows carry
        // Unterrichtsqualität and the footer row Selbstwirksamkeit, in the same fields,
        // so it stays as long as either exists. The two formatters differ only in the
        // colour and the tooltip title.
        const [surveyColumn, ...surveyDownloads] = createSurveyMeasureColumns({
            title: TERM_CONSTANTS.TEACHING_QUALITY,
            dataField: 'teachingQuality',
            vizModeGetter,
            glossary: context.glossary,
        });
        const selfEfficacyFormatter = createVizModeSwitchingFormatter({
            dataField: 'teachingQuality',
            boxColor: SL_SERIES_COLORS.selfEfficacy,
            tooltipTitle: TERM_CONSTANTS.SELF_EFFICACY,
            vizModeGetter,
            glossary: context.glossary,
        });
        // createSurveyMeasureColumns always sets a viz-mode-switching formatter.
        const teachingQualityFormatter =
            /** @type {import('../../../common/tables/columnFactories.js').TableCellFormatter} */ (
                surveyColumn.formatter
            );
        const domainLabels = createDomainStackFormatter({
            emptyValue: MISSING_VALUE,
            createItemElement: (domain) => {
                const label = document.createElement('div');
                label.className = 'sl-cell-label';
                label.textContent = domain.domainName;
                return label;
            },
        });

        return [
            createColumnDef(TERM_CONSTANTS.SUBJECT, 'subjectName', {
                hozAlign: 'left',
                widthGrow: COLUMN_GROW_RATIOS.medium,
            }),
            // Tabulator's CSV/JSON writers drop row-group headers, so this column carries
            // the row's owner into the export. It follows the Fach column: Tabulator
            // renders a DOM cell for a hidden column too, and a leading one would displace
            // the row's first visible cell.
            createDownloadColumn(TERM_CONSTANTS.GROUP, 'groupName'),
            ...(hasTeachingQuality || hasSelfEfficacy
                ? [
                      {
                          ...surveyColumn,
                          formatter: (
                              /** @type {import('tabulator-tables').CellComponent} */ cell,
                          ) =>
                              cell.getRow().getData().type === 'self-efficacy-footer'
                                  ? selfEfficacyFormatter(cell)
                                  : teachingQualityFormatter(cell),
                      },
                      ...surveyDownloads,
                  ]
                : []),
            {
                title: TERM_CONSTANTS.DOMAIN,
                field: 'domainNames',
                hozAlign: 'left',
                widthGrow: COLUMN_GROW_RATIOS.medium,
                variableHeight: true,
                tableMeta: {
                    cellWords: (tableRows) =>
                        tableRows.flatMap((row) =>
                            (row.domains ?? []).map(
                                (/** @type {DomainData} */ domain) => domain.domainName,
                            ),
                        ),
                },
                // A Fach the school sat whole names no Domäne.
                formatter: (cell) =>
                    cell.getRow().getData().splitByDomain ? domainLabels(cell) : MISSING_VALUE,
                // The cell stacks one label per Domäne; the row's own field is empty.
                accessorDownload: (_value, data) =>
                    (data.domains ?? [])
                        .map((/** @type {DomainData} */ domain) => domain.domainName)
                        .filter(Boolean)
                        .join(', '),
            },
            createCompetenceLevelDistributionColumn({
                field: 'competenceLevelDistribution',
                variableHeight: true,
                formatter: createDomainStackFormatter({
                    emptyValue: '',
                    createItemElement: (domain) => {
                        const barContainer = document.createElement('div');
                        barContainer.className = 'sl-cell-bar';
                        barContainer.appendChild(
                            createDOMStackedBar(
                                processSegments(
                                    context.palette,
                                    {
                                        ...toCompetenceLevelFields(domain.competenceLevelCounts),
                                        scaleId: domain.scaleId,
                                    },
                                    competenceLevelDistributionPreset(domain.competenceLevelNames),
                                ),
                                {
                                    // Two bars share the cell, one per Domäne.
                                    labelPrefix: domain.domainName,
                                    getTooltipContent: shareSegmentTooltip(
                                        TERM_CONSTANTS.COMP_LEVEL,
                                    ),
                                },
                            ),
                        );
                        return barContainer;
                    },
                }),
            }),
            ...competenceLevelShareDownloadColumns(rows),
            createStudentCountColumn(),
            createGenderColumns(countPercentageLabel),
            ...createTraitColumns(
                context.glossary,
                context.documents.getDataset(SL_DATASETS.TRAIT_LABELS),
                traitCodes,
                countPercentageLabel,
            ),
        ];
    }
}

customElements.define('tba-sl-group-table', SlGroupTableModule);
