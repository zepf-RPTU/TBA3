/**
 * Shared base for a student's item-result tables, and their level presets. The table
 * follows its `studentId` option; the subclass supplies the student's rows and the table
 * they go into.
 */

import { TableModule } from './tableModule.js';
import { followStudent } from './tableModeController.js';
import { compareItemCompetenceLevelToReportedSpan } from '../domain/levels.js';
import { RESULT_CODE } from '../domain/apiValueMaps.js';

/**
 * @typedef {import('./tableModule.js').TableOptions & {
 *   studentId?: import('@preact/signals-core').ReadonlySignal<string|null> | string | null,
 * }} StudentTableOptions
 */

/**
 * The item slots the level a student reached covers, for one row's item.
 * @typedef {(row: {[field: string]: any}) =>
 *   import('../services/competenceScalePayload.js').ItemLevelSpan|null|undefined} ReachedSpanOf
 */

/**
 * One student as the table shows them.
 * @typedef {object} StudentRows
 * @property {Array<{[field: string]: any}>} rows - One row per item the student sat.
 * @property {ReachedSpanOf} reachedSpanOf - What the level presets compare each row's Aufgabenniveau with.
 */

/**
 * @template {StudentTableOptions} [O=StudentTableOptions]
 * @augments {TableModule<O>}
 */
export class BaseStudentDataTableModule extends TableModule {
    /** @type {import('./tableModeController.js').TableModeController<string|null>} The student shown: the app's signal, or a fixed id. */
    #student;
    /** @type {ReachedSpanOf} The shown student's, read by the level presets when they filter. */
    #reachedSpanOf = () => null;

    /** @override */
    _setup() {
        super._setup();
        this.#student = followStudent(this, this.options.studentId);
    }

    // ========================================================================
    // BASE CLASS HOOKS
    // ========================================================================

    /**
     * One student's item rows and reached level, read from the `documents` store.
     * @abstract
     * @param {string} _studentId
     * @returns {StudentRows|null} `null` for a student the store does not have.
     */
    _readStudent(_studentId) {
        throw new Error(`${this.constructor.name} must implement _readStudent(studentId)`);
    }

    /**
     * The table the student's rows go into.
     * @abstract
     * @returns {import('./tableModule.js').RowsSpec}
     */
    _tableSpec() {
        throw new Error(`${this.constructor.name} must implement _tableSpec()`);
    }

    /**
     * "Unter KS" and "Über KS", against the level the shown student reached.
     * @override
     */
    _getPresets() {
        return createStudentLevelPresets(this.options.context.palette, (row) =>
            this.#reachedSpanOf(row),
        );
    }

    // ========================================================================
    // LIFECYCLE
    // ========================================================================

    /**
     * @override
     * @returns {Promise<void>}
     */
    async _renderBody() {
        const studentId = this.#student.value;
        const student = studentId ? this._readStudent(studentId) : null;
        if (!student || student.rows.length === 0) {
            this.clear();
            return;
        }
        this.#reachedSpanOf = student.reachedSpanOf;
        await this.setRows(student.rows, this._tableSpec());
    }

    // ========================================================================
    // PUBLIC API
    // ========================================================================

    /**
     * One instance serves every student — a render swaps its rows in place, so
     * the student belongs in the export target id.
     * @override
     */
    getExportIdentity() {
        return this.#student.value;
    }
}

/**
 * "Unter KS" (items below the level the student reached, not solved) and "Über KS"
 * (items above it, solved), in item-number order. The reached level is read when the
 * filter runs, so the presets outlive a student switch.
 * Each entry's label abbreviates the rule, its tooltip spells it out.
 * @param {import('../services/competenceLevelPalette.js').CompetenceLevelPalette} palette - Relates the levels.
 * @param {ReachedSpanOf} reachedSpanOf
 * @returns {import('./preset.js').PresetSpec[]}
 */
function createStudentLevelPresets(palette, reachedSpanOf) {
    const preset = (
        /** @type {string} */ key,
        /** @type {(row: import('./columnFactories.js').RowData) => boolean} */ keep,
    ) => ({ key, sort: /** @type {const} */ ({ column: 'name', dir: 'asc' }), filters: [keep] });
    // The item's Aufgabenniveau against the slots the student's level covers: negative
    // below, positive above; an unrelatable pair is 0, neither below nor above.
    const levelDiff = (/** @type {import('./columnFactories.js').RowData} */ row) =>
        compareItemCompetenceLevelToReportedSpan(
            palette,
            row.competenceLevel,
            reachedSpanOf(row),
        ) ?? 0;
    return [
        preset(
            'below-competence-level',
            (row) => row.resultCode !== RESULT_CODE.CORRECT && levelDiff(row) < 0,
        ),
        preset(
            'above-competence-level',
            (row) => row.resultCode === RESULT_CODE.CORRECT && levelDiff(row) > 0,
        ),
    ];
}
