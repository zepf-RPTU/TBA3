/**
 * Accessibility: a touch-context spot check, one view per dashboard.
 *
 * Not a second full sweep. Nothing in `src/` branches on pointer modality at render time,
 * every `@media (pointer: coarse)` rule under `src/` only changes sizing, and no rule in the
 * enabled tag set measures element size — `target-size` is WCAG 2.2, outside AXE_TAGS. So
 * on a routed view this pass sees the same DOM the desktop pass does, and sweeping all
 * twenty views twice bought nothing.
 *
 * What it still guards is the day that stops being true: a `@media (hover: none)` or
 * `(pointer: coarse)` block that renders or hides content rather than resizing it. One
 * view per dashboard catches that, and each of the three carries a table, so the
 * coarse-pointer rule on `.tabulator-col-title` is actually in the scan.
 *
 * Surfaces that only exist after an interaction — the notes drawer, the scatterplot filter
 * modal, a glossary popup, an expanded rail, a report with cards — are not reachable from a
 * `goto` and live in accessibility-surfaces.spec.js, which uses this same touch context.
 * The modality assertion itself lives in touch-smoke.spec.js, which checks `any-hover` too.
 */

import { test } from './support/test.js';
import { sweepViews } from './support/axe.js';

test.override('touchDevice', true);
// iPad landscape, the tablet tier the assessment targets.
test.override('viewport', { width: 1180, height: 820 });

sweepViews(test, { label: 'touch', views: { en: ['class'], ma: ['class'], sl: ['overview'] } });
