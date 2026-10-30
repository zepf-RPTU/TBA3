/**
 * SlDomainTableModule — the SL table by Fach: every Fach and Domäne as a
 * row group holding its comparison, school and Lerngruppe rows.
 */

import { parseCompetenceLevels } from '../../../common/domain/competenceLevelAdapter.js';
import {
    createStackedBarFormatter,
    competenceLevelDistributionPreset,
    competenceLevelField,
    toCompetenceLevelFields,
    genderDistributionPreset,
} from '../../../common/tables/stackedBarCell.js';
import { SlBaseTableModule, SL_TABLE_DOCUMENTS } from './slBaseTableModule.js';
import { SL_DATASETS } from '../../slDatasets.js';
import { collectTraitCodesFromData } from '../../utils/slStudentStats.js';
import {
    collectLevelUnion,
    getLevelsForDomain,
    subjectDomainKey,
} from '../../utils/slLevelDefinitions.js';
import { findSelfEfficacy, findTeachingQuality } from '../../utils/slSurveyLookup.js';
import {
    COLUMN_GROW_RATIOS,
    VISUAL_COLUMN_MIN_WIDTHS,
} from '../../../common/tables/columnWidthConstants.js';
import { createColumnDef } from '../../../common/tables/columnFactories.js';
import {
    createCompetenceLevelDistributionColumn,
    createShareDownloadColumns,
    createStudentCountColumn,
    createSurveyMeasureColumns,
    createTraitColumns,
    demographicFields,
    shareSegmentTooltip,
    surveyMeasureFields,
} from './slColumnBuilders.js';
import { createDownloadColumn } from '../../../common/tables/tableExport.js';
import { TERM_CONSTANTS } from '../../../common/domain/terms.js';
import { formatCount, formatShare } from '../../../common/utils/numberFormat.js';
import { group } from 'd3-array';
import { formatChartSubjectDomainLabel } from '../../../common/charts/domainLabelFormatter.js';

/** @typedef {import('../../utils/slStudentStats.js').SlDomainResult} SlDomainResult */
/** @typedef {import('../../../common/tables/columnFactories.js').TableColumnDefinition} TableColumnDefinition */

/**
 * One row group of the table: a Fach/Domäne with the school's result, its groups'
 * results and its Kompetenzstufen ladder.
 * @typedef {object} DomainGroup
 * @property {SlDomainResult} school
 * @property {SlDomainResult[]} groupResults - One result per group, in payload order.
 * @property {string[]} levels - The Fach/Domäne's ladder.
 */

/**
 * The competence-level index's lookup of the comparison value groups of one Fach/Domäne.
 * @typedef {import('../../slCompetenceLevelIndex.js').CompetenceLevelIndex['comparisonsFor']} ComparisonsFor
 */

/**
 * The competence-level count fields of a school or group row: one per level of its own
 * ladder, so a level nobody reached is 0 and a level off the ladder absent.
 * @param {string[]} levels - The row's Fach/Domäne ladder.
 * @param {{[level: string]: number}} competenceLevelCounts - Students per level.
 * @returns {{[field: string]: number}} The `competenceLevel_*` fields.
 */
function competenceLevelCountFields(levels, competenceLevelCounts) {
    return Object.fromEntries(
        levels.map((level) => [competenceLevelField(level), competenceLevelCounts[level] ?? 0]),
    );
}

/**
 * A trait cell's text: the school row shows its share of the school's students, a group
 * row its headcount, a delivered comparison row (no headcounts) the missing mark. The
 * rows hold headcounts throughout, so the CSV does too.
 * @type {import('./slColumnBuilders.js').SubColumnLabel}
 */
function traitCellLabel(row, field) {
    if (row.type !== 'school') return formatCount(row[field]);
    return formatShare(row.studentCount > 0 ? row[field] / row.studentCount : 0);
}

/** @augments SlBaseTableModule */
export class SlDomainTableModule extends SlBaseTableModule {
    /**
     * @override
     * @type {import('../../../common/data/documentStore.js').DocumentList}
     */
    static documents = [
        ...SL_TABLE_DOCUMENTS,
        SL_DATASETS.TRAIT_LABELS,
        SL_DATASETS.DOMAIN_RESULTS,
        SL_DATASETS.SCHOOL_RESULTS,
        SL_DATASETS.COMPETENCE_LEVEL_INDEX,
    ];

    // ========================================================================
    // BASE CLASS HOOKS
    // ========================================================================

