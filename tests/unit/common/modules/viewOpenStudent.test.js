// @vitest-browser

import { describe, expect, it, vi } from 'vitest';

import { BaseViewModule } from '../../../../src/common/modules/baseViewModule.js';
import { mountModule } from '../../../../packages/modules/test/support/dom.js';
import { viewOptions } from '../../support/viewOptions.js';

/** A view with nothing to render: only its student navigation is under test. */
class View extends BaseViewModule {
    /** @override */
    async _renderView() {}

    /** @param {string} studentId */
    open(studentId) {
        this._openStudent(studentId);
    }
}
customElements.define('test-open-student-view', View);

describe('BaseViewModule._openStudent', () => {
    it("selects the student, then opens the app's student view", async () => {
        // The app names its student view once (`students.view`); a view that opens a
        // student must land there with the student already selected, so the student
        // view seeds from it.
        const onNavigate = vi.fn(async () => {});
        const options = { ...viewOptions(), onNavigate, studentView: 'pupil' };
        const view = await mountModule(
            View.create('view', /** @type {View['options']} */ (/** @type {unknown} */ (options))),
        );
        /** @type {Array<string|null>} */
        const selectedOnNavigate = [];
        onNavigate.mockImplementation(async () => {
            selectedOnNavigate.push(options.appState.currentStudentId.peek());
        });

        view.open('s-7');

        expect(onNavigate).toHaveBeenCalledWith('pupil', {});
        expect(selectedOnNavigate).toEqual(['s-7']);
    });

    it('only selects the student inside the student view', async () => {
        const onNavigate = vi.fn(async () => {});
        // The student view shows a student: one of a group without any shows no view.
        const options = {
            ...viewOptions({ currentStudentId: 's-1' }),
            onNavigate,
            studentView: 'pupil',
            viewKey: 'pupil',
        };
        const view = await mountModule(
            View.create('view', /** @type {View['options']} */ (/** @type {unknown} */ (options))),
        );

        view.open('s-7');

        expect(onNavigate).not.toHaveBeenCalled();
        expect(options.appState.currentStudentId.peek()).toBe('s-7');
    });

    it('fails loud in an app without a student view', async () => {
        const options = { ...viewOptions(), onNavigate: vi.fn(async () => {}) };
        const view = await mountModule(
            View.create('view', /** @type {View['options']} */ (/** @type {unknown} */ (options))),
        );

        expect(() => view.open('s-7')).toThrow('the app has no student view to open');
        expect(options.appState.currentStudentId.peek()).toBeNull();
    });
});
