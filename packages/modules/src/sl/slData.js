/**
 * The data the SL content cards (info boxes, Materialien) read, as a port: the package names
 * what it needs, and the host answers from wherever it keeps its documents. tba3 answers
 * from its DataStore (`slDataFromStore` in the SL app); a card given no port answers empty.
 */

import { buildCompetenceLevelIndex } from './slCompetenceLevelIndex.js';

/**
 * @typedef {object} SlData
 * @property {() => object|null} infoBoxes - The info-box templates (`info_boxes.json`).
 * @property {() => Array<object>} competenceLevels - `competence-levels.json` rows.
 * @property {() => import('./slCompetenceLevelIndex.js').CompetenceLevelIndex} competenceLevelIndex - Those rows, indexed.
 * @property {() => Array<object>} items - `items.json` rows.
 * @property {() => Array<object>} studentsCompetenceLevels - `students_competence-levels.json` rows.
 * @property {() => {hasTeachingQuality: boolean, hasSelfEfficacy: boolean}} surveyScales - Which survey scales the payload carries.
 * @property {() => Array<object>} teachingQuality - Unterrichtsqualität aggregates per class and Fach.
 * @property {() => Array<object>} selfEfficacyByClass - Selbstwirksamkeit aggregates per class.
 * @property {() => object|null} selfEfficacySchool - The school's Selbstwirksamkeit aggregate.
 */

/**
 * A port with no data, where every read answers empty: what a card falls back to when
 * the host passes none, so it renders its empty states instead of throwing.
 * @returns {SlData} The empty port.
 */
export function emptySlData() {
    return {
        infoBoxes: () => null,
        competenceLevels: () => [],
        competenceLevelIndex: () => buildCompetenceLevelIndex([]),
        items: () => [],
        studentsCompetenceLevels: () => [],
        surveyScales: () => ({ hasTeachingQuality: false, hasSelfEfficacy: false }),
        teachingQuality: () => [],
        selfEfficacyByClass: () => [],
        selfEfficacySchool: () => null,
    };
}
