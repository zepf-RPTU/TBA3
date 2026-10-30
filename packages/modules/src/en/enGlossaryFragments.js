/**
 * Where each EN card's own glossary fragment mounts in the assembled tree. The cards read
 * their copy at exactly these paths, so the paths live in the package beside the copy; a
 * host's barrel spreads this map into `assembleGlossary`.
 */

import enShared from './enShared.glossary.json' with { type: 'json' };
import enGroupTable from './modules/tables/enGroupTable.glossary.json' with { type: 'json' };
import scatterplotFilter from './modules/charts/scatterplot/scatterplotFilter.glossary.json' with { type: 'json' };
import enItemDetail from './modules/enItemDetail/enItemDetail.glossary.json' with { type: 'json' };
import enItemTable from './modules/tables/enItemTable.glossary.json' with { type: 'json' };
import itemLollipop from './modules/charts/itemLollipop/itemLollipop.glossary.json' with { type: 'json' };
import enCompetenceLevelDistribution from './modules/charts/competenceLevelDistribution/enCompetenceLevelDistribution.glossary.json' with { type: 'json' };
import scatterplot from './modules/charts/scatterplot/scatterplot.glossary.json' with { type: 'json' };
import enStudentDataTable from './modules/tables/enStudentDataTable.glossary.json' with { type: 'json' };

export { EN_GLOSSARY_TERMS } from './enTerms.js';

export const enGlossaryFragments = {
    // The subject's term vocabulary: the entries the annotator matches and the popups show.
    'en.shared': enShared,
    'en.group.group-table': enGroupTable,
    'en.group.scatterplot': scatterplotFilter,
    'en.item-detail': enItemDetail,
    'en.item.item-table': enItemTable,
    'en.item.lollipop': itemLollipop,
    'en.overview.competence-level-distribution': enCompetenceLevelDistribution,
    'en.overview.scatterplot': scatterplot,
    'en.student.student-item-table': enStudentDataTable,
};
