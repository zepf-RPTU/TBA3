/**
 * SelfEfficacyLongConfig — ChartHostModule descriptor for the longitudinal
 * Selbstwirksamkeit line chart: the school's, whatever the Bereich, since it is asked once
 * per student.
 */

import { RATING_SERIES } from '../../../utils/slRatingAppearance.js';
import { lineChartConfig, readTimelines } from './longitudinalConfigHelpers.js';

// ============================================================================
// CONFIG DESCRIPTOR
// ============================================================================

export const selfEfficacyLongConfig = lineChartConfig({
    glossaryPath: 'sl.longitudinal.lines.self-efficacy',
    seriesOf: (host) => ({ timeline: readTimelines(host).selfEfficacy, ...RATING_SERIES }),
});
