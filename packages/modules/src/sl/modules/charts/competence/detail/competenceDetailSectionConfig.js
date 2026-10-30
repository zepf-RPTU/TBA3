/**
 * CompetenceDetailSectionConfig — ChartHostModule descriptor for one competence detail
 * section, full-size or as a thumbnail watermark (`thumbnail`). No verb: it follows the shared
 * `vizMode` signal.
 */

import { CompetenceDetailRenderer } from './competenceDetailRenderer.js';
import { selectCompetenceSlice } from '../../../../slCompetenceSlices.js';
import { SL_DATASETS } from '../../../../slDatasets.js';

// ============================================================================
// CONFIG DESCRIPTOR
// ============================================================================

/**
 * @typedef {import('../../../../../common/charts/host/chartHostModule.js').ChartHostOptions & {
 *     subjectName?: string | null,
 *     groupName?: string | null,
 *     showOnlySchoolData?: boolean,
 *     averagesHidden?: boolean,
 *     vizMode: string | import('@preact/signals-core').Signal<string>,
 * }} CompetenceDetailSectionOptions
 */

/**
 * @typedef {{vizMode: string}} CompetenceDetailSectionState
 */

/**
 * @typedef {import('../../../../../common/charts/host/chartHostModule.js').ChartHostModule<CompetenceDetailRenderer, CompetenceDetailSectionOptions, null, CompetenceDetailSectionState>} CompetenceDetailSectionHost
 */

/** @type {import('../../../../../common/charts/host/chartHostModule.js').ChartHostConfig<CompetenceDetailRenderer, CompetenceDetailSectionOptions, null, import('../../../../../common/charts/host/chartHostModule.js').NoVerbs, CompetenceDetailSectionState>} */
export const competenceDetailSectionConfig = {
    documents: [SL_DATASETS.COMPETENCE_LEVEL_INDEX, SL_DATASETS.TEACHING_QUALITY_INDEX],

    defaultOptions: {
        showOnlySchoolData: false,
        averagesHidden: false,
    },

    /**
     * @param {CompetenceDetailSectionHost} host
     * @returns {import('@tba3/module-base').StateInit<CompetenceDetailSectionState>}
     */
    initialState: (host) => ({ vizMode: host.options.vizMode }),

    /**
     * @param {CompetenceDetailSectionHost} host
     * @returns {CompetenceDetailRenderer|null} `null` when nothing matches the selection.
     */
    createRenderer(host) {
        const documents = host.options.context.documents;
        const index = documents.getDataset(SL_DATASETS.COMPETENCE_LEVEL_INDEX);
        const domainBuckets = selectCompetenceSlice(index, {
            subjectName: host.options.subjectName,
            groupName: host.options.groupName,
        });
        if (!domainBuckets) return null;

        return new CompetenceDetailRenderer(host.chartArea, domainBuckets, {
            ...host.rendererOptions,
            groupName: host.options.groupName,
            showOnlySchoolData: host.options.showOnlySchoolData,
            averagesHidden: host.options.averagesHidden,
            vizMode: host.state.vizMode,
            teachingQuality: documents.getDataset(SL_DATASETS.TEACHING_QUALITY_INDEX),
            index,
        });
    },
};
