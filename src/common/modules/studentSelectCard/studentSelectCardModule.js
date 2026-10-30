/**
 * StudentSelectCardModule — base for a card that shows one student at a time behind a
 * student selector. The card follows the app's selected student, a signal it gets as
 * its `studentId` option and hands its tables, which follow it themselves; a pick only
 * reports up (`onStudentSelected`), and every switch, its own included, comes back
 * through that signal.
 */

import { ContentModule, createState } from '@tba3/module-base';
import { TERM_CONSTANTS, toStudentSelectItems } from '@tba3/modules/domain';
import { SelectControlModule } from '../controls/selectControlModule.js';

/**
 * @typedef {import('@tba3/module-base').ContentOptions & {
 *   context: import('../../app/appContext.js').AppContext,
 *   studentId: import('@preact/signals-core').ReadonlySignal<string|null>,
 *   onStudentSelected?: (studentId: string) => void,
 * }} StudentSelectCardOptions
 */

/**
 * @abstract
 * @template {StudentSelectCardOptions} [O=StudentSelectCardOptions]
 * @augments {ContentModule<O>}
 */
export class StudentSelectCardModule extends ContentModule {
    /** @type {import('@tba3/module-base').State<{studentId: string|null}> | null} */
    #state = null;
    /** @type {SelectControlModule|null} */
    #selector = null;

    /**
     * The student on show: the `studentId` option, the app's signal, which the card follows.
     * @returns {import('@tba3/module-base').State<{studentId: string|null}>}
     */
    get state() {
        return (this.#state ??= createState({ studentId: this.options.studentId }));
    }

    /** @override */
    _setup() {
        super._setup();
        // Before the first content pass there is no selector, and the pass reads the
        // student.
        this.onChange(
            () => this.state.studentId.value,
            (studentId) => {
                if (studentId && this.#selector) this.#selector.value = studentId;
            },
        );
    }

    // ========================================================================
    // PUBLIC API
    // ========================================================================

    /**
     * The student selector, on the current student, its items the records sorted by name.
     * A pick reports up and changes nothing here: the switch comes back through the signal.
     * @protected
     * @param {Parameters<typeof toStudentSelectItems>[0]} records - The students to choose from.
     * @param {string} containerClass - The selector's own class.
     * @returns {SelectControlModule}
     */
    _createStudentSelector(records, containerClass) {
        this.#selector = SelectControlModule.create(`${this.id}-selector-module`, {
            items: toStudentSelectItems(records),
            value: this.state.studentId.peek(),
            label: TERM_CONSTANTS.STUDENT,
            containerClass,
            selectClass: 'header-module-student-select',
            onChange: ({ value }) => this.options.onStudentSelected?.(value),
        });
        return this.#selector;
    }
}
