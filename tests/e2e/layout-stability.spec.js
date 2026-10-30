/**
 * E2E tests: nothing a dashboard shows moves once it is on screen.
 *
 * From the cold load, and then from each navigation to every view (once on first open,
 * once on a revisit, by its hash as a link drives the router), every frame samples the
 * box of every painted element, except the shared header (it names the view it shows)
 * and anything still under a render cover or a placeholder. An element whose box changes
 * after it was first painted fails: a table seen for a frame at the column widths it was
 * hidden with, a card that grows once a sibling syncs it after the reveal.
 *
 * 1440×900: wide enough for the shell's single-row header, narrow enough that a long
 * nav-card label wraps. Scrollbars shown, which headless Chrome hides by default: a
 * table body's scrollbar that comes and goes moves every column by its width.
 */

import { test, expect } from './support/test.js';
import { gotoApp, VIEW_BUSY_SELECTOR } from './support/app.js';
import { collectErrors, assertNoPageErrors } from './support/pageErrors.js';
import { VIEWS } from './support/views.js';

const VIEWPORT = { width: 1440, height: 900 };

/** Frames in a row without a change, once the view is ready, that end a sample. */
const QUIET_FRAMES = 20;
/** The longest a sample runs, whatever the page does. */
const SAMPLE_CAP_MS = 3000;
/** A box that moved less than this did not move (waitForLayout.js `BOX_TOLERANCE_PX`). */
const BOX_TOLERANCE_PX = 0.5;

/**
 * The page as `installSampler` leaves it.
 * @typedef {Window & {
 *     sampleLayout: (start: () => void) => Promise<string[]>,
 *     coldLoad: Promise<string[]>,
 * }} SamplerWindow
 */

/**
 * Installed before any page script: `window.sampleLayout(start)` calls `start` (a
 * navigation) on the first frame, samples until the page is ready and still, and resolves
 * with each element whose box changed after it was first painted; a page still busy
 * at the cap is reported too.
 * @param {{quietFrames: number, capMs: number, tolerance: number, busy: string}} limits
 */
function installSampler({ quietFrames, capMs, tolerance, busy }) {
    const EXCLUDED = 'tba-header, [data-view-rendering], .view-skeleton, #app-skeleton';

    /** @param {Element} element */
    const label = (element) => {
        const owner = element.parentElement?.closest('[data-tba-module]');
        const classes = [...element.classList].slice(0, 2).map((name) => `.${name}`);
        const own = `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${classes.join('')}`;
        return owner ? `${own} in ${owner.tagName.toLowerCase()}#${owner.id}` : own;
    };
    /** @type {WeakSet<Element>} */
    const painting = new WeakSet();
    /**
     * Whether the element puts something of its own on screen: text, a replaced
     * element, SVG, or a box with a background or a border. An empty box that moves
     * (a view shell before its view renders) is not seen moving. Only a yes is kept: an
     * empty element can get its text later.
     * @param {Element} element
     */
    const paints = (element) => {
        if (painting.has(element)) return true;
        const style = getComputedStyle(element);
        const result =
            element instanceof SVGElement ||
            ['IMG', 'CANVAS', 'INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName) ||
            [...element.childNodes].some(
                (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
            ) ||
            style.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
            style.backgroundImage !== 'none' ||
            ['top', 'right', 'bottom', 'left'].some(
                (side) =>
                    style.getPropertyValue(`border-${side}-style`) !== 'none' &&
                    parseFloat(style.getPropertyValue(`border-${side}-width`)) > 0,
            );
        if (result) painting.add(element);
        return result;
    };
    /** @param {DOMRect} box */
    const round = (box) => [box.x, box.y, box.width, box.height].map(Math.round).join(',');
    /** @param {DOMRect} a @param {DOMRect} b */
    const moved = (a, b) =>
        /** @type {const} */ (['x', 'y', 'width', 'height']).some(
            (key) => Math.abs(a[key] - b[key]) > tolerance,
        );

    /** @type {(start: () => void) => Promise<string[]>} */
    const sampleLayout = (start) =>
        new Promise((resolve) => {
            /** @type {Map<Element, DOMRect>} */
            const last = new Map();
            /** @type {Map<Element, string>} */
            const offenders = new Map();
            const begin = performance.now();
            let quiet = 0;
            const tick = () => {
                let changed = false;
                for (const element of document.body.querySelectorAll('*')) {
                    const box = element.getBoundingClientRect();
                    if (
                        (box.width === 0 && box.height === 0) ||
                        element.closest(EXCLUDED) ||
                        !element.checkVisibility() ||
                        !paints(element)
                    ) {
                        last.delete(element);
                        continue;
                    }
                    const previous = last.get(element);
                    if (previous && moved(previous, box)) {
                        changed = true;
                        offenders.set(
                            element,
                            `${label(element)}: ${round(previous)} → ${round(box)}`,
                        );
                    }
                    last.set(element, box);
                }
                const isBusy = document.querySelector(busy) !== null;
                quiet = changed || isBusy ? 0 : quiet + 1;
                if (quiet >= quietFrames) {
                    resolve([...offenders.values()]);
                } else if (performance.now() - begin > capMs) {
                    resolve([
                        ...offenders.values(),
                        `never settled within ${capMs} ms (${isBusy ? 'still busy' : 'still moving'})`,
                    ]);
                } else {
                    requestAnimationFrame(tick);
                }
            };
            requestAnimationFrame(() => {
                start();
                tick();
            });
        });
    Object.assign(window, { sampleLayout });
    // The cold load is sampled from the first frame that has a body.
    document.addEventListener('DOMContentLoaded', () => {
        Object.assign(window, { coldLoad: sampleLayout(() => {}) });
    });
}

test.use({ viewport: VIEWPORT, launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

for (const [app, views] of Object.entries(VIEWS)) {
    test(`${app}: nothing moves after it is shown, on cold load, first open or revisit`, async ({
        page,
    }) => {
        const { pageErrors } = collectErrors(page);
        await page.addInitScript(installSampler, {
            quietFrames: QUIET_FRAMES,
            capMs: SAMPLE_CAP_MS,
            tolerance: BOX_TOLERANCE_PX,
            busy: VIEW_BUSY_SELECTOR,
        });
        await gotoApp(page, `/${app}/`);

        /** @type {string[]} */
        const failures = [];
        /**
         * @param {string} label
         * @param {string[]} offenders
         */
        const record = (label, offenders) => {
            if (offenders.length > 0) failures.push(`${label}:\n    ${offenders.join('\n    ')}`);
        };

        record(
            `${app} cold load`,
            await page.evaluate(
                () => /** @type {SamplerWindow} */ (/** @type {unknown} */ (window)).coldLoad,
            ),
        );
        await page.evaluate(() => document.fonts.ready);
        const start = await page.evaluate(() => location.hash.slice(1));
        for (const [pass, list] of Object.entries({
            'first open': views.filter((view) => view !== start),
            revisit: views,
        })) {
            for (const view of list) {
                const offenders = await page.evaluate(
                    (target) =>
                        /** @type {SamplerWindow} */ (/** @type {unknown} */ (window)).sampleLayout(
                            () => {
                                location.hash = target;
                            },
                        ),
                    view,
                );
                record(`${app}/${view} (${pass})`, offenders);
            }
        }

        expect(failures, failures.join('\n')).toEqual([]);
        assertNoPageErrors(pageErrors);
    });
}
