/**
 * Accessibility: axe-core over every dashboard view.
 *
 * BITV 2.0 (the German public-sector implementation of WCAG 2.1 AA) applies to a tool
 * schools are given, so every view is scanned and any `serious` or `critical` violation
 * fails; no rule is exempted (see support/axe.js). Lower impacts are reported to the
 * console for the record without failing the run — they are worth fixing, not worth
 * blocking a release on.
 *
 * This is the desktop pass: the context reports `hover: hover` / `pointer: fine`, so
 * nothing behind a coarse-pointer media query is reachable from here. Its twin is
 * accessibility-touch.spec.js; the surfaces that open only on interaction are in
 * accessibility-surfaces.spec.js.
 */

import { test } from './support/test.js';
import { sweepViews } from './support/axe.js';

sweepViews(test);
