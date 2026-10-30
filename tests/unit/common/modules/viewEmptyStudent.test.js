// @vitest-browser

import { describe, expect, it } from 'vitest';
import { html, render } from 'lit';

import { BaseViewModule } from '../../../../src/common/modules/baseViewModule.js';
import { createTestAppOptions } from '../../support/glossaryFixture.js';
import { viewOptions } from '../../support/viewOptions.js';

/**
 * A group without students: the app seeds no `currentStudentId`, so its student view has
 * no one to show and says so instead of drawing empty tables and charts — whatever the
 * app, the base decides it.
 */

/** A view that marks where it rendered itself. */
class View extends BaseViewModule {
    /** @override */
    async _renderView() {
        render(html`<p class="rendered-view">view</p>`, this);
    }
}
customElements.define('test-empty-student-view', View);

/**
 * Render a view of an app.
 * @param {string} viewKey - Which view it is.
 * @param {string|null} currentStudentId - The student the app selected, if any.
 * @param {string|undefined} studentView - The app's student view; none for an app without students.
 * @returns {Promise<View>}
 */
async function placeView(viewKey, currentStudentId, studentView) {
    const view = View.create(
        `${viewKey}-view`,
        /** @type {View['options']} */ ({
            ...createTestAppOptions('en'),
            ...viewOptions({ currentStudentId }),
            studentView,
            viewKey,
        }),
    );
    document.body.append(view);
    await view.contentComplete;
    return view;
}

describe('BaseViewModule for a group without students', () => {
    it('shows the empty-group message in place of the student view', async () => {
        const view = await placeView('pupil', null, 'pupil');

        expect(view.querySelector('.chart-message')?.textContent).toBe(
            'Für diese Lerngruppe liegen keine Ergebnisse vor.',
        );
        expect(view.querySelector('.rendered-view')).toBeNull();
        view.remove();
    });

    it('renders the student view of a student, and every other view regardless', async () => {
        const student = await placeView('pupil', 's1', 'pupil');
        const other = await placeView('overview', null, 'pupil');
        const withoutStudents = await placeView('pupil', null, undefined);

        for (const view of [student, other, withoutStudents]) {
            expect(view.querySelector('.rendered-view')).not.toBeNull();
            expect(view.querySelector('.chart-message')).toBeNull();
            view.remove();
        }
    });
});
