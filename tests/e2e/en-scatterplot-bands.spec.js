/**
 * E2E test: the EN scatterplot's competence bands come from the payload's
 * `Äquivalenztabelle`, not from a hardcoded GER ladder.
 *
 * The demo classes' cut scores were transcribed out of a deleted constant and into
 * `data/en/8a_mid/competence-levels.json` as `equivalenceTable:TH01`; this pins that the
 * fixture is read.
 *
 * Note the chart opens zoomed to the data's range and skips labels whose band centre
 * falls outside it, so this asserts *which* labels render, never how many.
 */

import { test, expect } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT } from './support/app.js';

const SCATTERPLOT = '#en-overview-scatterplot';

const GER_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];

async function openOverview(page, classId) {
    await gotoApp(page, `/en/?class=${classId}`);
    await page.locator('#overviewViewButton').click();
    await page.locator(`${SCATTERPLOT} svg`).waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
}

/** The band labels one axis currently renders, in axis order. */
async function bandLabels(page, axis) {
    const labels = page.locator(`${SCATTERPLOT} text.ger-label-${axis}`);
    await expect(labels.first()).toBeVisible({ timeout: LOAD_TIMEOUT });
    return labels.allTextContents();
}

test('8a_mid still draws its demo bands after the tables moved into the fixture', async ({
    page,
}) => {
    // The demo classes' cut scores were transcribed out of the deleted constant and into
    // `data/en/8a_mid/competence-levels.json` as `equivalenceTable:TH01`. This is the
    // regression check that the transcription landed and the fixture is still read.
    await openOverview(page, '8a_mid');

    for (const axis of ['x', 'y']) {
        const labels = await bandLabels(page, axis);
        expect(labels.length).toBeGreaterThan(0);
        for (const label of labels) {
            expect(GER_LEVELS).toContain(label);
        }
    }
});
