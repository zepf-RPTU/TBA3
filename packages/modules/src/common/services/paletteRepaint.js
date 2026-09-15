/**
 * paletteRepaint — the redraw a palette change asks for without knowing who draws.
 *
 * A KS theme switch, a colour-scheme switch and a freshly registered competence
 * scale all change how bands are painted outside the active view tree, where
 * `onThemeChanged()` never reaches. The services that own those switches used to
 * call the band-thumbnail renderer directly, which pointed a service at a UI module
 * and dragged d3 in behind it. Here the host says what to redraw, once.
 */

/** @type {() => void} */
let repaint = () => {};

/**
 * Register the redraw every palette change should trigger. A host that registers
 * none simply has nothing painted outside its views.
 * @param {() => void} handler - Runs after each KS theme, colour scheme or scale registration.
 */
export function setPaletteRepaint(handler) {
    repaint = handler;
}

/**
 * Run the registered redraw.
 */
export function notifyPaletteRepaint() {
    repaint();
}
