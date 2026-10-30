/**
 * Every test file loads Lit afresh, and Lit's development build announces itself in
 * each one. Muting that one notice by its code keeps the real dev warnings (a class
 * field shadowing a reactive property, an update scheduled after an update) visible.
 */
const lit = /** @type {{litIssuedWarnings?: Set<string>}} */ (globalThis);
(lit.litIssuedWarnings ??= new Set()).add('dev-mode');
