/**
 * Where each SL card's own glossary fragment mounts in the assembled tree. The cards read
 * their copy at exactly these paths, so the paths live in the package beside the copy; a
 * host's barrel spreads this map into `assembleGlossary`.
 */

import slShared from './slShared.glossary.json' with { type: 'json' };
import groupComparison from './modules/charts/groupComparison/groupComparison.glossary.json' with { type: 'json' };
import longitudinalBoxplot from './modules/charts/longitudinal/longitudinalBoxplot.glossary.json' with { type: 'json' };
import longitudinalCompetenceLevelShare from './modules/charts/longitudinal/longitudinalCompetenceLevelShare.glossary.json' with { type: 'json' };
import selfEfficacyLong from './modules/charts/longitudinal/selfEfficacyLong.glossary.json' with { type: 'json' };
import teachingQuality from './modules/charts/longitudinal/teachingQuality.glossary.json' with { type: 'json' };
import infoBox from './modules/infoBox/infoBox.glossary.json' with { type: 'json' };
import groupDeviation from './modules/charts/groupDeviation/groupDeviation.glossary.json' with { type: 'json' };

export const slGlossaryFragments = {
    // The subject's term vocabulary: the entries the annotator matches and the popups show.
    'sl.shared': slShared,
    'sl.comparison.comparison-plot': groupComparison,
    'sl.longitudinal.boxplot': longitudinalBoxplot,
    'sl.longitudinal.lines.competence-level-distribution': longitudinalCompetenceLevelShare,
    'sl.longitudinal.lines.self-efficacy': selfEfficacyLong,
    'sl.longitudinal.lines.teaching-quality': teachingQuality,
    'sl.results': infoBox,
    'sl.summary.deviation': groupDeviation,
};
