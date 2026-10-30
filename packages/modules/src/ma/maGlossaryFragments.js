/**
 * Where each MA card's own glossary fragment mounts in the assembled tree. The cards read
 * their copy at exactly these paths, so the paths live in the package beside the copy; a
 * host's barrel spreads this map into `assembleGlossary`.
 */

import maShared from './maShared.glossary.json' with { type: 'json' };
import maGroupTable from './modules/tables/maGroupTable.glossary.json' with { type: 'json' };
import simpleCompetenceLevelBar from './modules/charts/competenceLevelBar/simpleCompetenceLevelBar.glossary.json' with { type: 'json' };
import itemRingGrid from './modules/charts/itemRing/itemRingGrid.glossary.json' with { type: 'json' };
import itemSuccessLollipop from './modules/charts/itemSuccessLollipop/itemSuccessLollipop.glossary.json' with { type: 'json' };
import maItemTable from './modules/tables/maItemTable.glossary.json' with { type: 'json' };
import itemRingFocus from './modules/charts/itemRing/itemRingFocus.glossary.json' with { type: 'json' };
import competenceLevelDistribution from './modules/charts/competenceLevelDistribution/competenceLevelDistribution.glossary.json' with { type: 'json' };
import maStudentDataTable from './modules/tables/maStudentDataTable.glossary.json' with { type: 'json' };

export const maGlossaryFragments = {
    // The subject's term vocabulary: the entries the annotator matches and the popups show.
    'ma.shared': maShared,
    'ma.group.group-table': maGroupTable,
    'ma.group.competence-level-distribution': simpleCompetenceLevelBar,
    'ma.item.item-ring-grid': itemRingGrid,
    'ma.item.item-graph': itemSuccessLollipop,
    'ma.item.item-table': maItemTable,
    'ma.item.item-ring-focus': itemRingFocus,
    'ma.overview.competence-level-distribution': competenceLevelDistribution,
    'ma.student.student-item-table': maStudentDataTable,
};
