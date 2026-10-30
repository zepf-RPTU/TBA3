/**
 * Accessibility: axe-core over every dashboard view.
 *
 * BITV 2.0 (the German public-sector implementation of WCAG 2.1 AA) applies to a tool
 * schools are given, so any `serious` or `critical` violation fails; lower impacts are
 * logged without failing the run.
 *
 * The desktop pass: the context reports `hover: hover` / `pointer: fine`. The
 * coarse-pointer rules only resize, so the routed DOM is the same on touch;
 * accessibility-surfaces.spec.js covers the touch-only surfaces and the ones that open
 * only on interaction.
 */

import { test } from './support/test.js';
import { sweepViews } from './support/axe.js';

sweepViews(test);
sweepViews(test, { label: 'chart tables shown', chartTables: true });
