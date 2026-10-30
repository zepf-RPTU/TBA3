/**
 * The e2e waits, apart from the fixtures so playwright.config.js can read them.
 */

/** How long a dashboard may take to boot; also the config's navigation timeout. */
export const LOAD_TIMEOUT_MS = 20_000;
/** How long a chart may take to draw or redraw after an interaction. */
export const RENDER_TIMEOUT_MS = 10_000;
/**
 * How long a control may take to appear once the interaction that reveals it has run:
 * for the `waitFor` calls that should give up before the action timeout does.
 */
export const REVEAL_TIMEOUT_MS = 5_000;
