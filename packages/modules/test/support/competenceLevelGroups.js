/**
 * Competence-levels value groups shaped like the spec, but unlike the fixtures: the
 * group comes last, the comparison populations are far larger than the group, and
 * the group's frequencies are thirds, whose server-rounded `mean` does not stack to 100.
 */

/** @typedef {import('../../src/common/data/schemas/competenceLevels.js').CompetenceLevelsValueGroup} CompetenceLevelsValueGroup */
/** @typedef {import('../../src/common/data/schemas/competenceLevels.js').CurrentCompetenceLevelsValueGroup} CurrentLevelsValueGroup */
/** @typedef {import('../../src/common/data/schemas/competenceLevels.js').StudentCompetenceLevelsValueGroup} StudentLevelsValueGroup */

/**
 * The `booklet` property of a value group whose population sat the given booklet.
 * @param {string} id - The booklet id; comma-joined for a value group pooled over several.
 * @returns {{key: string, value: string}}
 */
export const bookletProperty = (id) => ({ key: 'booklet', value: id });

/** The `booklet` property every `competence-levels.json` value group carries, unless the test is about booklets. */
export const BOOKLET_PROPERTY = Object.freeze(bookletProperty('26-V8-TH-1'));

/**
 * The name properties every student value group carries.
 * @param {string} firstName
 * @param {string} [lastName]
 * @returns {Array<{key: string, value: string}>}
 */
export const nameProperties = (firstName, lastName = 'Muster') => [
    { key: 'firstName', value: firstName },
    { key: 'lastName', value: lastName },
];

/**
 * The name and Lerngruppe every student value group carries.
 * @param {string} groupName - The `group` covariate.
 * @param {string} [firstName]
 * @returns {{properties: Array<{key: string, value: string}>, covariates: Array<{type: string, value: string}>}}
 */
export const studentFields = (groupName, firstName = 'Ada') => ({
    properties: nameProperties(firstName),
    covariates: [{ type: 'group', value: groupName }],
});

/**
 * A competence-levels value group with no levels, named after its id: the least the schema
 * accepts, for tests that read only a value group's identity or properties.
 * @param {Pick<CompetenceLevelsValueGroup, 'id' | 'type'> & Partial<CompetenceLevelsValueGroup>} fields - Its `properties` are added to the booklet.
 * @returns {CurrentLevelsValueGroup}
 */
export const levelsValueGroup = (fields) => ({
    name: fields.id,
    competenceLevels: [],
    ...fields,
    properties: [BOOKLET_PROPERTY, ...(fields.properties ?? [])],
});

/**
 * A value group as the server sends it: `mean` rounded to four decimal places.
 * @param {object} group
 * @param {string} group.id
 * @param {string} group.type - `state`, `school`, `group`, ….
 * @param {string} group.name
 * @param {{[nameShort: string]: number}} group.frequencies - nameShort → headcount.
 * @returns {CurrentLevelsValueGroup}
 */
export function roundedMeanValueGroup({ id, type, name, frequencies }) {
    const total = Object.values(frequencies).reduce((sum, frequency) => sum + frequency, 0);
    return {
        id,
        type,
        name,
        properties: [BOOKLET_PROPERTY],
        competenceLevels: Object.entries(frequencies).map(([nameShort, frequency]) => ({
            nameShort,
            descriptiveStatistics: {
                total,
                frequency,
                mean: total > 0 ? Math.round((frequency / total) * 1e4) / 1e4 : 0,
            },
        })),
    };
}

export const STATE = roundedMeanValueGroup({
    id: 'state',
    type: 'state',
    name: 'Landesschnitt',
    frequencies: { A1: 400, A2: 350, B1: 250 },
});
export const SCHOOL = roundedMeanValueGroup({
    id: 'school',
    type: 'school',
    name: 'Schulschnitt',
    frequencies: { A1: 7, A2: 13, B1: 10 },
});
export const GROUP = roundedMeanValueGroup({
    id: '8a-en',
    type: 'group',
    name: '8a',
    frequencies: { A1: 1, A2: 1, B1: 1 },
});
