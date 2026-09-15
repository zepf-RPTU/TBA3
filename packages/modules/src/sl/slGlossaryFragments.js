/**
 * Where each SL card's own glossary fragment mounts in the assembled tree. The cards read
 * their copy at exactly these paths, so the paths live in the package beside the copy; a
 * host's barrel spreads this map into `assembleGlossary`.
 */

import groupComparison from './modules/charts/groupComparison/groupComparison.glossary.json' with { type: 'json' };
import longitudinalBoxplot from './modules/charts/longitudinal/longitudinalBoxplot.glossary.json' with { type: 'json' };
import longitudinalKsShare from './modules/charts/longitudinal/longitudinalKsShare.glossary.json' with { type: 'json' };
import selfEfficacyLong from './modules/charts/longitudinal/selfEfficacyLong.glossary.json' with { type: 'json' };
import teachingQuality from './modules/charts/longitudinal/teachingQuality.glossary.json' with { type: 'json' };
import infoBox from './modules/infoBox/infoBox.glossary.json' with { type: 'json' };
import classDeviation from './modules/charts/classDeviation/classDeviation.glossary.json' with { type: 'json' };

export const slGlossaryFragments = {
    'sl.comparison.comparison-plot': groupComparison,
    'sl.longitudinal.boxplot': longitudinalBoxplot,
    'sl.longitudinal.parallel.ks-distribution': longitudinalKsShare,
    'sl.longitudinal.parallel.self-efficacy': selfEfficacyLong,
    'sl.longitudinal.parallel.teaching-quality': teachingQuality,
    'sl.results': infoBox,
    'sl.summary.deviation': classDeviation,
};
