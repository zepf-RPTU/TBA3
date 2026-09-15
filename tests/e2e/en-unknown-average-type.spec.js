/**
 * E2E test: a comparison average of an unrecognised value-group `type` renders.
 *
 * The API spec types `value-group.type` as an open string ("Art der Wertegruppe,
 * z.B. `group`, `student`, `school`"), so an exporter can legitimately ship a
 * comparison population this client has no shape, colour or glossary term for —
 * a Bezirksschnitt, a Regionsschnitt, a corrected state mean under a new key.
 *
 * Every EN and MA reader used to enumerate `school`/`state` and **throw** on
 * anything else (or, in the two style charts, silently filter it out). A single
 * unfamiliar row therefore took the whole dashboard down, or made a delivered
 * reference population invisible with no indication that it had been dropped.
 * Both are worse failures than drawing it generically: the exporter's data is
 * the authority on which populations exist, not the client's shape table.
 *
 * The fixture is injected over `8a_mid` at the network layer rather than being
 * derived into `data/`, so this runs on a plain checkout and no shipped dataset
 * grows a comparison population that does not exist.
 */

import { test, expect } from './support/test.js';
import { gotoApp, LOAD_TIMEOUT } from './support/app.js';

/** The unrecognised comparison group, cloned off the payload's own Landesschnitt rows. */
const UNKNOWN_TYPE = 'district';
const UNKNOWN_ID = 'bezirk-1';
const UNKNOWN_NAME = 'Bezirksschnitt';

/**
 * Serve `8a_mid` with one extra value group whose `type` the client does not know.
 * Cloning the state rows keeps every field the readers require present and valid,
 * so the only thing under test is the unfamiliar `type`.
 */
async function injectUnknownComparisonType(page) {
    for (const file of ['aggregation.json', 'items.json']) {
        await page.route(`**/data/en/8a_mid/${file}`, async (route) => {
            const response = await route.fetch();
            const payload = await response.json();

            const cloned = payload
                .filter((entry) => entry.type === 'state')
                .map((entry) => ({
                    ...structuredClone(entry),
                    id: UNKNOWN_ID,
                    type: UNKNOWN_TYPE,
                    name: UNKNOWN_NAME,
                }));
            expect(cloned.length, `${file} must ship state rows to clone`).toBeGreaterThan(0);

            await route.fulfill({ json: [...payload, ...cloned] });
        });
    }
}

async function openOverview(page) {
    await injectUnknownComparisonType(page);
    await gotoApp(page, '/en/?class=8a_mid');
    await page.locator('#overviewViewButton').click();
    await page
        .locator('#en-overview-scatterplot svg')
        .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });
}

test('the scatterplot draws an unknown comparison type instead of failing to load', async ({
    page,
}) => {
    // WHY: this is the defect itself. `parseStyleAggregation` threw on the unfamiliar
    // type, so the chart never rendered at all — one unknown row cost the user every
    // average on the page, including the school and state ones the client does know.
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await openOverview(page);

    const marker = page.locator(
        `#en-overview-scatterplot .comparison-average-point[data-group-id="${UNKNOWN_ID}"]`,
    );
    await expect(marker, 'the unknown group gets its own marker').toHaveCount(1);
    expect(pageErrors, 'an unrecognised type is not an error').toEqual([]);

    // The populations the client does recognise must be untouched by its arrival.
    for (const id of ['school', 'state']) {
        await expect(
            page.locator(
                `#en-overview-scatterplot .comparison-average-point[data-group-id="${id}"]`,
            ),
            `marker for ${id}`,
        ).toHaveCount(1);
    }
});

test('the unknown type is drawn as a cross, distinct from the school and state marks', async ({
    page,
}) => {
    // WHY: rendering it is only half the job. School is a diamond and state a square;
    // if the catch-all reused either shape the plot would show two populations under
    // one mark and the reader would have no way to tell which value belongs to whom —
    // the "cardinality without identity" failure the ordinal work already fixed for
    // multiple Landesschnitte.
    await openOverview(page);

    const shapes = await page
        .locator('#en-overview-scatterplot .comparison-average-point')
        .evaluateAll((nodes) =>
            nodes.map((node) => ({
                id: node.getAttribute('data-group-id'),
                tag: node.tagName.toLowerCase(),
                points: (node.getAttribute('d') ?? '').split(/[ML]/).filter(Boolean).length,
                fill: node.style.fill,
            })),
        );

    const byId = Object.fromEntries(shapes.map((shape) => [shape.id, shape]));

    // The square is the one `rect`; diamond and cross are paths, told apart by their
    // vertex count (4 vs 12) — the property that makes them different silhouettes.
    expect(byId.state.tag).toBe('rect');
    expect(byId.school.tag).toBe('path');
    expect(byId.school.points).toBe(4);
    expect(byId[UNKNOWN_ID].tag).toBe('path');
    expect(byId[UNKNOWN_ID].points).toBe(12);

    // Every marker must actually be painted. WHY: the chart looks up its fill by the
    // role's `colorKey`, and the two EN charts that hand-build a colour subset once
    // omitted the catch-all key — `undefined` reaches `.style('fill', …)` as a no-op,
    // so the cross silently kept the SVG default black and read as a Schulschnitt. A
    // "all fills differ" check passes on that, because '' differs from every colour.
    for (const { id, fill } of shapes) {
        expect(fill, `${id} is painted`).toMatch(/^rgb/);
    }

    // A shared colour would undo the shape distinction at a glance.
    expect(new Set(shapes.map((shape) => shape.fill)).size).toBe(shapes.length);
});

test('the unknown type gets a legend entry naming it, with no borrowed glossary term', async ({
    page,
}) => {
    // WHY: an unlabelled new mark is a puzzle. The payload's own name is the only
    // identity it has, so it must reach the legend verbatim. It must NOT inherit a
    // glossary key: the earlier fallback pointed unrecognised types at "Klassenschnitt",
    // which would define a district average as the class's own.
    await openOverview(page);

    const legend = page.locator('#en-overview-scatterplot .comparison-legend');
    const labels = await legend.locator('text').allTextContents();
    expect(labels).toEqual(['Schulschnitt', 'Landesschnitt', UNKNOWN_NAME]);

    const glossaryKeys = await legend
        .locator('[data-glossary-key]')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-glossary-key')));
    expect(glossaryKeys, 'no glossary term is claimed for an unknown population').not.toContain(
        'klassenschnitt',
    );
});

test('the item lollipop draws the unknown type too, so the marker means one thing', async ({
    page,
}) => {
    // WHY: the shape vocabulary is only readable if it is the same everywhere. A cross
    // in the scatterplot and nothing in the item view would teach the reader that the
    // population exists only on one screen.
    await injectUnknownComparisonType(page);
    await gotoApp(page, '/en/?class=8a_mid');
    await page.locator('#itemViewButton').click();
    await page
        .locator('#item-itemLollipop svg')
        .waitFor({ state: 'visible', timeout: LOAD_TIMEOUT });

    const markers = page.locator('#item-itemLollipop .comparison-average-marker');
    await expect(markers.first()).toBeAttached();

    const vertexCounts = await markers.evaluateAll((nodes) => [
        ...new Set(
            nodes
                .filter((node) => node.tagName.toLowerCase() === 'path')
                .map((node) => (node.getAttribute('d') ?? '').split(/[ML]/).filter(Boolean).length),
        ),
    ]);

    // 4 = the school diamonds that were always there, 12 = the new catch-all crosses.
    expect(vertexCounts.sort((a, b) => a - b)).toEqual([4, 12]);
});
