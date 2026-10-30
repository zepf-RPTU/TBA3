/**
 * Accessibility: the desktop sweep again, on the dark colour scheme.
 *
 * The dark scheme is a second set of surface, ink and data-colour values (the dark half
 * of every `light-dark()` token, the dark ramp stops behind `getRampStops` in
 * colorRamp.js), so every contrast finding has a dark twin. Only the
 * stored preference differs from accessibility.spec.js, seeded before the app boots.
 */

import { test } from './support/test.js';
import { sweepViews } from './support/axe.js';

sweepViews(test, { label: 'the dark scheme', scheme: 'dark' });
sweepViews(test, {
    label: 'the dark scheme, chart tables shown',
    scheme: 'dark',
    chartTables: true,
});
