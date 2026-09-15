/**
 * enItemTaskGrouping.js — Utility for grouping flat item data into task-level rows.
 *
 * Groups items by `exercise.name` and produces aggregated parent rows
 * with `_children` arrays for Tabulator's dataTree feature.
 *
 * Aggregation rules:
 *   - Percentages: simple average across the child items that have one
 *   - Counts: sum of child counts
 *   - competenceLevel: GER range string ("A1.1–B2.1"), or single value if all equal
 *   - Styles: union of all child styles, priority-sorted
 *   - name: shared prefix extracted from children's name values
 */

import { getItemLevelOrdinal, parseItemLevel } from '../../../common/domain/levels.js';
import { sortStylesByPriority } from './enStyleTableUtils.js';

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Group flat items by `exercise.name` into task-level parent rows
 * with `_children` arrays suitable for Tabulator dataTree.
 * @param {Array<object>} items - Flat array of preprocessed item objects
 * @param {Array<{value: string, fieldName: string, label: string}>} styleCategories - Aufgabenniveau vocabulary, which fixes the order the union of child styles is sorted into.
 * @returns {Array<object>} Array of task rows, each with `_children`
 */
export function groupItemsByTask(items, styleCategories) {
    if (!items || items.length === 0) return [];

    // Group items by exercise.name (preserving encounter order)
    const taskMap = new Map();
    for (const item of items) {
        const key = item.exercise?.name || 'Unbekannt';
        if (!taskMap.has(key)) {
            taskMap.set(key, []);
        }
        taskMap.get(key).push(item);
    }

    // Build parent rows
    const taskRows = [];
    for (const [exerciseName, children] of taskMap) {
        taskRows.push(buildTaskRow(exerciseName, children, styleCategories));
    }

    return taskRows;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Build a single aggregated task row from its child items.
 * @param {string} exerciseName - Task name (group key)
 * @param {Array<object>} children - The item rows that belong to this task
 * @param {Array<{value: string, fieldName: string, label: string}>} styleCategories - Aufgabenniveau vocabulary, which fixes the order the union of child styles is sorted into.
 * @returns {object} Task-level row with _children array
 */
function buildTaskRow(exerciseName, children, styleCategories) {
    const n = children.length;

    // --- Percentages (simple average) ---
    const avgCorrect = average(children, 'percentageCorrect');
    const avgIncorrect = average(children, 'percentageIncorrect');
    const avgNotAttempted = average(children, 'percentageNotAttempted');
    const avgMean = average(children, 'meanPercentage');

    // --- Counts (sum) ---
    const totalCorrect = sum(children, 'correctCount');
    const totalIncorrect = sum(children, 'incorrectCount');
    const totalNotAttempted = sum(children, 'notAttemptedCount');

    // --- Competence level range ---
    const levelRange = buildCompetenceLevelRange(children);

    // --- Styles (union, priority-sorted) ---
    const allStyles = new Set();
    for (const child of children) {
        const styles = child.combinedStyles || child.style || [];
        for (const s of styles) allStyles.add(s);
    }
    const combinedStyles = sortStylesByPriority([...allStyles], styleCategories);

    // --- Name prefix ---
    const taskPrefix = extractTaskPrefix(children.map((c) => c.name));

    // --- Domain info (from first child — all children share the same domain within a task) ---
    const first = children[0];

    // Use a synthetic taskId that is stable across re-renders
    const taskId = `task::${exerciseName}::${first.domain || ''}`;

    return {
        // Identity
        taskId,
        iqbId: taskId, // re-use as key so D3 joins work seamlessly
        isTaskRow: true,

        // Display fields
        name: taskPrefix,
        exercise: { name: exerciseName },
        competenceLevel: levelRange.display, // e.g. "A1.1–B2.1" or "A2.1"
        competenceLevelsRaw: levelRange.raw, // unique item levels, ascending on the item scale

        // Aggregated percentages (raw numbers, formatted by Tabulator column)
        percentageCorrect: avgCorrect,
        percentageIncorrect: avgIncorrect,
        percentageNotAttempted: avgNotAttempted,
        meanPercentage: avgMean,

        // Aggregated counts
        correctCount: totalCorrect,
        incorrectCount: totalIncorrect,
        notAttemptedCount: totalNotAttempted,

        // Styles
        combinedStyles,
        primaryStyle: combinedStyles.length > 0 ? combinedStyles[0] : '',

        // Domain (same for all children)
        domain: first.domain,
        domainLabel: first.domainLabel,

        // Metadata
        itemCount: n,

        // Tabulator dataTree children
        _children: children,
    };
}

/**
 * Extract the shared task-level prefix from a set of item name strings.
 *
 * Examples:
 *   ["BM 01.1", "BM 01.2", "BM 01.9"] → "BM 01"
 *   ["BM 02.1.01.0", "BM 02.2a"]       → "BM 02"
 *   ["EM 01.1"]                          → "EM 01"
 *
 * Strategy: extract the letter prefix + first padded number segment.
 * Falls back to the longest common prefix if the regex doesn't match.
 * @param {string[]} names - Array of item name strings
 * @returns {string} Shared task prefix
 */
function extractTaskPrefix(names) {
    if (!names || names.length === 0) return '';
    if (names.length === 1) {
        // Single item — still extract prefix
        return extractPrefixFromSingle(names[0]);
    }

    // Try regex extraction: letters + space + first number group
    const prefixes = names.map(extractPrefixFromSingle).filter(Boolean);
    if (prefixes.length > 0 && new Set(prefixes).size === 1) {
        return prefixes[0];
    }

    // Fallback: longest common string prefix (trimming trailing dots/spaces)
    return longestCommonPrefix(names).replace(/[\s.]+$/, '') || names[0];
}

/**
 * Extract prefix from a single item name string.
 * Matches pattern: optional letter prefix + first number (before first dot).
 * E.g. "BM 01.2.3" → "BM 01", "01.3" → "01"
 * @param {string} s - One item's `name` value.
 * @returns {string} The prefix, or the input unchanged when it matches no known pattern.
 */
function extractPrefixFromSingle(s) {
    if (typeof s !== 'string') return '';
    const match = s.match(/^([A-Za-z]+\s*)?\d+/);
    return match ? match[0] : s;
}

/**
 * Compute the longest common string prefix of an array of strings.
 * @param {string[]} strs - The strings to compare.
 * @returns {string} The shared leading substring, empty when they share none.
 */
function longestCommonPrefix(strs) {
    if (strs.length === 0) return '';
    let prefix = strs[0];
    for (let i = 1; i < strs.length; i++) {
        while (strs[i].indexOf(prefix) !== 0) {
            prefix = prefix.slice(0, -1);
            if (!prefix) return '';
        }
    }
    return prefix;
}

/**
 * Build a competence level range display string from child items. Levels are the item
 * levels as sent (`A1.1` … `C1.2`); anything that is not one is left out of the range.
 * @param {Array<object>} children - The item rows the task aggregates.
 * @returns {{ display: string, raw: string[] }} The range as one label — `N/A` when no child carries a parseable level — plus the distinct levels ascending, which the cell formatter colours from.
 */
function buildCompetenceLevelRange(children) {
    const levels = [
        ...new Set(
            children
                .map((c) => c.competenceLevel)
                .filter((level) => parseItemLevel(level) !== null),
        ),
    ].sort((a, b) => getItemLevelOrdinal(a) - getItemLevelOrdinal(b));

    if (levels.length === 0) {
        return { display: 'N/A', raw: [] };
    }

    const min = levels[0];
    const max = levels[levels.length - 1];

    return {
        display: min === max ? min : `${min}–${max}`,
        raw: levels,
    };
}

/**
 * Simple average of a numeric or percentage-string field across the items that have
 * one. An item without a value (no responses) is left out rather than counted as 0 %.
 * @param {Array<object>} items - The item rows to average over.
 * @param {string} field - The field to read from each row.
 * @returns {number|null} The mean, or `null` when no item has a value.
 */
function average(items, field) {
    const values = items.map((item) => parseNumeric(item[field])).filter((v) => v !== null);
    if (values.length === 0) return null;
    return values.reduce((acc, value) => acc + value, 0) / values.length;
}

/**
 * Sum a numeric field across items.
 * @param {Array<object>} items - The item rows to total.
 * @param {string} field - The field to read from each row.
 * @returns {number} The total; a row whose value is not numeric contributes `0`.
 */
function sum(items, field) {
    return items.reduce((acc, item) => acc + (Number(item[field]) || 0), 0);
}

/**
 * Parse a value that may be a "XX.X%" string or a number.
 * @param {string|number|null|undefined} val - The raw cell value.
 * @returns {number|null} Its numeric value, or `null` when it has none.
 */
function parseNumeric(val) {
    const numeric = typeof val === 'string' ? parseFloat(val) : val;
    return typeof numeric === 'number' && Number.isFinite(numeric) ? numeric : null;
}
