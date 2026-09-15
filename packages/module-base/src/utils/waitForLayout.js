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
 * A promise that resolves after a delay.
 * @param {number} ms - Delay in milliseconds.
 * @returns {Promise<void>} Resolves once the timer fires.
 */
function waitForTimeout(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A promise that resolves on the next animation frame, or on a timeout.
 * The race matters in a background tab, where frames stop firing entirely and an
 * unguarded wait would never settle.
 * @returns {Promise<void>} Resolves on whichever comes first.
 */
function waitForAnimationFrame() {
    return Promise.race([
        new Promise((resolve) => requestAnimationFrame(resolve)),
        waitForTimeout(FRAME_TIMEOUT_MS),
    ]);
}

/**
 * Wait briefly for font metrics, so a box measured before the webfont lands is not stale.
 * @param {number} timeoutMs - Cap in milliseconds; the wait is abandoned after it.
 */
async function waitForFontsReady(timeoutMs) {
    if (!document.fonts?.ready || timeoutMs <= 0) return;

    try {
        await Promise.race([document.fonts.ready, waitForTimeout(timeoutMs)]);
    } catch {
        // Font readiness is an optimization; layout sampling below is the fallback.
    }
}

/**
 * Sample an element's layout box.
 * @param {HTMLElement} element - Element to measure.
 * @returns {{left: number, top: number, width: number, height: number}} Its current box.
 */
function readElementBox(element) {
    const rect = element.getBoundingClientRect();
    return {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
    };
}

/**
 * Whether two samples of a box agree to within a pixel tolerance.
 * @param {object|null} previous - The earlier sample.
 * @param {object|null} next - The later sample.
 * @param {number} tolerance - Largest difference still treated as unchanged.
 * @returns {boolean} False when either sample is missing.
 */
function isStableBox(previous, next, tolerance) {
    if (!previous || !next) return false;
    return (
        Math.abs(previous.left - next.left) <= tolerance &&
        Math.abs(previous.top - next.top) <= tolerance &&
        Math.abs(previous.width - next.width) <= tolerance &&
        Math.abs(previous.height - next.height) <= tolerance
    );
}

/**
 * Whether a sampled box has real extent — a zero box means the element has not laid out yet.
 * @param {object|null} box - The sample to test.
 * @returns {boolean} True when both dimensions are above zero.
 */
function isUsableBox(box) {
    return box && box.width > 0 && box.height > 0;
}

/**
 * Waits until an element's layout box is non-zero and stable across frames.
 * Resolves with the last sampled box and falls back after a bounded number of frames.
 * @param {HTMLElement} element - Element whose box should settle.
 * @param {object} [options] - How long to sample for, and how strict "settled" is.
 * @param {number} [options.stableFrames=2] - Consecutive stable samples required.
 * @param {number} [options.maxFrames=18] - Maximum animation frames to sample.
 * @param {number} [options.tolerance=0.5] - Pixel tolerance for box differences.
 * @param {boolean} [options.waitForFonts=true] - Wait briefly for font metrics first.
 * @param {number} [options.fontTimeoutMs=250] - Font wait cap in milliseconds.
 * @returns {Promise<{left:number, top:number, width:number, height:number}|null>} The last sampled box, or null when the element cannot be measured.
 */
export async function waitForStableElementBox(element, options = {}) {
    if (!element?.getBoundingClientRect) {
        await waitForLayout();
        return null;
    }

    const {
        stableFrames = 2,
        maxFrames = 18,
        tolerance = 0.5,
        waitForFonts = true,
        fontTimeoutMs = 250,
    } = options;

    if (waitForFonts) {
        await waitForFontsReady(fontTimeoutMs);
    }

    let previousBox = null;
    let lastBox = null;
    let stableCount = 0;

    for (let frame = 0; frame < maxFrames; frame++) {
        await waitForAnimationFrame();

        if (!element.isConnected) return lastBox;

        const nextBox = readElementBox(element);
        lastBox = nextBox;

        if (isUsableBox(nextBox) && isStableBox(previousBox, nextBox, tolerance)) {
            stableCount += 1;
            if (stableCount >= stableFrames) {
                return nextBox;
            }
        } else {
            stableCount = 0;
        }

        previousBox = nextBox;
    }

    return lastBox;
}
