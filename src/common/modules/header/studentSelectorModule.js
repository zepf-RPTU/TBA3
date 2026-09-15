/**
 * StudentSelectorModule - Reusable student dropdown selector
 * Creates a dropdown for selecting students and emits events when selection changes.
 * Can be used standalone or as a child module within HeaderModule.
 */

import { BaseModule } from '@tba3/module-base';
import { TERM_CONSTANTS } from '@tba3/modules/domain';

/**
 * StudentSelectorModule - Generic student selector component
 * Can be used as a standalone module or child module
 */
export class StudentSelectorModule extends BaseModule {
    /** @type {string|null} */
    #currentStudentId = null;
    #availableStudents = [];
    /** @type {HTMLSelectElement|null} */
    #selectorElement = null;
    /** @type {(e: any) => void} */
    #handleSelectionChange;

    /**
     * Creates a new StudentSelectorModule instance
     * @param {string} id - Unique identifier for this module
     * @param {string|HTMLElement|null} container - Container element or selector
     * @param {object} options - Configuration options
     * @param {Array<object>} [options.students] - Array of student objects with studentId, lastName, firstName
     * @param {string} [options.defaultStudentId] - Initial selected student ID
     * @param {boolean} [options.sortByName] - Whether to sort students by name (default: true)
     * @param {string} [options.label] - Optional label text to display before dropdown
     * @param {string} [options.containerClass] - Optional owner-local class for the main container
     * @param {string} [options.selectClass] - Optional owner-local class for the select element
     * @param {string} [options.labelClass] - Optional owner-local class for the label
     * @param {Function} [options.onSelectionChanged] - Callback function when selection changes
     */
    constructor(id, container, options = {}) {
        super(id, container, options);

        this.setDefaults({
            students: [],
            defaultStudentId: null,
            sortByName: true,
            label: `${TERM_CONSTANTS.STUDENT}:`,
            containerClass: '',
            selectClass: '',
            labelClass: '',
        });

        // Register callbacks from options if provided
        if (options.onSelectionChanged) {
            this.registerCallback('selectionChanged', options.onSelectionChanged);
        }

        // Bind event handler once
        this.#handleSelectionChange = this.#onSelectionChange.bind(this);
    }

    /**
     * Render the student selector UI
     * @returns {HTMLElement} The rendered selector element
     */
    _doRender() {
        const container = document.createElement('div');
        container.className = [
            'control-field',
            'control-field--inline',
            this.options.containerClass,
        ]
            .filter(Boolean)
            .join(' ');

        // Create select element
        const selectorElement = document.createElement('select');
        this.#selectorElement = selectorElement;
        selectorElement.className = ['control-select', this.options.selectClass]
            .filter(Boolean)
            .join(' ');
        selectorElement.id = `${this.id}-select`;

        // The label is the select's accessible name, so it is bound with `for`.
        if (this.options.label) {
            const label = document.createElement('label');
            label.className = ['control-label', this.options.labelClass].filter(Boolean).join(' ');
            label.htmlFor = selectorElement.id;
            label.textContent = this.options.label;
            container.appendChild(label);
        }

        // Populate options
        this.#populateSelector();

        // Attach event listener
        this.resources.trackDomListener(selectorElement, 'change', this.#handleSelectionChange);

        container.appendChild(selectorElement);

        // Store the element
        this.element = container;

        return container;
    }

    /**
     * Set students data and re-populate the selector
     * @param {Array<object>} students - Array of student objects
     */
    setStudents(students) {
        this.setOptions({ students });
        this.#availableStudents = []; // Clear cache

        if (this.#selectorElement) {
            this.#populateSelector();
        }
    }

    /**
     * Get unique and sorted students from options
     * @returns {Array} Array of unique student objects
     */
    #getProcessedStudents() {
        const students = this.options.students || [];

        // Get unique students
        const uniqueStudents = students.reduce((acc, student) => {
            if (!acc.find((s) => s.studentId === student.studentId)) {
                acc.push({
                    studentId: student.studentId,
                    lastName: student.lastName,
                    firstName: student.firstName,
                });
            }
            return acc;
        }, []);

        // Sort students if option is enabled
        if (this.getOption('sortByName')) {
            uniqueStudents.sort((a, b) => {
                const nameCompare = a.lastName.localeCompare(b.lastName);
                if (nameCompare !== 0) return nameCompare;
                return a.firstName.localeCompare(b.firstName);
            });
        }

        return uniqueStudents;
    }

    /**
     * Populates the selector with student options
     */
    #populateSelector() {
        if (!this.#selectorElement) return;

        this.#selectorElement.innerHTML = '';

        // Use cached students if available, otherwise process
        if (this.#availableStudents.length === 0) {
            this.#availableStudents = this.#getProcessedStudents();
        }

        // Use document fragment for better performance
        const fragment = document.createDocumentFragment();

        // Add options to fragment
        this.#availableStudents.forEach((student) => {
            const option = document.createElement('option');
            option.value = student.studentId;

            option.textContent = `${student.lastName}, ${student.firstName}`;

            fragment.appendChild(option);
        });

        // Single DOM operation
        this.#selectorElement.appendChild(fragment);

        // Set current student
        const defaultId = this.options.defaultStudentId;
        if (defaultId && this.#availableStudents.find((s) => s.studentId === defaultId)) {
            this.#currentStudentId = defaultId;
            this.#selectorElement.value = defaultId;
        } else if (this.#availableStudents.length > 0) {
            // Auto-select first student
            this.#currentStudentId = this.#availableStudents[0].studentId;
            this.#selectorElement.value = this.#currentStudentId ?? '';
        }
    }

    /**
     * Create event data object for student selection
     * @param {string} studentId - Selected student ID
     * @param {string|null} previousStudentId - Previous student ID
     * @returns {object} Event data object
     */
    #createEventData(studentId, previousStudentId) {
        const student = this.#availableStudents.find((s) => s.studentId === studentId);
        return {
            studentId,
            previousStudentId,
            displayName: student ? `${student.lastName}, ${student.firstName}` : null,
            student,
            source: this.id,
        };
    }

    /**
     * Hand the selection to the registered 'selectionChanged' callback
     * @param {object} eventData - Selection data to report
     */
    #emitSelectionEvent(eventData) {
        this.triggerCallback('selectionChanged', eventData);
    }

    /**
     * Handle selection change in the dropdown
     * @param {Event} event - Change event
     */
    #onSelectionChange(event) {
        const studentId = /** @type {HTMLSelectElement} */ (event.target).value;

        if (studentId && studentId !== this.#currentStudentId) {
            const previousStudentId = this.#currentStudentId;
            this.#currentStudentId = studentId;

            this.#emitSelectionEvent(this.#createEventData(studentId, previousStudentId));
        }
    }

    /**
     * Set student programmatically, without emitting a change event
     * @param {string} studentId - Student ID to select
     */
    setStudent(studentId) {
        if (!this.#availableStudents.find((s) => s.studentId === studentId)) {
            console.warn(`StudentSelectorModule[${this.id}]: Student ID "${studentId}" not found`);
            return;
        }

        this.#currentStudentId = studentId;

        if (this.#selectorElement) {
            this.#selectorElement.value = studentId;
        }
    }
}
