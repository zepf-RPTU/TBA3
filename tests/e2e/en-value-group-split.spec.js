/**
 * E2E test: EN draws several Landesschnitte of one type as distinct marker forms.
 *
 * The demo fixture is served with cloned state tracks, so the spec needs no dataset
 * that ships several Landesschnitte itself.
 */

import { test, expect } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT } from './support/app.js';

/**
 * Serve `8a_mid` with three more Landesschnitte cloned off its own state rows — the
 * shape a four-Bildungsgang split has, without a shipped dataset having to carry it.
 * Same `type`, distinct ids and names, so the client numbers them L1…L4.
 */
async function injectFourStateTracks(page) {
    const tracks = ['GY', 'RS', 'HS'];
    for (const file of ['aggregation.json', 'items.json']) {
        await page.route(`**/data/en/8a_mid/${file}`, async (route) => {
            const response = await route.fetch();
            const payload = await response.json();
            const stateRows = payload.filter((entry) => entry.type === 'state');
            expect(stateRows.length, `${file} must ship state rows to clone`).toBeGreaterThan(0);
            const cloned = tracks.flatMap((track) =>
                stateRows.map((entry) => ({
                    ...structuredClone(entry),
                    id: `state-${track.toLowerCase()}`,
                    name: `Landesschnitt ${track}`,
                })),
            );
            await route.fulfill({ json: [...payload, ...cloned] });
        });
    }
}

test('four Landesschnitte of one type draw as four distinct marker forms, legend included', async ({
    page,
}) => {
    // WHY: several groups of one role share a shape and a base colour; the shade step
    // alone is a colour channel. Fill mode plus centre dot give four forms — filled,
    // hollow, hollow + dot, filled + hole — so each track reads without colour, and the
    // legend swatch carries the same dot as the mark.
    await injectFourStateTracks(page);
    await gotoApp(page, '/en/?class=8a_mid');
    await page.locator('#itemViewButton').click();
    const chart = page.locator('#item-itemLollipop svg');
    await chart.waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
    await expect(chart.locator('rect.comparison-average-marker').first()).toBeAttached({
        timeout: LOAD_TIMEOUT,
    });

    const forms = await chart.evaluate((svg) => {
        const byClass = new Map();
        // The state role draws squares (`rect`); the school diamond is not part of this.
        for (const marker of svg.querySelectorAll('rect.comparison-average-marker')) {
            const own = [...marker.classList].find((c) =>
                /^comparison-average-marker-\d+$/.test(c),
            );
            if (!own || byClass.has(own)) continue;
            const hollow = marker.getAttribute('stroke-width') === '2';
            const dot = svg.querySelector(`.${own}-dot`);
            const dotKind = dot
                ? dot.getAttribute('fill') === marker.getAttribute('fill')
                    ? 'hole'
                    : 'dot'
                : 'none';
            byClass.set(own, `${hollow ? 'hollow' : 'filled'}/${dotKind}`);
        }
        return [...byClass.values()];
    });
    expect(forms.length).toBe(4);
    expect(new Set(forms).size).toBe(4);

    // Two of the four legend swatches carry a dot, like their marks.
    await expect(chart.locator('.average-legend .legend-item .marker-dot')).toHaveCount(2);
});
