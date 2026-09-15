/**
 * E2E test: the SL domain table draws one row per delivered comparison average.
 *
 * A state export may split its Landesschnitt by Abschlusstrack and ship two `state` rows
 * for every subject/domain ("Landesschnitt HSA-GK", "Landesschnitt MSA"). The table used
 * to resolve the state row with a `find()`, so it rendered the first track and silently
 * dropped the rest — while the SL competency chart on the same dashboard already drew
 * both as `L1`/`L2`. The two surfaces disagreed about how many Landesschnitte the
 * dataset contains, and the missing one had no marker, no label and no warning.
 *
 * `sl` is the single-track guard: one Landesschnitt must still produce exactly one row.
 */

import { test, expect } from './support/test.js';
import { openDomainTable, readFirstGroupLabels } from './support/slDomainTable.js';

test('sl keeps a single Landesschnitt row when the payload delivers one', async ({ page }) => {
    const wrapper = await openDomainTable(page, '/sl/?class=sl');
    const labels = (await readFirstGroupLabels(wrapper)).map((row) => row.label);

    // WHY: the multi-track work must not add a second row to datasets that ship one
    // state average — cardinality follows the payload in both directions.
    expect(labels.filter((label) => label.startsWith('Landesschnitt'))).toEqual(['Landesschnitt']);
    expect(labels.slice(0, 2)).toEqual(['Landesschnitt', 'Schule']);
});
