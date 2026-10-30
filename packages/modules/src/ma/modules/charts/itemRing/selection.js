/**
 * Who an item ring stands for besides the group: the selected students, judged against
 * the group, and the name they go by.
 */

import { formatStudentFullName } from '../../../../common/domain/studentIdentity.js';

/** @typedef {{studentId: string, firstName: string, lastName: string}} RingStudent */

/**
 * A ring's selection, judged once per draw.
 * @typedef {object} RingSelection
 * @property {ReadonlyArray<string>|null} ids - The selected students; empty or `null` is the whole group.
 * @property {boolean} isSubset - Whether a proper subset is selected: the figures, the student tick and every line naming the selection follow it. A selection of everyone reads as none.
 * @property {string} name - What the selection is called: the student's name for one, a label for several; empty without a proper subset.
 */

/**
 * The student an item-ring card stands for: one selected student makes the card theirs;
 * none or several is the group card with a highlight, the same card either way.
 * @param {ReadonlyArray<string>|null|undefined} selectedStudents
 * @returns {string|null}
 */
export function soleSelectedStudent(selectedStudents) {
    return Array.isArray(selectedStudents) && selectedStudents.length === 1
        ? String(selectedStudents[0])
        : null;
}

/**
 * The selection that marks one student, or the group's for none.
 * @param {string|null} studentId
 * @returns {string[]|null}
 */
export function studentSelection(studentId) {
    return studentId ? [studentId] : null;
}

/**
 * Judge a selection against the group and name it.
 * @param {import('../../../../common/glossary/glossaryAnnotator.js').GlossaryAnnotator} glossary - Names a selection of several.
 * @param {ReadonlyArray<string>|null} ids - The selected students.
 * @param {ReadonlyArray<RingStudent>} students - Every student of the group.
 * @returns {RingSelection}
 */
export function ringSelection(glossary, ids, students) {
    const idSet = new Set(ids ?? []);
    const matchCount = students.filter((student) => idSet.has(student.studentId)).length;
    const isSubset = matchCount > 0 && matchCount < students.length;
    return { ids, isSubset, name: isSubset ? selectionName(glossary, ids, students) : '' };
}

/**
 * @param {import('../../../../common/glossary/glossaryAnnotator.js').GlossaryAnnotator} glossary
 * @param {ReadonlyArray<string>|null} ids
 * @param {ReadonlyArray<RingStudent>} students
 * @returns {string} The full name of the one student selected, else the label for selected students.
 */
function selectionName(glossary, ids, students) {
    const studentId = soleSelectedStudent(ids);
    const student = studentId === null ? null : students.find((s) => s.studentId === studentId);
    return student
        ? formatStudentFullName(student)
        : glossary.getRequiredEntryText('ma.item.item-ring-grid.tooltips.selected-students');
}
