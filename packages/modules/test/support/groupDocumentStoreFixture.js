/**
 * EN and MA group-payload factories for unit tests.
 */

import { BOOKLET_PROPERTY } from './competenceLevelGroups.js';

/** @typedef {import('./documentsInHand.js').DocumentsInHand} DocumentsInHand */
/** @typedef {import('../../src/common/data/schemas/items.js').ItemsValueGroup} ItemsValueGroup */
/** @typedef {import('../../src/common/data/schemas/competenceLevels.js').CompetenceLevelsValueGroup} CompetenceLevelsValueGroup */
/** @typedef {ItemsValueGroup['items'][number]} ItemRecord */

/**
 * An `items.json` item with the fields the schema requires: its id, labels, booklet
 * position, Aufgabenniveau and mean.
 * @param {string} iqbId
 * @param {number} solutionShare - Its solution rate, 0–1: the payload's `mean`.
 * @param {{name?: string, exercise?: string}} [labels]
 * @returns {ItemRecord}
 */
export const itemRecord = (iqbId, solutionShare, { name = iqbId, exercise = 'Aufgabe' } = {}) => ({
    iqbId,
    name,
    position: 1,
    exercise: { name: exercise },
    parameters: { competenceLevel: { id: '1', nameShort: 'I' } },
    descriptiveStatistics: { mean: solutionShare },
});

/**
 * An MA item-success lollipop item, its id also its name.
 * @param {string} iqbId
 * @param {string} domainLabel - Its Leitidee.
 * @param {number} meanPercentage - Its solution rate.
 * @param {string} [competenceLevel] - Its Aufgabenniveau.
 * @returns {import('../../src/ma/modules/charts/itemSuccessLollipop/itemSuccessLollipopChart.js').ItemSuccessItem}
 */
export const maLollipopItem = (iqbId, domainLabel, meanPercentage, competenceLevel = 'II') => ({
    iqbId,
    name: iqbId,
    exerciseName: `Übung ${iqbId}`,
    domainLabel,
    meanPercentage,
    competenceLevel,
});

/**
 * A comparison group with a mean per item, typed by its id.
 * @param {string} id - The group id, also its type.
 * @param {string} name
 * @param {Array<[string, number]>} means - Item id and mean, for the items it has one for.
 * @returns {import('../../src/common/domain/itemComparisonGroups.js').ItemComparisonGroup}
 */
export const itemComparisonGroup = (id, name, means) => ({
    id,
    type: id,
    name,
    roleIndex: 0,
    shortLabel: null,
    meanMap: new Map(means),
});

/**
 * An EN lollipop item without result shares, which the tests that read none leave out.
 * @param {string} iqbId
 * @param {string} name
 * @param {string} competenceLevel - Its Aufgabenniveau.
 * @param {number} meanPercentage - Its solution rate.
 * @returns {import('../../src/en/modules/charts/itemLollipop/itemLollipopChart.js').ItemData}
 */
export const lollipopItem = (iqbId, name, competenceLevel, meanPercentage) => ({
    iqbId,
    name,
    competenceLevel,
    domainLabel: 'Hören',
    meanPercentage,
    percentageCorrect: null,
    percentageIncorrect: null,
    percentageNotAttempted: null,
});

/**
 * The group's own `competence-levels.json` value groups of an EN payload, one per domain and
 * with no levels: the least an EN store needs for its config, which throws unless the
 * payload names exactly two domains.
 * @type {readonly import('../../src/common/data/schemas/competenceLevels.js').CurrentCompetenceLevelsValueGroup[]}
 */
export const EN_GROUP_DOMAIN_VALUE_GROUPS = Object.freeze([
    {
        id: 'own-group',
        type: 'group',
        name: 'Lerngruppe',
        domain: { id: 'ho', name: 'Hören' },
        properties: [BOOKLET_PROPERTY],
        competenceLevels: [],
    },
    {
        id: 'own-group',
        type: 'group',
        name: 'Lerngruppe',
        domain: { id: 'le', name: 'Lesen' },
        properties: [BOOKLET_PROPERTY],
        competenceLevels: [],
    },
]);
