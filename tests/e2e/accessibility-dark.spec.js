/**
 * Accessibility: the desktop sweep again, on the dark colour scheme.
 *
 * The dark scheme is a second set of surface, ink and data-colour tokens
 * (`html[data-color-scheme='dark']` in variables.css, `RAMP_STOPS.dark` in colorRamp.js),
 * so every contrast finding the light pass would catch has a dark twin this pass has to
 * catch. Same views, same rules, same impact policy as accessibility.spec.js; only the
 * stored preference differs, seeded before the app boots so the first paint is dark.
 */

import { test } from './support/test.js';
import { sweepViews } from './support/axe.js';

sweepViews(test, { label: 'the dark scheme', scheme: 'dark' });
