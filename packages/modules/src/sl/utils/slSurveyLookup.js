/**
 * The one way to find a group's (or the school's) survey row: `null` for the group
 * names the school, and a Fach matches under its data name.
 */

import { SL_DATASETS } from '../slDatasets.js';
import { teachingQualityKey } from './slSurveyDerivation.js';

/**
 * @param {import('../../common/data/documentStore.js').DocumentStore} documents
 * @param {string|null} groupName - `null` for the school.
 * @param {string} subjectName
 * @returns {import('./slSurveyDerivation.js').TeachingQualityAggregate|null} `null` when the dataset has none for the pair.
 */
export function findTeachingQuality(documents, groupName, subjectName) {
    return (
        documents
            .getDataset(SL_DATASETS.TEACHING_QUALITY_INDEX)
            .get(teachingQualityKey(groupName, subjectName)) ?? null
    );
}

/**
 * @param {import('../../common/data/documentStore.js').DocumentStore} documents
 * @param {string|null} groupName - `null` for the school.
 * @returns {import('./slSurveyDerivation.js').SurveyAggregate|null} `null` when the dataset has none for it.
 */
export function findSelfEfficacy(documents, groupName) {
    return documents.getDataset(SL_DATASETS.SELF_EFFICACY_INDEX).get(groupName) ?? null;
}
