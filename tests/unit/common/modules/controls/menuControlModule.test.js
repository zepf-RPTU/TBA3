// @vitest-browser
/**
 * The menu control replaces a select where a choice reloads the page: an arrow key on
 * the closed control must choose nothing, and after the reload the focus comes back.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { userEvent } from 'vitest/browser';
import { MenuControlModule } from '../../../../../src/common/modules/controls/menuControlModule.js';
import { restoreScopeSwitchFocus } from '../../../../../src/common/app/scopeSearchParams.js';
import { createTestAppContext } from '../../../support/glossaryFixture.js';

const context = createTestAppContext('en');

const items = [
    { value: '8a', label: '8a' },
    { value: '8b', label: '8b' },
];

/** @returns {Promise<{control: MenuControlModule, onChange: ReturnType<typeof vi.fn>, trigger: HTMLButtonElement}>} */
async function mountControl() {
    const onChange = vi.fn();
    const control = MenuControlModule.create('test-menu', {
        context,
        items,
        value: '8a',
        label: 'Lerngruppe',
        onChange,
    });
    document.body.appendChild(control);
    await control.updateComplete;
    const trigger = /** @type {HTMLButtonElement} */ (control.querySelector('button'));
    return { control, onChange, trigger };
}

afterEach(() => {
    document.body.replaceChildren();
});

describe('MenuControlModule', () => {
    it('chooses nothing on an arrow key at the closed control, only on a pick', async () => {
        const { control, onChange, trigger } = await mountControl();
        expect(trigger.getAttribute('aria-label')).toBe('Lerngruppe: 8a');

        trigger.focus();
        await userEvent.keyboard('{ArrowDown}');
        expect(onChange).not.toHaveBeenCalled();

        trigger.click();
        const pick = /** @type {HTMLButtonElement} */ (
            [...control.querySelectorAll('[role="menuitemradio"]')].find(
                (item) => item.textContent?.trim() === '8b',
            )
        );
        pick.click();
        await control.updateComplete;

        expect(onChange).toHaveBeenCalledExactlyOnceWith({ value: '8b' });
        expect(trigger.getAttribute('aria-label')).toBe('Lerngruppe: 8b');
    });

    it('takes the focus back after the reload a dataset switch caused', async () => {
        const { trigger } = await mountControl();
        // What navigateToScope stores before it reloads the page: the control's id.
        sessionStorage.setItem('tba3:scope-switch-focus', JSON.stringify({ id: 'test-menu' }));

        restoreScopeSwitchFocus();

        expect(document.activeElement).toBe(trigger);
        // A one-shot: the next load has nothing to restore.
        expect(JSON.parse(sessionStorage.getItem('tba3:scope-switch-focus') ?? 'null')).toBeNull();
    });
});
