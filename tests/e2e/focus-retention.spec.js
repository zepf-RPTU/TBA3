/**
 * E2E tests: a control that changes what the page shows keeps the keyboard focus
 * (WCAG 2.4.3). A natively disabled button would drop it to <body>.
 */

import { test, expect } from './support/test.js';
import { gotoApp } from './support/app.js';
import { modeButton } from './support/modes.js';

test.describe('focus retention', () => {
    test('a mode switch keeps the focus on the choice Enter made', async ({ page }) => {
        await gotoApp(page, '/sl/#details');
        const byGroups = modeButton(page, 'by_groups');
        await byGroups.focus();
        await page.keyboard.press('Enter');

        await expect(byGroups).toHaveAttribute('aria-pressed', 'true');
        await expect(byGroups).toBeFocused();
        // The switch is a named group, so its choices are not read as bare toggles.
        await expect(page.getByRole('group').filter({ has: byGroups })).toHaveAttribute(
            'aria-label',
            /.+/,
        );
    });
});
