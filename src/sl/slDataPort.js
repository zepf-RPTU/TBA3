/**
 * tba3's answer to the SL content cards' data port (`SlData` in `@tba3/modules/sl/slData.js`):
 * every read goes to the DataStore, through the datasets `defineSlDatasets` declares.
 */

import { getCompetenceLevelIndex, getSurveyScales } from './slDataService.js';
import { SL_DATA_KEYS } from './slDataKeys.js';

/**
 * The port over one DataStore. Built where a card is constructed; it holds no state of its
 * own, so building it twice costs nothing.
 *
 * Every derived payload comes from the dataset catalog, so a card and the view around it
 * read the one cached build rather than two that could disagree.
 * @param {import('../common/services/dataStore.js').DataStore} dataStore - The SL DataStore.
 * @returns {import('@tba3/modules/sl/slData.js').SlData} The port.
 */
export function slDataFromStore(dataStore) {
    const raw = (key) => dataStore.getRawData(key);
    return {
        infoBoxes: () => raw(SL_DATA_KEYS.INFO_BOXES) ?? null,
        competenceLevels: () => raw(SL_DATA_KEYS.COMPETENCE_LEVELS) ?? [],
        competenceLevelIndex: () => getCompetenceLevelIndex(dataStore),
        items: () => raw(SL_DATA_KEYS.ITEMS) ?? [],
        studentsCompetenceLevels: () => raw(SL_DATA_KEYS.STUDENTS_COMPETENCE_LEVELS) ?? [],
        surveyScales: () => getSurveyScales(dataStore),
        teachingQuality: () => dataStore.getDataset(SL_DATA_KEYS.TEACHING_QUALITY),
        selfEfficacyByClass: () => dataStore.getDataset(SL_DATA_KEYS.SELF_EFFICACY_BY_CLASS),
        selfEfficacySchool: () => dataStore.getDataset(SL_DATA_KEYS.SELF_EFFICACY_SCHOOL),
    };
}
