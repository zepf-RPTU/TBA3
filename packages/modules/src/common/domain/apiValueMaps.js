/**
 * API value → internal/display value translation maps.
 *
 * These maps isolate the boundary between raw API strings (as defined in the
 * TBA3 OpenAPI spec) and the values used throughout the frontend for display,
 * internal state, and export. Each mapping is defined exactly once to ensure
 * consistency across adapters.
 */

/**
 * API gender covariate value → German single-letter display value.
 * Used by EN and MA student data adapters to convert student records.
 *
 * Note: "female" maps to "w" (weiblich) because English and German do not
 * share a first letter for this value. Male→"m" and diverse→"d" are identity
 * conversions but included for consistency and clarity.
 * @type {{[apiValue: string]: string}}
 */
export const GENDER_MAP = { male: 'm', female: 'w', diverse: 'd' };

/**
 * The Ergebnis aggregation value that counts as solved. A reader picks it by value: the
 * spec fixes no order of `aggregations[]`, so position 0 means nothing.
 */
export const RESULT_CORRECT = 'Richtig';

/**
 * MA Ergebnis aggregation value → numeric result code.
 * Used by MA student and item data adapters to normalize item results.
 *
 * The API returns German Ergebnis labels; these are mapped to numeric codes
 * for internal calculations (percentages, sorting) and export.
 * @type {{[apiValue: string]: number}}
 */
export const RESULT_VALUES = { Richtig: 1, Falsch: 0, Unbearbeitet: -1 };
