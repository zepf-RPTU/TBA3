/**
 * LongitudinalBoxPlotConfig — ChartHostModule descriptor for the longitudinal box plot:
 * Unterrichtsqualität and Selbstwirksamkeit of the selected Bereich, one box per year
 * and measure.
 */

import { computed } from '@preact/signals-core';
import { LongitudinalBoxPlotChart } from './longitudinalBoxPlotChart.js';
import { SL_DATASETS } from '../../../slDatasets.js';
import {
    LONGITUDINAL_DEFAULT_OPTIONS,
    longitudinalDomainExportIdentity,
    longitudinalInitialState,
} from './longitudinalConfigHelpers.js';

/**
 * The card's host; the Bereich is its `domainIndex` option.
 * @typedef {import('./longitudinalConfigHelpers.js').LongitudinalHost<LongitudinalBoxPlotChart>} LongitudinalBoxPlotHost
 */

// ============================================================================
// CONFIG DESCRIPTOR
// ============================================================================

/** @type {import('./longitudinalConfigHelpers.js').LongitudinalConfig<LongitudinalBoxPlotChart>} */
export const longitudinalBoxPlotConfig = {
    glossaryPath: 'sl.longitudinal.boxplot',
    documents: [SL_DATASETS.LONGITUDINAL_SUBJECT_DOMAINS, SL_DATASETS.LONGITUDINAL_SURVEY_BOXES],
    defaultOptions: LONGITUDINAL_DEFAULT_OPTIONS,
    initialState: longitudinalInitialState,

    getExportIdentity: longitudinalDomainExportIdentity,

    /**
     * @param {LongitudinalBoxPlotHost} host
     * @returns {LongitudinalBoxPlotChart}
     */
    createRenderer(host) {
        const documents = host.options.context.documents;
        return new LongitudinalBoxPlotChart(host.chartArea, {
            ...host.rendererOptions,
            // Another Bereich moves the figures in place, as the line charts' series do.
            timeline: computed(() =>
                documents.getDataset(
                    SL_DATASETS.LONGITUDINAL_SURVEY_BOXES,
                    host.state.domainIndex.value,
                ),
            ),
        });
    },
};
