/**
 * `info-boxes.json`: the info-box texts, a site file rather than an API answer. Each
 * box is a list of sections, each section of a declared type, each block a template
 * string or a structured block: a repeat, a material link, or a text with its sublist.
 */

import * as v from 'valibot';

const SectionType = v.looseObject({
    icon: v.string(),
    tooltip: v.string(),
    materialLinkSubjectMode: v.optional(v.string()),
});

const RepeatBlock = v.object({
    repeat: v.picklist(['groups', 'subjects', 'domains']),
    template: v.string(),
});

const LinkBlock = v.object({
    type: v.literal('link'),
    material: v.string(),
    subject: v.string(),
});

/** @typedef {v.InferOutput<typeof RepeatBlock>} RepeatBlock */
/** @typedef {v.InferOutput<typeof LinkBlock>} LinkBlock */

/**
 * A block a sublist may hold: any but a link, which reads its section's link mode.
 * Written out because the sublist makes it recursive, which Valibot cannot infer.
 * @typedef {string | RepeatBlock | {text: string, sublist?: InfoBoxSublistBlock[]}} InfoBoxSublistBlock
 */
/** @typedef {InfoBoxSublistBlock | LinkBlock} InfoBoxBlock */

/** @type {v.GenericSchema<{text: string, sublist?: InfoBoxSublistBlock[]}>} */
const TextBlock = v.object({
    text: v.string(),
    sublist: v.optional(v.array(v.union([v.string(), RepeatBlock, v.lazy(() => TextBlock)]))),
});

const Section = v.looseObject({
    type: v.string(),
    materialLinkSubjectMode: v.optional(v.string()),
    blocks: v.array(v.union([v.string(), RepeatBlock, LinkBlock, TextBlock])),
});

export const InfoBoxes = v.pipe(
    v.looseObject({
        meta: v.looseObject({
            locale: v.string(),
            materialLinkLabel: v.string(),
            quotedLabel: v.string(),
        }),
        sectionTypes: v.record(v.string(), SectionType),
        boxes: v.record(v.string(), v.looseObject({ sections: v.array(Section) })),
    }),
    v.check(
        (document) =>
            Object.values(document.boxes).every((box) =>
                box.sections.every((section) => Object.hasOwn(document.sectionTypes, section.type)),
            ),
        'Every section type must be declared in sectionTypes',
    ),
);

/** @typedef {v.InferOutput<typeof InfoBoxes>} InfoBoxes */
