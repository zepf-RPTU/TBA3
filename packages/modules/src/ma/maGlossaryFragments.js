/**
 * Where each MA card's own glossary fragment mounts in the assembled tree. The cards read
 * their copy at exactly these paths, so the paths live in the package beside the copy; a
 * host's barrel spreads this map into `assembleGlossary`.
 */

import maClassTable from './modules/tables/maClassTable.glossary.json' with { type: 'json' };
import simpleKsBar from './modules/charts/ksBar/simpleKsBar.glossary.json' with { type: 'json' };
import taskRingGrid from './modules/charts/taskRing/taskRingGrid.glossary.json' with { type: 'json' };
import itemSuccessLollipop from './modules/charts/itemSuccessLollipop/itemSuccessLollipop.glossary.json' with { type: 'json' };
import maItemTable from './modules/tables/maItemTable.glossary.json' with { type: 'json' };
import taskRingFocus from './modules/charts/taskRing/taskRingFocus.glossary.json' with { type: 'json' };
import ksDistribution from './modules/charts/ksDistribution/ksDistribution.glossary.json' with { type: 'json' };
import maStudentDataTable from './modules/tables/maStudentDataTable.glossary.json' with { type: 'json' };

export const maGlossaryFragments = {
    'ma.class.class-table': maClassTable,
    'ma.class.competence-distribution': simpleKsBar,
    'ma.items.item-donuts': taskRingGrid,
    'ma.items.item-graph': itemSuccessLollipop,
    'ma.items.item-table': maItemTable,
    'ma.items.task-ring-focus': taskRingFocus,
    'ma.overview.competence-distribution': ksDistribution,
    'ma.student.student-item-table': maStudentDataTable,
};
