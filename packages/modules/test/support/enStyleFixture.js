/**
 * The EN Teilkompetenzen fixture the style-chart suites share: two Domänen with two
 * style categories each, and the group's average per Domäne and category.
 */

/** The slice of the EN config the style charts read. */
export const enConfig = {
    domainIds: ['ho', 'le'],
    domainLabels: ['Hören', 'Lesen'],
    styleCategories: [
        { value: 'global', fieldName: 'globalPercent', label: 'Global' },
        { value: 'detailliert', fieldName: 'detailliertPercent', label: 'Detailliert' },
    ],
};

/** The group's average per `${domain}_${style}` key, in percent. */
export const groupAverages = {
    ho_global: 60,
    ho_detailliert: 50,
    le_global: 70,
    le_detailliert: 40,
};
