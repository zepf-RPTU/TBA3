/**
 * Shared chart interaction helpers.
 *
 * ChartRenderer remains the public facade. These helpers own generic D3 hover
 * effect application and cursor-following tooltip event wiring.
 */

import * as d3 from 'd3';

const CSS_PROPERTIES = new Set([
    'opacity',
    'filter',
    'transform',
    'cursor',
    'visibility',
    'display',
    'pointer-events',
    'transition',
]);

export const DEFAULT_CHART_HOVER_OPACITY = 0.8;

/**
 * The standard hover effect: dim on enter, restore on leave.
 * @param {object} [options] - Opacity overrides for the two states.
 * @param {number} [options.enterOpacity] - Opacity while hovered.
 * @param {number} [options.leaveOpacity=1] - Opacity once the pointer leaves.
 * @returns {{enter: object, leave: object}} An effect config for `applyHoverEffect`.
 */
export function createOpacityHoverEffect({
    enterOpacity = DEFAULT_CHART_HOVER_OPACITY,
    leaveOpacity = 1,
} = {}) {
    return {
        enter: { opacity: enterOpacity },
        leave: { opacity: leaveOpacity },
    };
}

/**
 * Apply one hover effect’s attributes and styles to an element.
 * @param {*} element - The element or selection to restyle.
 * @param {object|null} effectConfig - The attrs/styles to apply; a nullish config is a no-op.
 * @param {object} data - Data bound to the element, passed to any accessor in the config.
 * @param {object} [options] - Whether to transition, for how long, and the transition factory to use.
 * @returns {*} The element the effect was applied to, or null when there was no config.
 */
export function applyHoverEffect(element, effectConfig, data, options = {}) {
    if (!effectConfig) return null;

    const { useTransition = false, duration = null, transition = null } = options;

    const selection = d3.select(element);
    const target =
        useTransition && typeof transition === 'function'
            ? transition(selection, duration)
            : selection;

    Object.entries(effectConfig).forEach(([property, value]) => {
        const resolvedValue = typeof value === 'function' ? value(data) : value;
        if (CSS_PROPERTIES.has(property)) {
            target.style(property, resolvedValue);
        } else {
            target.attr(property, resolvedValue);
        }
    });

    return target;
}

/**
 * Wire pointer events on a selection so it shows, follows and hides a tooltip.
 * @param {d3.Selection} selection - The marks to make hoverable.
 * @param {object} [options] - How the tooltip content is built, and the context passed to it.
 * @param {object} [services] - The tooltip service and chart instance to route through.
 * @returns {d3.Selection} The same selection, for chaining.
 */
export function wireTooltipEvents(selection, options = {}, services = {}) {
    const {
        getTooltipContent,
        context: tooltipContext = {},
        hoverEffect = {},
        isVisible = null,
        tooltipId = null,
        onClick = null,
        cursor = onClick ? 'pointer' : null,
        interactive = false,
    } = options;
    const { createTooltip, showTooltip, moveTooltip, hideTooltip, transition = null } = services;

    const tooltip = createTooltip(tooltipId, { interactive });

    if (cursor) {
        selection.style('cursor', cursor);
    }

    selection.on('mouseenter', function (event, data) {
        if (isVisible && !isVisible(data)) return;

        if (hoverEffect.enter) {
            applyHoverEffect(this, hoverEffect.enter, data, {
                useTransition: hoverEffect.useTransition,
                duration: hoverEffect.duration,
                transition,
            });
        }

        const content = getTooltipContent(data, tooltipContext);
        showTooltip(tooltip, event, content);
    });

    selection.on('mousemove', function (event) {
        moveTooltip(tooltip, event);
    });

    selection.on('mouseleave', function (event, data) {
        if (isVisible && !isVisible(data)) return;

        if (hoverEffect.leave) {
            applyHoverEffect(this, hoverEffect.leave, data, {
                useTransition: hoverEffect.useTransition,
                duration: hoverEffect.duration,
                transition,
            });
        }

        hideTooltip(tooltip);
    });

    if (onClick) {
        selection.on('click', function (event, data) {
            onClick(data, event, this);
        });
    }

    return selection;
}
