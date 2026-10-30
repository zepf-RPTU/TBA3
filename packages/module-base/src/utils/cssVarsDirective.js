/**
 * `cssVars(vars)`: run-time custom properties on an element a lit-html template renders,
 * `<div ${cssVars({ '--legend-pill-columns': 3 })}>`.
 *
 * The CSP allows no `style` attribute, and lit's own `styleMap` writes one on its first
 * render (it sets the attribute, and only later updates go through CSSOM). This sets
 * every property through `style.setProperty` from the first render on, and removes one
 * a re-render no longer names. Only custom properties, as with `cssVarsAttr`.
 */

import { noChange } from 'lit';
import { Directive, PartType, directive } from 'lit/directive.js';

/** @augments Directive */
class CssVarsDirective extends Directive {
    /** @type {Set<string>} The properties the last render set. */
    #names = new Set();

    /** @param {import('lit/directive.js').PartInfo} partInfo */
    constructor(partInfo) {
        super(partInfo);
        if (partInfo.type !== PartType.ELEMENT) {
            throw new Error('cssVars() sits in an element tag: <div ${cssVars({...})}>');
        }
    }

    /**
     * @param {{[name: string]: string | number | null | undefined}} vars - Custom property (`--…`) to value; nullish leaves it unset.
     * @returns {typeof noChange} Nothing to render; `update` writes the properties.
     */
    // eslint-disable-next-line no-unused-vars
    render(vars) {
        return noChange;
    }

    /**
     * @override
     * @param {import('lit').ElementPart} part
     * @param {[{[name: string]: string | number | null | undefined}]} args - The `render` arguments.
     * @returns {typeof noChange}
     */
    update(part, [vars]) {
        const { style } = /** @type {HTMLElement} */ (part.element);
        /** @type {Set<string>} */
        const names = new Set();
        for (const [name, value] of Object.entries(vars)) {
            if (!name.startsWith('--'))
                throw new Error(`cssVars() sets custom properties, not ${name}`);
            if (value == null) continue;
            style.setProperty(name, String(value));
            names.add(name);
        }
        for (const name of this.#names) {
            if (!names.has(name)) style.removeProperty(name);
        }
        this.#names = names;
        return noChange;
    }
}

/** Set custom properties on the element the directive sits on, through CSSOM. */
export const cssVars = directive(CssVarsDirective);