    /**
     * @override
     * @returns {Promise<void>}
     */
    async _renderBody() {
        const documents = this.options.context.documents;
        const levelDefinitions = documents.getDataset(SL_DATASETS.LEVEL_DEFINITIONS);
        const groupResults = documents.getDataset(SL_DATASETS.DOMAIN_RESULTS);
        const groupResultsByKey = group(groupResults, (result) =>
            subjectDomainKey(result.subjectName, result.domainId),
        );
        // The school's results are the spine: one per Fach/Domäne, in the groups' order.
        /** @type {DomainGroup[]} */
        const groups = documents
            .getDataset(SL_DATASETS.SCHOOL_RESULTS)
            .map((/** @type {SlDomainResult} */ school) => ({
                school,
                groupResults:
                    groupResultsByKey.get(subjectDomainKey(school.subjectName, school.domainId)) ??
                    [],
                levels: getLevelsForDomain(levelDefinitions, school.subjectName, school.domainId),
            }));

        this.clear();
        if (groups.length === 0) return;

        const traitCodes = collectTraitCodesFromData(
            groupResults,
            (result) => result.studentResults,
        );
        this._createGroupedTable({
            className: 'sl-grouped-table',
            groupBy: 'groupBy',
            rowClasses: { comparison: 'comparison-row', school: 'school-row' },
            columns: this.#buildDomainColumns(
                traitCodes,
                collectLevelUnion(levelDefinitions, groupResults),
            ),
            data: this.#buildDomainTableData(
                groups,
                documents.getDataset(SL_DATASETS.COMPETENCE_LEVEL_INDEX).comparisonsFor,
                traitCodes,
            ),
        });
    }

    /**
     * @param {string[]} traitCodes - The trait codes present in the data.
     * @param {string[]} levels - Every Kompetenzstufe in this table.
     * @returns {TableColumnDefinition[]}
     */
    #buildDomainColumns(traitCodes, levels) {
        const competenceLevelPreset = competenceLevelDistributionPreset(levels);
        const { hasTeachingQuality, hasSelfEfficacy } = this.options.context.documents.getDataset(
            SL_DATASETS.SURVEY_ROWS,
        );
        const vizModeGetter = () => this.vizMode;
        const { context } = this.options;
        return [
            createColumnDef(TERM_CONSTANTS.GROUP, 'groupName', {
                hozAlign: 'left',
                widthGrow: COLUMN_GROW_RATIOS.wide,
            }),
            // Tabulator's CSV/JSON writers drop row-group headers, so this column carries
            // the Fach/Domäne into the export. It follows the Lerngruppe column: Tabulator
            // renders a DOM cell for a hidden column too, and a leading one would displace
            // the row's first visible cell.
            createDownloadColumn('Fach / Domäne', 'groupBy'),
            ...(hasTeachingQuality
                ? createSurveyMeasureColumns({
                      title: TERM_CONSTANTS.TEACHING_QUALITY,
                      dataField: 'teachingQuality',
                      vizModeGetter,
                      glossary: context.glossary,
                  })
                : []),
            ...(hasSelfEfficacy
                ? createSurveyMeasureColumns({
                      title: TERM_CONSTANTS.SELF_EFFICACY,
                      dataField: 'selfEfficacy',
                      vizModeGetter,
                      glossary: context.glossary,
                  })
                : []),
            createCompetenceLevelDistributionColumn({
                field: 'competenceLevelDistribution',
                formatter: createStackedBarFormatter(context.palette, {
                    ...competenceLevelPreset,
                    labelFormatter: (segment) => segment.label,
                    getTooltipContent: shareSegmentTooltip(TERM_CONSTANTS.COMP_LEVEL),
                }),
            }),
            // The bars' shares: group and school rows hold headcounts, delivered
            // comparison rows percentages, and the file states what the bar shows.
            ...createShareDownloadColumns({
                fields: levels.map(competenceLevelField),
                titles: Object.fromEntries(
                    levels.map((level) => [competenceLevelField(level), `KS ${level}`]),
                ),
                follows: 'competenceLevelDistribution',
            }),
            createStudentCountColumn(),
            {
                title: 'Geschlechtsverteilung',
                field: 'gender_distribution',
                formatter: createStackedBarFormatter(context.palette, {
                    ...genderDistributionPreset,
                    getTooltipContent: shareSegmentTooltip(TERM_CONSTANTS.GENDER),
                }),
                widthGrow: COLUMN_GROW_RATIOS.bar,
                minWidth: VISUAL_COLUMN_MIN_WIDTHS.progressBar,
                download: false,
            },
            ...createShareDownloadColumns({
                fields: genderDistributionPreset.fields,
                titles: genderDistributionPreset.labels,
                follows: 'gender_distribution',
            }),
            ...createTraitColumns(
                context.glossary,
                context.documents.getDataset(SL_DATASETS.TRAIT_LABELS),
                traitCodes,
                traitCellLabel,
            ),
        ];
    }

    /**
     * Builds the table rows: per Fach/Domäne the delivered comparison rows, the school
     * row and one row per Lerngruppe.
     * @param {DomainGroup[]} groups - The Fach/Domäne groups, in table order.
     * @param {ComparisonsFor} comparisonsFor
     * @param {string[]} traitCodes - The trait codes present in the data.
     * @returns {Array<{[field: string]: any}>}
     */
    #buildDomainTableData(groups, comparisonsFor, traitCodes) {
        const documents = this.options.context.documents;
        const domainsPerSubject = group(groups, (domainGroup) => domainGroup.school.subjectName);

        return groups.flatMap(({ school, groupResults, levels }) => {
            const { subjectName, domainId, stats } = school;
            const hasSingleDomain =
                /** @type {DomainGroup[]} */ (domainsPerSubject.get(subjectName)).length === 1;

            // Common to every row of this Fach/Domäne. `scaleId` names the ladder, so the
            // bar paints a level name another Fach in the table shares on this one.
            const base = {
                scaleId: groupResults[0]?.stats.scaleId,
                groupBy: formatChartSubjectDomainLabel(
                    subjectName,
                    hasSingleDomain ? null : school.domainName,
                    { abbreviate: false },
                ),
            };

            // One row per delivered comparison population; a state that splits its
            // Landesschnitt by track delivers several. Only the Fach/Domäne's own ladder
            // counts, and a level the row does not list stays absent rather than 0.
            // The school's own payload entry gets no row: the school row below covers
            // the same population (its distribution is the sum of the group rows) and
            // carries the trait, gender and survey values the payload entry lacks.
            const comparisonTableRows = parseCompetenceLevels(
                this.options.context.palette,
                comparisonsFor(subjectName, domainId),
            ).groups.map((comparison) => ({
                type: 'comparison',
                groupName: comparison.name,
                studentCount: null,
                ...base,
                ...demographicFields(
                    traitCodes,
                    () => null,
                    () => null,
                ),
                ...toCompetenceLevelFields(
                    Object.fromEntries(
                        levels
                            .filter((level) => level in comparison.percentages)
                            .map((level) => [level, comparison.percentages[level]]),
                    ),
                ),
            }));

            const schoolRow = {
                type: 'school',
                groupName: TERM_CONSTANTS.SCHOOL,
                studentCount: stats.nrStudents,
                ...base,
                // Headcounts like the group rows; the cell shows the school's as a share.
                ...demographicFields(
                    traitCodes,
                    (trait) => stats.traitCounts[trait] || 0,
                    (gender) => stats.genderCounts[gender] || 0,
                ),
                ...competenceLevelCountFields(levels, stats.competenceLevelCounts),
                // Unterrichtsqualität is per Fach, Selbstwirksamkeit the same for every Domäne.
                ...surveyMeasureFields(
                    'teachingQuality',
                    findTeachingQuality(documents, null, subjectName),
                ),
                ...surveyMeasureFields('selfEfficacy', findSelfEfficacy(documents, null)),
            };

            const groupRows = groupResults.map((result) => ({
                type: 'group',
                groupName: result.groupName,
                studentCount: result.stats.nrStudents,
                ...base,
                ...demographicFields(
                    traitCodes,
                    (trait) => result.stats.traitCounts[trait] || 0,
                    (gender) => result.stats.genderCounts[gender] || 0,
                ),
                ...competenceLevelCountFields(levels, result.stats.competenceLevelCounts),
                ...surveyMeasureFields(
                    'teachingQuality',
                    findTeachingQuality(documents, result.groupName, subjectName),
                ),
                ...surveyMeasureFields(
                    'selfEfficacy',
                    findSelfEfficacy(documents, result.groupName),
                ),
            }));

            return [...comparisonTableRows, schoolRow, ...groupRows];
        });
    }
}

customElements.define('tba-sl-domain-table', SlDomainTableModule);
