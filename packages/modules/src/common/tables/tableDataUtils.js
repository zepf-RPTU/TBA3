/**
 * Retain only the requested columns from each row.
 * @param {Array} data - The rows to reduce.
 * @param {Array<string>} columnNames - Fields to keep on each row.
 * @returns {Array} New row objects carrying only the named fields; empty for an empty or non-array input.
 */
export function retainNamedColumns(data, columnNames) {
    if (!Array.isArray(data) || data.length === 0) {
        console.error('Input data must be a non-empty array.');
        return [];
    }

    const existingColumns = new Set(Object.keys(data[0]));
    const missingColumns = columnNames.filter((column) => !existingColumns.has(column));

    if (missingColumns.length > 0) {
        console.error('The following columns do not exist in the data:', missingColumns);
        console.error('Data:', data);
        return [];
    }

    return data.map((entry) => {
        const filteredEntry = {};
        columnNames.forEach((column) => {
            if (entry[column] !== undefined && entry[column] !== null && entry[column] !== '') {
                filteredEntry[column] = entry[column];
            }
        });
        return filteredEntry;
    });
}

/**
 * Read a possibly dot-nested field (e.g. "exercise.name") off a row object.
 * Mirrors Tabulator's own column field resolution.
 * @param {object} obj - The row to read from.
 * @param {string} path - Field name, dot-nested for a path into a sub-object.
 * @returns {any} The value, or undefined when any segment is missing.
 */
export function getNestedValue(obj, path) {
    if (!path.includes('.')) return obj[path];
    let current = obj;
    for (const key of path.split('.')) {
        if (current == null) return undefined;
        current = current[key];
    }
    return current;
}

/**
 * Distinct values of one field across the rows, in first-appearance order.
 * @param {Array} data - The rows to scan.
 * @param {string} fieldName - Field to read, dot-nesting allowed.
 * @returns {Array} The distinct values; empty for an empty or non-array input.
 */
function extractUniqueFieldValues(data, fieldName) {
    if (!Array.isArray(data) || data.length === 0) {
        return [];
    }

    return [...new Set(data.map((item) => getNestedValue(item, fieldName)))].filter(
        (value) => value !== undefined && value !== null && value !== '',
    );
}

/**
 * Turn distinct values into Tabulator's `{value: label}` filter map, with an "Alle" entry first.
 * @param {Array} uniqueValues - The values to offer.
 * @param {Function|null} [transformFunction] - Maps a value to its display label; the raw value is used when absent.
 * @returns {{values: object, sort?: Function|string}} Filter params carrying the label map; the caller may attach a comparator.
 */
function createFilterParamsFromUniqueValues(
    uniqueValues,
    transformFunction = /** @type {Function|null} */ (null),
) {
    const values = { '': 'Alle' };

    uniqueValues.forEach((value) => {
        const label = transformFunction ? transformFunction(value) : value;
        values[value] = label;
    });

    return { values };
}

/**
 * Comparator that sorts filter entries by an explicit order rather than alphabetically.
 * @param {Array<string>} order - The labels, in the order they should appear.
 * @param {boolean} [addAllOption=true] - Append "Alle" to the order when it is not already listed, so it never sorts last by accident.
 * @returns {Function} A comparator ranking by position in `order`.
 */
function createCustomSort(order, addAllOption = true) {
    let sortOrder = order;
    if (addAllOption && !order.includes('Alle')) {
        sortOrder = [...order, 'Alle'];
    }

    return function (a, b) {
        const indexA = sortOrder.indexOf(a);
        const indexB = sortOrder.indexOf(b);

        if (indexA !== -1 && indexB !== -1) {
            return indexA - indexB;
        }
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return a.localeCompare(b);
    };
}

/**
 * Build Tabulator header filter params from unique values in a field.
 * @param {Array} data - The rows the filter choices are drawn from.
 * @param {string} fieldName - Field the filter applies to.
 * @param {Function|null} [transformFunction=null] - Maps a value to its display label.
 * @param {Array|Function|string|null} [sortOrder=null] - An explicit label order, a comparator, or a named sort; alphabetical when absent.
 * @returns {{values: {[value: string]: string}, sort?: Function|string}} Tabulator header-filter params: the label map, and a comparator when an order was given.
 */
export function createListFilter(data, fieldName, transformFunction = null, sortOrder = null) {
    const uniqueValues = extractUniqueFieldValues(data, fieldName);
    const result = createFilterParamsFromUniqueValues(uniqueValues, transformFunction);

    if (sortOrder) {
        if (Array.isArray(sortOrder)) {
            result.sort = createCustomSort(sortOrder);
        } else if (typeof sortOrder === 'string' && (sortOrder === 'asc' || sortOrder === 'desc')) {
            result.sort = function (a, b) {
                if (a === 'Alle') return 1;
                if (b === 'Alle') return -1;

                const comparison = a.localeCompare(b);
                return sortOrder === 'desc' ? -comparison : comparison;
            };
        } else {
            result.sort = sortOrder;
        }
    } else {
        result.sort = function (a, b) {
            if (a === 'Alle') return 1;
            if (b === 'Alle') return -1;
            return a.localeCompare(b);
        };
    }

    return result;
}
