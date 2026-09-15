import { setHeaderActionButtonAttributes } from '@tba3/module-base';

/**
 * Creates a toggleable header icon button (e.g. HeaderModule's info/notes
 * buttons). Click wiring is left to the caller since it typically needs
 * resource-tracked cleanup (e.g. BaseModule's `this.resources.trackDomListener`).
 * @param {object} options - The button’s label, icon and initial state.
 * @param {string} [options.ariaLabel] - Accessible label.
 * @param {string} options.svgMarkup - Inline SVG for the icon.
 * @param {boolean} [options.isActive=false] - Whether it starts toggled on.
 * @param {Record<string, string>} [options.buttonAttributes] - Extra attributes, e.g. the `data-header-action-button` hook a tour step anchors to.
 * @returns {HTMLButtonElement} The button, unwired — the caller owns the click listener so it can be resource-tracked.
 */
export function createToggleIconButton({
    ariaLabel,
    svgMarkup,
    isActive = false,
    buttonAttributes = {},
}) {
    const button = document.createElement('button');
    setHeaderActionButtonAttributes(button, {
        ariaLabel,
        tooltipText: undefined,
        buttonAttributes: { ...buttonAttributes, 'aria-pressed': String(isActive) },
    });
    button.innerHTML = svgMarkup;
    return button;
}

/**
 * Syncs a toggle icon button's visual/ARIA active state.
 * @param {HTMLButtonElement} button - The button to restyle.
 * @param {boolean} isActive - Whether the thing it toggles is currently on.
 */
export function setToggleIconButtonState(button, isActive) {
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
}
