/**
 * `competence-levels.json`, `students-competence-levels.json` and `prior-years.json`: value
 * groups with their competence-level distribution. A level is named (`nameShort`) and
 * carries its share (`descriptiveStatistics.mean`, with the headcounts where the source
 * counts); its `description` is prose the payload reader
 * sanitizes, and its id is the band number the value group's `levelColor:`, `standardBand:`
 * and `itemLevelSpan:` properties key on.
 */

import * as v from 'valibot';
import { COVARIATE_TYPE, PROPERTY_KEY } from '../../domain/apiValueMaps.js';
import { isExternalPopulation } from '../../domain/comparisonGroupLabels.js';
import { getPropertyText, readCovariate } from '../../domain/studentIdentity.js';
import { DescriptiveStatistics, Text } from './primitives.js';
import { requiredProperties, studentValueGroupEntries, valueGroupEntries } from './valueGroup.js';

/** A level of a reporting scale. */
export const CompetenceLevel = v.looseObject({
    id: v.optional(Text),
    nameShort: Text,
    description: v.optional(v.string()),
});

const LevelWithStatistics = v.looseObject({
    ...CompetenceLevel.entries,
    descriptiveStatistics: DescriptiveStatistics,
});

export const CompetenceLevelsValueGroup = v.looseObject({
    ...valueGroupEntries,
    competenceLevels: v.array(LevelWithStatistics),
});

/**
 * The first comparison name that goes by two ids: the charts key a comparison track by
 * its name in places, so two ids under one name would be drawn as one track.
 * @param {CompetenceLevelsValueGroup[]} valueGroups
 * @returns {string|null} Null when every comparison name has one id.
 */
function sharedComparisonName(valueGroups) {
    /** @type {Map<string, string>} name → id */
    const idByName = new Map();
    for (const valueGroup of valueGroups.filter(isExternalPopulation)) {
        const id = idByName.get(valueGroup.name);
        if (id !== undefined && id !== valueGroup.id) return valueGroup.name;
        idByName.set(valueGroup.name, valueGroup.id);
    }
    return null;
}

/**
 * The first key two value groups share: one population in one Fach/Domäne and year. The
 * readers key a Fach/Domäne's school, group, student and comparison value groups that way,
 * so a second one under a key would be dropped by one reader and drawn by the next. A
 * student is a Lerngruppe and an id, since ids repeat across Lerngruppen. Like the readers,
 * the key knows no covariate but the Lerngruppe: a payload split by another is rejected, as
 * they would merge it.
 * @param {CompetenceLevelsValueGroup[]} valueGroups
 * @returns {string|null} The shared key as `type|Lerngruppe|id|Fach|Domäne|testPeriod`; null when every key is unique.
 */
function duplicateValueGroupKey(valueGroups) {
    const seen = new Set();
    for (const valueGroup of valueGroups) {
        const parts = [
            valueGroup.type,
            readCovariate(valueGroup.covariates, COVARIATE_TYPE.GROUP) ?? '',
            valueGroup.id,
            valueGroup.subject?.name ?? '',
            valueGroup.domain?.id ?? '',
            getPropertyText(valueGroup.properties, PROPERTY_KEY.TEST_PERIOD) ?? '',
        ];
        // Compared as JSON: an id that contains `|` must not collide with its neighbours.
        const key = JSON.stringify(parts);
        if (seen.has(key)) return parts.join('|');
        seen.add(key);
    }
    return null;
}

/**
 * A competence-levels document over value groups of `valueGroupSchema`, with the rules
 * that compare its value groups.
 * @template {v.GenericSchema<unknown, CompetenceLevelsValueGroup>} TValueGroup
 * @param {TValueGroup} valueGroupSchema
 * @returns {v.GenericSchema<unknown, v.InferOutput<TValueGroup>[]>}
 */
const competenceLevelsDocument = (valueGroupSchema) =>
    v.pipe(
        v.array(valueGroupSchema),
        v.check(
            (valueGroups) => sharedComparisonName(valueGroups) === null,
            (issue) =>
                `Two comparison populations share the name '${sharedComparisonName(
                    /** @type {CompetenceLevelsValueGroup[]} */ (issue.input),
                )}' under different ids`,
        ),
        v.check(
            (valueGroups) => duplicateValueGroupKey(valueGroups) === null,
            (issue) =>
                `Two value groups share the key '${duplicateValueGroupKey(
                    /** @type {CompetenceLevelsValueGroup[]} */ (issue.input),
                )}' (type|Lerngruppe|id|Fach|Domäne|testPeriod)`,
        ),
    );

export const CompetenceLevelsDocument = competenceLevelsDocument(CompetenceLevelsValueGroup);

/**
 * `competence-levels.json`: the current year's group, school and comparison value groups,
 * each naming the booklets its population sat (`properties[booklet]`), which decides
 * whether its Lösungsquoten can be compared.
 */
const CurrentCompetenceLevelsValueGroup = v.looseObject({
    ...CompetenceLevelsValueGroup.entries,
    properties: requiredProperties(PROPERTY_KEY.BOOKLET),
});
export const CurrentCompetenceLevelsDocument = competenceLevelsDocument(
    CurrentCompetenceLevelsValueGroup,
);

/** `students-competence-levels.json`: one value group per student and Fach/Domäne. */
const StudentCompetenceLevelsValueGroup = v.looseObject({
    ...CompetenceLevelsValueGroup.entries,
    ...studentValueGroupEntries,
});
export const StudentCompetenceLevelsDocument = competenceLevelsDocument(
    StudentCompetenceLevelsValueGroup,
);

/** @typedef {v.InferOutput<typeof CompetenceLevel>} CompetenceLevel */
/** @typedef {v.InferOutput<typeof LevelWithStatistics>} LevelWithStatistics */
/** @typedef {v.InferOutput<typeof CompetenceLevelsValueGroup>} CompetenceLevelsValueGroup */
/** @typedef {v.InferOutput<typeof CurrentCompetenceLevelsValueGroup>} CurrentCompetenceLevelsValueGroup */
/** @typedef {v.InferOutput<typeof StudentCompetenceLevelsValueGroup>} StudentCompetenceLevelsValueGroup */
