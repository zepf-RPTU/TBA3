/**
 * Collect unique trait identifiers from grouped student data.
 * @param {Array} dataArray - Grouped rows, each holding a set of students.
 * @param {Function} getStudents - Returns one row’s students.
 * @returns {Array<string>} Every trait code that occurs, deduplicated.
 */
export function collectTraitNamesFromData(dataArray, getStudents) {
    const allTraitNames = new Set();
    dataArray.forEach((item) => {
        const students = getStudents(item);
        if (students) {
            for (const student of students) {
                if (student.traits) {
                    for (const trait of student.traits) {
                        allTraitNames.add(trait);
                    }
                }
            }
        }
    });
    return Array.from(allTraitNames);
}

/**
 * Aggregate trait and gender counts from student result rows, counting each student once.
 * A student is a class and an id: ids repeat across classes in the SL payloads.
 * @param {Array} summedResults - Student result rows to count over.
 * @returns {{stats: {nrStudents: number, traitCounts: object, genderCounts: object}}} Distinct head count with trait and gender tallies.
 */
export function aggregateStudentStats(summedResults) {
    if (!summedResults || summedResults.length === 0) {
        return { stats: { nrStudents: 0, traitCounts: {}, genderCounts: {} } };
    }

    const uniqueStudents = new Map();
    summedResults.forEach((student) => {
        const key = `${student.stammklasse}|${student.studentId}`;
        if (student.studentId && !uniqueStudents.has(key)) {
            uniqueStudents.set(key, student);
        }
    });
    const students = Array.from(uniqueStudents.values());

    const stats = {
        nrStudents: students.length,
        traitCounts: {},
        genderCounts: {},
    };

    students.forEach((student) => {
        if (student.traits) {
            for (const trait of student.traits) {
                stats.traitCounts[trait] = (stats.traitCounts[trait] || 0) + 1;
            }
        }

        if (student.gender) {
            stats.genderCounts[student.gender] = (stats.genderCounts[student.gender] || 0) + 1;
        }
    });

    return { stats };
}
