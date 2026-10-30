/**
 * Wait for the page to stop moving: the settle signal the specs use instead of a fixed
 * sleep.
 *
 * Settled means the web fonts are in, two frames have passed (so a render queued for
 * the next frame has run) and then, for `STABLE_FRAMES` frames in a row, nothing moves:
 * no d3 transition is scheduled or running on any node (d3 keeps `__transition` on a
 * node until its last transition ends), no finite Web Animation — a CSS transition or
 * animation — is running, nothing scrolled (a smooth `scrollIntoView` is no Web
 * Animation), and nothing is `aria-busy`: a chart host in its render cycle, or a chart
 * whose resize redraw still waits behind the resize debounce. Infinite animations (a
 * spinner) never end and are not waited for.
 */

/** Consecutive still frames that count as settled. */
const STABLE_FRAMES = 3;
/** Frames after which the page counts as never settling, about ten seconds. */
const MAX_FRAMES = 600;

/**
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>} Resolves once the page is still; rejects when it never is.
 */
export async function waitForSettled(page) {
    await page.evaluate(
        ({ stableFrames, maxFrames }) =>
            new Promise((resolve, reject) => {
                const isMoving = () =>
                    document.querySelector('[aria-busy="true"]') !== null ||
                    document
                        .getAnimations()
                        .some(
                            (animation) =>
                                animation.playState === 'running' &&
                                animation.effect?.getComputedTiming().endTime !== Infinity,
                        ) ||
                    [...document.querySelectorAll('*')].some(
                        (element) =>
                            /** @type {Element & {__transition?: object}} */ (element).__transition,
                    );

                let frame = 0;
                let still = 0;
                let scrolled = false;
                // Capture sees every element's scroll, which does not bubble.
                const onScroll = () => {
                    scrolled = true;
                };
                document.addEventListener('scroll', onScroll, { capture: true, passive: true });
                const tick = () => {
                    frame += 1;
                    // The first two frames only let a queued render run.
                    if (frame > 2) {
                        still = !scrolled && !isMoving() ? still + 1 : 0;
                    }
                    scrolled = false;
                    if (still >= stableFrames) {
                        document.removeEventListener('scroll', onScroll, { capture: true });
                        resolve(undefined);
                    } else if (frame >= maxFrames) {
                        document.removeEventListener('scroll', onScroll, { capture: true });
                        reject(new Error(`The page never settled within ${maxFrames} frames`));
                    } else {
                        requestAnimationFrame(tick);
                    }
                };
                document.fonts.ready.then(() => requestAnimationFrame(tick));
            }),
        { stableFrames: STABLE_FRAMES, maxFrames: MAX_FRAMES },
    );
}
