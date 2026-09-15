/**
 * Where each EN card's own glossary fragment mounts in the assembled tree. The cards read
 * their copy at exactly these paths, so the paths live in the package beside the copy; a
 * host's barrel spreads this map into `assembleGlossary`.
 */

import enClassTable from './modules/tables/enClassTable.glossary.json' with { type: 'json' };
import scatterplotFilter from './modules/charts/scatterplot/scatterplotFilter.glossary.json' with { type: 'json' };
import enItemDetail from './modules/enItemDetail/enItemDetail.glossary.json' with { type: 'json' };
import enItemTable from './modules/tables/enItemTable.glossary.json' with { type: 'json' };
import itemLollipop from './modules/charts/itemLollipop/itemLollipop.glossary.json' with { type: 'json' };
import enKsDistribution from './modules/charts/ksDistribution/enKsDistribution.glossary.json' with { type: 'json' };
import scatterplot from './modules/charts/scatterplot/scatterplot.glossary.json' with { type: 'json' };
import enStudentDataTable from './modules/tables/enStudentDataTable.glossary.json' with { type: 'json' };

export const enGlossaryFragments = {
    'en.class.class-table': enClassTable,
    'en.class.scatterplot': scatterplotFilter,
    'en.item-detail': enItemDetail,
    'en.item.item-table': enItemTable,
    'en.item.lollipop': itemLollipop,
    'en.overview.ks-distribution': enKsDistribution,
    'en.overview.scatterplot': scatterplot,
    'en.student.student-item-table': enStudentDataTable,
};
