/**
 * The "has rows" level of the SL survey gate: whether the class/subject builders produced
 * at least one Unterrichtsqualität or Selbstwirksamkeit aggregate row. The SL tables ask it
 * of their render data and tba3's header switch of the stored datasets — through this one
 * predicate, so the two cannot disagree.
 */

/**
 * Which survey measures produced rows.
 *
 * Presence is the question, not truthiness: the builders return an empty *array* for a
 * dataset without the scale, which is truthy.
 * @param {{teachingQuality?: Array | null, selfEfficacyByClass?: Array | null, selfEfficacySchool?: object | null}} aggregates - The derived survey datasets.
 * @returns {{hasTeachingQuality: boolean, hasSelfEfficacy: boolean}} Which of them actually produced rows.
 */
export function hasSurveyRows({ teachingQuality, selfEfficacyByClass, selfEfficacySchool }) {
    return {
        hasTeachingQuality: (teachingQuality?.length ?? 0) > 0,
        hasSelfEfficacy: (selfEfficacyByClass?.length ?? 0) > 0 || Boolean(selfEfficacySchool),
    };
}
