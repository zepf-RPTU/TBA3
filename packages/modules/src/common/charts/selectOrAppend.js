/**
 * Every chart pass runs against the SVG already on screen, so a group that holds a layer
 * (axes, bars, a legend) is found again, not appended again. Leaves join by key
 * (`selection.data(d, key).join`); this is the one-node case, for the groups between
 * them.
 */

export const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/**
 * The child of `parent` classed `className`, appended as `tag` with that class when
 * the parent has none yet. Children only, so a nested group of the same class is
 * never mistaken for it. A new child goes last: on the first draw, call this in paint
 * order, and the group keeps its place on every draw after. What only a new child needs
 * (its first transform, a place other than last, more classes) goes in `onCreate`.
 * @template {import('d3').BaseType} P
 * @template D
 * @template {keyof SVGElementTagNameMap} K
 * @param {import('d3').Selection<P, D, any, any>} parent - One node, the group's parent.
 * @param {K} tag - The element to append, e.g. `g`.
 * @param {string} className - A class unique among the parent's children; the `class` a new child starts with.
 * @param {(child: import('d3').Selection<SVGElementTagNameMap[K], D, any, any>) => void} [onCreate] - Runs once, on a child just appended.
 * @returns {import('d3').Selection<SVGElementTagNameMap[K], D, any, any>}
 */
export function selectOrAppend(parent, tag, className, onCreate) {
    /** @type {import('d3').Selection<SVGElementTagNameMap[K], D, any, any>} */
    const found = parent.selectChild(`${tag}.${className}`);
    if (!found.empty()) return found;
    /** @type {import('d3').Selection<SVGElementTagNameMap[K], D, any, any>} */
    const child = parent
        .append(() => document.createElementNS(SVG_NAMESPACE, tag))
        .attr('class', className);
    onCreate?.(child);
    return child;
}
