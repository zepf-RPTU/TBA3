/** Cap on one frame wait, so a background tab that stops firing frames still settles. */
const FRAME_TIMEOUT_MS = 50;

/**
 * Waits for two animation frames so layout and paint have settled.
 * @returns {Promise<void>}
 */
export function waitForLayout() {
    return waitForAnimationFrame().then(() => waitForAnimationFrame());
}

/**
 * A promise that resolves on the next animation frame, or after `FRAME_TIMEOUT_MS`;
 * whichever comes second is cancelled.
 * @returns {Promise<void>}
 */
function waitForAnimationFrame() {
    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            cancelAnimationFrame(frame);
            resolve();
        }, FRAME_TIMEOUT_MS);
        const frame = requestAnimationFrame(() => {
            clearTimeout(timer);
            resolve();
        });
    });
}

/** Cap on the wait for font metrics. */
const FONT_WAIT_MS = 250;

/**
 * Wait briefly (at most `FONT_WAIT_MS`) for font metrics, so a box measured before the
 * webfont lands is not stale.
 * @returns {Promise<void>}
 */
function waitForFontsReady() {
    const fonts = document.fonts;
    if (!fonts?.ready || fonts.status === 'loaded') return Promise.resolve();
    return new Promise((resolve) => {
        const timer = setTimeout(resolve, FONT_WAIT_MS);
        void fonts.ready.then(() => {
            clearTimeout(timer);
            resolve();
        });
    });
}

/** Largest difference between two samples of a box still treated as unchanged. */
const BOX_TOLERANCE_PX = 0.5;

/**
 * Whether two samples of a box agree to within `BOX_TOLERANCE_PX`.
 * @param {DOMRect|null} previous - The earlier sample; null before the first.
 * @param {DOMRect} next
 * @returns {boolean} False without an earlier sample.
 */
function isStableBox(previous, next) {
    if (!previous) return false;
    return (
        Math.abs(previous.left - next.left) <= BOX_TOLERANCE_PX &&
        Math.abs(previous.top - next.top) <= BOX_TOLERANCE_PX &&
        Math.abs(previous.width - next.width) <= BOX_TOLERANCE_PX &&
        Math.abs(previous.height - next.height) <= BOX_TOLERANCE_PX
    );
}

/**
 * Waits until an element's layout box is non-zero and stable across frames, giving up
 * after a bounded number of frames or once the element leaves the document.
 * @param {HTMLElement} element - A laid-out element whose box should settle.
 * @param {object} [options]
 * @param {number} [options.stableFrames=2] - Consecutive stable samples required.
 * @param {number} [options.maxFrames=18] - Maximum animation frames to sample.
 * @param {boolean} [options.waitForFonts=true] - Wait briefly (at most `FONT_WAIT_MS`) for font metrics first.
 * @returns {Promise<void>}
 */
export async function waitForStableElementBox(element, options = {}) {
    const { stableFrames = 2, maxFrames = 18, waitForFonts = true } = options;

    if (waitForFonts) {
        await waitForFontsReady();
    }

    /** @type {DOMRect|null} */
    let previousBox = null;
    let stableCount = 0;

    for (let frame = 0; frame < maxFrames; frame++) {
        await waitForAnimationFrame();

        if (!element.isConnected) return;

        // A zero box means the element has not laid out yet.
        const nextBox = element.getBoundingClientRect();
        if (nextBox.width > 0 && nextBox.height > 0 && isStableBox(previousBox, nextBox)) {
            stableCount += 1;
            if (stableCount >= stableFrames) return;
        } else {
            stableCount = 0;
        }

        previousBox = nextBox;
    }
}
