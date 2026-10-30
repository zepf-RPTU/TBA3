/**
 * `items.json`: per value group, the test's items with their solution statistics. The
 * item's identity (`iqbId`), its labels (`name`, `exercise.name`) and its solution rate
 * (`descriptiveStatistics.mean`) are what every item table and chart reads, its booklet
 * `position` orders it within its exercise and its Aufgabenniveau (`parameters.competenceLevel`,
 * `id` its slot on the item scale) colours it; the other parameters are optional, each card
 * falls back where one is missing. The value group's `domain` is required here: items are
 * grouped by domain.
 */

import * as v from 'valibot';
import { DescriptiveStatistics, DomainId, OptionalNumber, Text } from './primitives.js';
import { valueGroupEntries } from './valueGroup.js';

/** The item's own level on the item scale the payload carries: `id` is its position. */
export const ItemCompetenceLevel = v.looseObject({ id: Text, nameShort: Text });

/** An item property: `type` names the dimension, `name` the value (its label), `id` its code. */
const Competence = v.looseObject({
    id: v.optional(v.string()),
    type: v.optional(v.string()),
    name: v.optional(v.string()),
});

const Item = v.looseObject({
    iqbId: Text,
    name: v.string(),
    position: v.number(),
    exercise: v.looseObject({ id: v.optional(Text), name: Text }),
    parameters: v.looseObject({
        competenceLevel: ItemCompetenceLevel,
        competences: v.optional(v.array(Competence)),
        solutionFrequencyGymnasium: OptionalNumber,
        solutionFrequencyNonGymnasium: OptionalNumber,
        solutionFrequencyPrimarySchool: OptionalNumber,
    }),
    descriptiveStatistics: DescriptiveStatistics,
});

export const ItemsValueGroup = v.looseObject({
    ...valueGroupEntries,
    domain: v.looseObject({ id: DomainId, name: Text }),
    items: v.array(Item),
});

/** @typedef {v.InferOutput<typeof ItemCompetenceLevel>} ItemCompetenceLevel */
/** @typedef {v.InferOutput<typeof ItemsValueGroup>} ItemsValueGroup */
